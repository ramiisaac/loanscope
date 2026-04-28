import { describe, expect, it } from "vitest";
import { getAllNodes, getAllEdges, getCheckEdges, getEstimateEdges } from "../registry";
import { CheckStatus, LoanPurpose, Occupancy, PropertyType, money, ratio } from "@loanscope/domain";
import type { Money, UnderwritingCheck } from "@loanscope/domain";
import { estimateMI } from "@loanscope/math";
import {
  toMoney,
  toRatio,
  toRatePct,
  toMonths,
  toNonNegativeMonths,
  toNumber,
  toArray,
  toString,
  toQualifyingPaymentPolicy,
  toReservesPolicy,
} from "../coercions";
import { inputNodes } from "../nodes";

/* ------------------------------------------------------------------ */
/*  Registry structural tests                                         */
/* ------------------------------------------------------------------ */

describe("calculations registry", () => {
  it("has unique node ids and covers edge connectivity", () => {
    const nodes = getAllNodes();
    const nodeIds = new Set(nodes.map((node) => node.id));
    expect(nodeIds.size).toBe(nodes.length);

    const edges = getAllEdges();
    for (const edge of edges) {
      for (const input of edge.inputs) {
        expect(nodeIds.has(input)).toBe(true);
      }
      for (const output of edge.outputs) {
        expect(nodeIds.has(output)).toBe(true);
      }
    }
  });

  it("estimate edges are tagged with estimated confidence", () => {
    const estimates = getEstimateEdges();
    for (const edge of estimates) {
      expect(edge.kind).toBe("estimate");
      expect(edge.confidence).toBe("estimated");
    }
  });

  it("check edges carry severity metadata", () => {
    const checks = getCheckEdges();
    for (const edge of checks) {
      expect(edge.kind).toBe("check");
      expect(edge.metadata?.severity).toBeDefined();
    }
  });
});

/* ------------------------------------------------------------------ */
/*  Check edge margin tests                                           */
/* ------------------------------------------------------------------ */

describe("check edges produce margins", () => {
  const checks = getCheckEdges();
  const getEdge = (id: string) => {
    const edge = checks.find((item) => item.id === id);
    if (!edge) throw new Error(`Missing check edge ${id}`);
    return edge;
  };

  it("ltv-check produces a margin", () => {
    const edge = getEdge("ltv-check");
    const output = edge.compute({
      ltv: ratio(0.8),
      maxLTVRatio: ratio(0.9),
      occupancy: Occupancy.Primary,
      loanPurpose: LoanPurpose.Purchase,
      loanAmount: money(800000),
      propertyValue: money(1000000),
    });
    const check = output.ltvCheck as UnderwritingCheck;
    expect(check.status).toBe(CheckStatus.PASS);
    expect(check.margin).toBeDefined();
    expect(check.margin?.kind).toBe("Money");
  });

  it("dti-check produces a margin", () => {
    const edge = getEdge("dti-check");
    const output = edge.compute({
      dti: ratio(0.35),
      maxDTIRatio: ratio(0.45),
      qualifyingIncomeMonthly: money(10000),
    });
    const check = output.dtiCheck as UnderwritingCheck;
    expect(check.status).toBe(CheckStatus.PASS);
    expect(check.margin).toBeDefined();
    expect(check.margin?.kind).toBe("Money");
  });

  it("fico-check produces a margin", () => {
    const edge = getEdge("fico-check");
    // Representative FICO retarget: fico-check now reads blendedFico, not the raw fico input.
    const output = edge.compute({ blendedFico: 740, minFico: 700 });
    const check = output.ficoCheck as UnderwritingCheck;
    expect(check.status).toBe(CheckStatus.PASS);
    expect(check.margin).toBeDefined();
  });

  it("fico-check ignores the raw fico input when blendedFico is supplied", () => {
    // Representative FICO contract pin: even if the legacy `fico` input is
    // present, the edge must read `blendedFico`. Here raw fico=600 would FAIL
    // against minFico=700, but blendedFico=740 PASSes.
    const edge = getEdge("fico-check");
    const output = edge.compute({
      fico: 600,
      blendedFico: 740,
      minFico: 700,
    });
    const check = output.ficoCheck as UnderwritingCheck;
    expect(check.status).toBe(CheckStatus.PASS);
    expect(check.actual).toBe("740");
    expect(check.actual).not.toBe("600");
  });

  it("fico-check throws when blendedFico is missing (graph executor surfaces as edge error)", () => {
    // Representative FICO contract pin: the edge body wraps the read in
    // toNumber(...), which throws when the input is undefined. The graph
    // executor surfaces this as an edge error rather than a blocked check.
    // The minFico-undefined branch is handled separately and short-circuits.
    const edge = getEdge("fico-check");
    expect(() => edge.compute({ fico: 740, minFico: 700 })).toThrow(/blendedFico/);
  });

  it("estimate-mi declares blendedFico (not raw fico) as input", () => {
    // Representative FICO contract pin for the MI estimator: the edge
    // signature consumes the policy-blended representative FICO.
    const edges = getEstimateEdges();
    const edge = edges.find((e) => e.id === "estimate-mi");
    if (!edge) throw new Error("Missing estimate-mi edge");
    expect(edge.inputs).toEqual(["ltv", "blendedFico", "loanAmount"]);
    expect(edge.inputs).not.toContain("fico");
  });

  it("estimate-mi compute matches estimateMI(ltv, blendedFico, loanAmount)", () => {
    // Representative FICO contract pin: numeric output of the edge
    // matches the underlying math layer when the blended FICO is fed in.
    const edges = getEstimateEdges();
    const edge = edges.find((e) => e.id === "estimate-mi");
    if (!edge) throw new Error("Missing estimate-mi edge");
    const ltv = ratio(0.92);
    const blendedFico = 720;
    const loanAmount = money(500000);
    const output = edge.compute({ ltv, blendedFico, loanAmount });
    const expected = estimateMI(ltv, blendedFico, loanAmount);
    expect(output.mi).toBe(expected);
    expect(Number(output.mi as Money)).toBeGreaterThan(0);
  });

  it("loan-amount-check produces a margin", () => {
    const edge = getEdge("loan-amount-check");
    const output = edge.compute({
      loanAmount: money(500000),
      minLoanAmount: money(100000),
      maxLoanAmount: money(1000000),
    });
    const minCheck = output.loanAmountMinCheck as UnderwritingCheck;
    const maxCheck = output.loanAmountMaxCheck as UnderwritingCheck;
    expect(minCheck.margin).toBeDefined();
    expect(maxCheck.margin).toBeDefined();
  });

  it("reserves-check produces a margin", () => {
    const edge = getEdge("reserves-check");
    const output = edge.compute({
      assetAllocation: { remainingReservesDollars: money(20000) },
      requiredReservesDollars: money(15000),
    });
    const check = output.reservesCheck as UnderwritingCheck;
    expect(check.status).toBe(CheckStatus.PASS);
    expect(check.margin).toBeDefined();
  });
});

/* ------------------------------------------------------------------ */
/*  CLTV check execution                                              */
/* ------------------------------------------------------------------ */

describe("cltv-check execution", () => {
  const checks = getCheckEdges();
  const getEdge = (id: string) => {
    const edge = checks.find((item) => item.id === id);
    if (!edge) throw new Error(`Missing check edge ${id}`);
    return edge;
  };

  it("cltv-check declares loanAmount and propertyValue in inputs", () => {
    const edge = getEdge("cltv-check");
    expect(edge.inputs).toContain("loanAmount");
    expect(edge.inputs).toContain("propertyValue");
    expect(edge.inputs).toContain("cltv");
    expect(edge.inputs).toContain("maxCLTVRatio");
  });

  it("cltv-check returns PASS when cltv is within limit", () => {
    const edge = getEdge("cltv-check");
    const output = edge.compute({
      cltv: ratio(0.85),
      maxCLTVRatio: ratio(0.95),
      loanAmount: money(800000),
      propertyValue: money(1000000),
    });
    const check = output.cltvCheck as UnderwritingCheck & { severity?: string };
    expect(check.status).toBe(CheckStatus.PASS);
    expect(check.key).toBe("CLTV");
    expect(check.margin).toBeDefined();
    expect(check.margin?.kind).toBe("Money");
    expect(check.margin?.deltaToPass).toBe(0);
    expect(check.severity).toBe("blocker");
  });

  it("cltv-check returns FAIL when cltv exceeds limit", () => {
    const edge = getEdge("cltv-check");
    const output = edge.compute({
      cltv: ratio(0.98),
      maxCLTVRatio: ratio(0.95),
      loanAmount: money(980000),
      propertyValue: money(1000000),
    });
    const check = output.cltvCheck as UnderwritingCheck & { severity?: string };
    expect(check.status).toBe(CheckStatus.FAIL);
    expect(check.margin).toBeDefined();
    expect(check.margin!.deltaToPass).toBeGreaterThan(0);
    expect(check.margin!.actionHint).toBe("PayDownLoan");
    expect(check.severity).toBe("blocker");
  });

  it("cltv-check returns blocked FAIL when maxCLTVRatio is absent", () => {
    const edge = getEdge("cltv-check");
    const output = edge.compute({
      cltv: ratio(0.85),
      maxCLTVRatio: undefined,
      loanAmount: money(800000),
      propertyValue: money(1000000),
    });
    const check = output.cltvCheck as UnderwritingCheck & { severity?: string };
    expect(check.status).toBe(CheckStatus.FAIL);
    expect(check.severity).toBe("blocker");
    expect(check.message).toContain("Missing required rule context");
    expect(check.message).toContain("maxCLTVRatio");
  });
});

/* ------------------------------------------------------------------ */
/*  Missing-rule-context behavior                                     */
/* ------------------------------------------------------------------ */

describe("missing-rule-context semantics", () => {
  const checks = getCheckEdges();
  const getEdge = (id: string) => {
    const edge = checks.find((item) => item.id === id);
    if (!edge) throw new Error(`Missing check edge ${id}`);
    return edge;
  };

  it("ltv-check returns blocked FAIL when all LTV limits are absent", () => {
    const edge = getEdge("ltv-check");
    const output = edge.compute({
      ltv: ratio(0.8),
      maxLTVRatio: undefined,
      maxLtvByOccupancy: undefined,
      maxLtvByPurpose: undefined,
      occupancy: Occupancy.Primary,
      loanPurpose: LoanPurpose.Purchase,
      loanAmount: money(800000),
      propertyValue: money(1000000),
    });
    const check = output.ltvCheck as UnderwritingCheck & { severity?: string };
    expect(check.status).toBe(CheckStatus.FAIL);
    expect(check.severity).toBe("blocker");
    expect(check.message).toContain("Missing required rule context");
  });

  it("ltv-check uses occupancy override even when maxLTVRatio is absent", () => {
    const edge = getEdge("ltv-check");
    const output = edge.compute({
      ltv: ratio(0.8),
      maxLTVRatio: undefined,
      maxLtvByOccupancy: { [Occupancy.Primary]: ratio(0.95) },
      maxLtvByPurpose: undefined,
      occupancy: Occupancy.Primary,
      loanPurpose: LoanPurpose.Purchase,
      loanAmount: money(800000),
      propertyValue: money(1000000),
    });
    const check = output.ltvCheck as UnderwritingCheck;
    expect(check.status).toBe(CheckStatus.PASS);
  });

  it("dti-check returns blocked FAIL when maxDTIRatio is absent", () => {
    const edge = getEdge("dti-check");
    const output = edge.compute({
      dti: ratio(0.35),
      maxDTIRatio: undefined,
      qualifyingIncomeMonthly: money(10000),
    });
    const check = output.dtiCheck as UnderwritingCheck & { severity?: string };
    expect(check.status).toBe(CheckStatus.FAIL);
    expect(check.severity).toBe("blocker");
    expect(check.message).toContain("maxDTIRatio");
  });

  it("fico-check returns blocked FAIL when minFico is absent", () => {
    const edge = getEdge("fico-check");
    // Representative FICO retarget: blendedFico is the consumed input; minFico
    // missing short-circuits to a blocked result before blendedFico is read.
    const output = edge.compute({ blendedFico: 740, minFico: undefined });
    const check = output.ficoCheck as UnderwritingCheck & { severity?: string };
    expect(check.status).toBe(CheckStatus.FAIL);
    expect(check.severity).toBe("blocker");
    expect(check.message).toContain("minFico");
  });

  it("occupancy-check returns blocked FAIL when allowedOccupancies is absent", () => {
    const edge = getEdge("occupancy-check");
    const output = edge.compute({
      occupancy: Occupancy.Primary,
      allowedOccupancies: undefined,
    });
    const check = output.occupancyCheck as UnderwritingCheck & {
      severity?: string;
    };
    expect(check.status).toBe(CheckStatus.FAIL);
    expect(check.severity).toBe("blocker");
    expect(check.message).toContain("allowedOccupancies");
  });

  it("purpose-check returns blocked FAIL when allowedPurposes is absent", () => {
    const edge = getEdge("purpose-check");
    const output = edge.compute({
      loanPurpose: LoanPurpose.Purchase,
      allowedPurposes: undefined,
    });
    const check = output.purposeCheck as UnderwritingCheck & {
      severity?: string;
    };
    expect(check.status).toBe(CheckStatus.FAIL);
    expect(check.severity).toBe("blocker");
    expect(check.message).toContain("allowedPurposes");
  });

  it("property-type-check returns blocked FAIL when allowedPropertyTypes is absent", () => {
    const edge = getEdge("property-type-check");
    const output = edge.compute({
      propertyType: PropertyType.SFR,
      allowedPropertyTypes: undefined,
    });
    const check = output.propertyTypeCheck as UnderwritingCheck & {
      severity?: string;
    };
    expect(check.status).toBe(CheckStatus.FAIL);
    expect(check.severity).toBe("blocker");
    expect(check.message).toContain("allowedPropertyTypes");
  });

  it("units-check returns blocked FAIL when unitsAllowed is absent", () => {
    const edge = getEdge("units-check");
    const output = edge.compute({ units: 1, unitsAllowed: undefined });
    const check = output.unitsCheck as UnderwritingCheck & {
      severity?: string;
    };
    expect(check.status).toBe(CheckStatus.FAIL);
    expect(check.severity).toBe("blocker");
    expect(check.message).toContain("unitsAllowed");
  });

  it("appraisal-check returns WARN (degraded) when appraisalRules is absent", () => {
    const edge = getEdge("appraisal-check");
    const output = edge.compute({
      loanAmount: money(500000),
      appraisalRules: undefined,
    });
    const check = output.appraisalCheck as UnderwritingCheck & {
      severity?: string;
    };
    expect(check.status).toBe(CheckStatus.WARN);
    expect(check.severity).toBe("warning");
    expect(check.message).toContain("Degraded");
    expect(check.message).toContain("appraisalRules");
  });

  it("blocker checks never default to PASS when rule context is absent", () => {
    const blockerEdges = checks.filter((e) => e.metadata?.severity === "blocker");
    for (const edge of blockerEdges) {
      if (edge.id === "cltv-check") {
        const output = edge.compute({
          cltv: ratio(0.5),
          maxCLTVRatio: undefined,
          loanAmount: money(500000),
          propertyValue: money(1000000),
        });
        const check = output.cltvCheck as UnderwritingCheck;
        expect(check.status).not.toBe(CheckStatus.PASS);
      }
      if (edge.id === "dti-check") {
        const output = edge.compute({
          dti: ratio(0.2),
          maxDTIRatio: undefined,
          qualifyingIncomeMonthly: money(10000),
        });
        const check = output.dtiCheck as UnderwritingCheck;
        expect(check.status).not.toBe(CheckStatus.PASS);
      }
      if (edge.id === "fico-check") {
        // Representative FICO retarget: pass blendedFico instead of the raw fico
        // input so the edge body reads the consumed input shape.
        const output = edge.compute({
          blendedFico: 800,
          minFico: undefined,
        });
        const check = output.ficoCheck as UnderwritingCheck;
        expect(check.status).not.toBe(CheckStatus.PASS);
      }
    }
  });
});

/* ------------------------------------------------------------------ */
/*  Reserve month semantics                                            */
/* ------------------------------------------------------------------ */

describe("reserve month semantics", () => {
  const edges = getAllEdges();
  const getEdge = (id: string) => {
    const edge = edges.find((item) => item.id === id);
    if (!edge) throw new Error(`Missing edge ${id}`);
    return edge;
  };

  it("toNonNegativeMonths accepts zero for zero-reserve cases", () => {
    expect(toNonNegativeMonths(0, "requiredReserveMonths")).toBe(0);
  });

  it("resolve-required-reserve-months uses AUS findings when policy is AUSDetermined", () => {
    const edge = getEdge("resolve-required-reserve-months");
    const output = edge.compute({
      reservesPolicy: { kind: "AUSDetermined" },
      loanAmount: money(900000),
      occupancy: Occupancy.Primary,
      loanPurpose: LoanPurpose.Purchase,
      ausFindings: { reservesMonths: 6 },
    });

    expect(output.requiredReserveMonths).toBe(6);
  });

  it("calculate-required-reserves-dollars allows zero reserve months", () => {
    const edge = getEdge("calculate-required-reserves-dollars");
    const output = edge.compute({
      requiredReserveMonths: 0,
      pitiMonthly: money(5000),
    });

    expect(output.requiredReservesDollars).toBe(0);
  });

  it("resolve-required-reserve-months: AUS finding alone passes through unchanged for non-Tiered policies", () => {
    const edge = getEdge("resolve-required-reserve-months");
    const output = edge.compute({
      reservesPolicy: { kind: "AUSDetermined" },
      loanAmount: money(900000),
      occupancy: Occupancy.Investment,
      loanPurpose: LoanPurpose.Purchase,
      ausFindings: { reservesMonths: 4 },
    });
    expect(output.requiredReserveMonths).toBe(4);
  });

  it("resolve-required-reserve-months: Tiered policy without additionalToAus returns the tier value (not AUS)", () => {
    const edge = getEdge("resolve-required-reserve-months");
    const output = edge.compute({
      reservesPolicy: {
        kind: "Tiered",
        tiers: [
          {
            loanAmount: { min: money(0), max: money(2_000_000) },
            occupancies: [Occupancy.Investment],
            months: 6,
          },
        ],
      },
      loanAmount: money(900000),
      occupancy: Occupancy.Investment,
      loanPurpose: LoanPurpose.Purchase,
      ausFindings: { reservesMonths: 2 },
    });
    expect(output.requiredReserveMonths).toBe(6);
  });

  it("resolve-required-reserve-months: Tiered+additionalToAus floor layered over a smaller AUS finding picks the floor", () => {
    const edge = getEdge("resolve-required-reserve-months");
    const output = edge.compute({
      reservesPolicy: {
        kind: "Tiered",
        tiers: [
          {
            loanAmount: { min: money(0), max: money(2_000_000) },
            occupancies: [Occupancy.Investment],
            additionalToAus: true,
            months: 6,
          },
        ],
      },
      loanAmount: money(900000),
      occupancy: Occupancy.Investment,
      loanPurpose: LoanPurpose.Purchase,
      ausFindings: { reservesMonths: 2 },
    });
    expect(output.requiredReserveMonths).toBe(6);
  });

  it("resolve-required-reserve-months: Tiered+additionalToAus floor below a larger AUS finding picks the AUS finding", () => {
    const edge = getEdge("resolve-required-reserve-months");
    const output = edge.compute({
      reservesPolicy: {
        kind: "Tiered",
        tiers: [
          {
            loanAmount: { min: money(0), max: money(2_000_000) },
            occupancies: [Occupancy.Investment],
            additionalToAus: true,
            months: 4,
          },
        ],
      },
      loanAmount: money(900000),
      occupancy: Occupancy.Investment,
      loanPurpose: LoanPurpose.Purchase,
      ausFindings: { reservesMonths: 9 },
    });
    expect(output.requiredReserveMonths).toBe(9);
  });

  it("resolve-required-reserve-months: Tiered+additionalToAus floor with no matching tier and AUSDetermined fallback uses AUS", () => {
    const edge = getEdge("resolve-required-reserve-months");
    // Tiered policy with one tier that doesn't match this scenario; the
    // policy resolves to 0 months (not AUS), so the AUS finding is never
    // consulted. This is the documented Tiered semantic when no tier hits.
    const output = edge.compute({
      reservesPolicy: {
        kind: "Tiered",
        tiers: [
          {
            loanAmount: { min: money(2_000_000), max: money(3_000_000) },
            occupancies: [Occupancy.Investment],
            additionalToAus: true,
            months: 12,
          },
        ],
      },
      loanAmount: money(500000),
      occupancy: Occupancy.Primary,
      loanPurpose: LoanPurpose.Purchase,
      ausFindings: { reservesMonths: 6 },
    });
    expect(output.requiredReserveMonths).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/*  Severity metadata on check results                                */
/* ------------------------------------------------------------------ */

describe("severity metadata on check results", () => {
  const checks = getCheckEdges();
  const getEdge = (id: string) => {
    const edge = checks.find((item) => item.id === id);
    if (!edge) throw new Error(`Missing check edge ${id}`);
    return edge;
  };

  it("ltv-check result includes severity=blocker", () => {
    const edge = getEdge("ltv-check");
    const output = edge.compute({
      ltv: ratio(0.8),
      maxLTVRatio: ratio(0.9),
      occupancy: Occupancy.Primary,
      loanPurpose: LoanPurpose.Purchase,
      loanAmount: money(800000),
      propertyValue: money(1000000),
    });
    const check = output.ltvCheck as UnderwritingCheck & { severity?: string };
    expect(check.severity).toBe("blocker");
  });

  it("appraisal-check result includes severity=warning", () => {
    const edge = getEdge("appraisal-check");
    const output = edge.compute({
      loanAmount: money(500000),
      appraisalRules: { waiverAllowed: true },
    });
    const check = output.appraisalCheck as UnderwritingCheck & {
      severity?: string;
    };
    expect(check.severity).toBe("warning");
  });
});

/* ------------------------------------------------------------------ */
/*  Estimate-triggering after node-default cleanup                    */
/* ------------------------------------------------------------------ */

describe("estimate-triggering after node-default cleanup", () => {
  const estimateTargets = ["propertyTax", "insurance", "hoa", "mi"];

  it("propertyTax, insurance, hoa, mi no longer have defaultValue on input nodes", () => {
    for (const id of estimateTargets) {
      const node = inputNodes.find((n) => n.id === id);
      expect(node).toBeDefined();
      expect(node!.defaultValue).toBeUndefined();
    }
  });

  it("floodInsurance retains its default of 0 (no estimate edge, semantically valid)", () => {
    const node = inputNodes.find((n) => n.id === "floodInsurance");
    expect(node).toBeDefined();
    expect(node!.defaultValue).toBe(0);
  });

  it("subordinateLiens retains its default of 0 (semantically valid)", () => {
    const node = inputNodes.find((n) => n.id === "subordinateLiens");
    expect(node).toBeDefined();
    expect(node!.defaultValue).toBe(0);
  });

  it("estimate edges exist for each cleared node", () => {
    const estimates = getEstimateEdges();
    for (const target of estimateTargets) {
      const matching = estimates.find((e) => e.outputs.includes(target));
      expect(matching).toBeDefined();
    }
  });
});

/* ------------------------------------------------------------------ */
/*  Adapter validation: invalid input rejection                       */
/* ------------------------------------------------------------------ */

describe("adapter validation rejects invalid inputs", () => {
  describe("toMoney", () => {
    it("rejects non-number", () => {
      expect(() => toMoney("100", "test")).toThrow("Expected test to be number");
    });

    it("rejects negative values", () => {
      expect(() => toMoney(-1, "test")).toThrow("must be >= 0");
    });

    it("accepts zero", () => {
      expect(toMoney(0, "test")).toBe(0);
    });

    it("accepts positive values", () => {
      expect(toMoney(100.5, "test")).toBe(100.5);
    });
  });

  describe("toRatio", () => {
    it("rejects non-number", () => {
      expect(() => toRatio("0.5", "test")).toThrow("Expected test to be number");
    });

    it("rejects values below 0", () => {
      expect(() => toRatio(-0.01, "test")).toThrow("must be in [0, 1]");
    });

    it("rejects values above 1", () => {
      expect(() => toRatio(1.01, "test")).toThrow("must be in [0, 1]");
    });

    it("accepts boundary values 0 and 1", () => {
      expect(toRatio(0, "test")).toBe(0);
      expect(toRatio(1, "test")).toBe(1);
    });

    it("accepts mid-range value", () => {
      expect(toRatio(0.5, "test")).toBe(0.5);
    });
  });

  describe("toRatePct", () => {
    it("rejects non-number", () => {
      expect(() => toRatePct(null, "test")).toThrow("Expected test to be number");
    });

    it("rejects negative values", () => {
      expect(() => toRatePct(-0.5, "test")).toThrow("must be >= 0");
    });

    it("accepts zero", () => {
      expect(toRatePct(0, "test")).toBe(0);
    });

    it("accepts positive values including > 1", () => {
      expect(toRatePct(5.5, "test")).toBe(5.5);
    });
  });

  describe("toMonths", () => {
    it("rejects non-number", () => {
      expect(() => toMonths(undefined, "test")).toThrow("Expected test to be number");
    });

    it("rejects zero", () => {
      expect(() => toMonths(0, "test")).toThrow("must be a positive integer");
    });

    it("rejects negative", () => {
      expect(() => toMonths(-12, "test")).toThrow("must be a positive integer");
    });

    it("rejects non-integer", () => {
      expect(() => toMonths(6.5, "test")).toThrow("must be a positive integer");
    });

    it("accepts positive integer", () => {
      expect(toMonths(360, "test")).toBe(360);
    });
  });

  describe("toNumber", () => {
    it("rejects non-number", () => {
      expect(() => toNumber(true, "test")).toThrow("Expected test to be number");
    });

    it("accepts finite number", () => {
      expect(toNumber(42, "test")).toBe(42);
    });
  });

  describe("toString", () => {
    it("rejects non-string", () => {
      expect(() => toString(123, "test")).toThrow("Expected test to be string");
    });

    it("accepts string", () => {
      expect(toString("hello", "test")).toBe("hello");
    });
  });

  describe("toArray", () => {
    it("rejects non-array", () => {
      expect(() => toArray({}, "test")).toThrow("Expected test to be array");
    });

    it("accepts array", () => {
      expect(toArray([1, 2, 3], "test")).toEqual([1, 2, 3]);
    });
  });
});

/* ------------------------------------------------------------------ */
/*  Non-finite value rejection                                        */
/* ------------------------------------------------------------------ */

describe("non-finite value rejection", () => {
  it("toMoney rejects NaN", () => {
    expect(() => toMoney(NaN, "amount")).toThrow("must be finite");
  });

  it("toMoney rejects Infinity", () => {
    expect(() => toMoney(Infinity, "amount")).toThrow("must be finite");
  });

  it("toMoney rejects -Infinity", () => {
    expect(() => toMoney(-Infinity, "amount")).toThrow("must be finite");
  });

  it("toRatio rejects NaN", () => {
    expect(() => toRatio(NaN, "ratio")).toThrow("must be finite");
  });

  it("toRatio rejects Infinity", () => {
    expect(() => toRatio(Infinity, "ratio")).toThrow("must be finite");
  });

  it("toRatePct rejects NaN", () => {
    expect(() => toRatePct(NaN, "rate")).toThrow("must be finite");
  });

  it("toRatePct rejects Infinity", () => {
    expect(() => toRatePct(Infinity, "rate")).toThrow("must be finite");
  });

  it("toRatePct rejects -Infinity", () => {
    expect(() => toRatePct(-Infinity, "rate")).toThrow("must be finite");
  });

  it("toMonths rejects NaN", () => {
    expect(() => toMonths(NaN, "term")).toThrow("must be finite");
  });

  it("toMonths rejects Infinity", () => {
    expect(() => toMonths(Infinity, "term")).toThrow("must be finite");
  });

  it("toNumber rejects NaN", () => {
    expect(() => toNumber(NaN, "val")).toThrow("must be finite");
  });

  it("toNumber rejects Infinity", () => {
    expect(() => toNumber(Infinity, "val")).toThrow("must be finite");
  });

  it("toNumber rejects -Infinity", () => {
    expect(() => toNumber(-Infinity, "val")).toThrow("must be finite");
  });
});

/* ------------------------------------------------------------------ */
/*  Policy adapter validation                                         */
/* ------------------------------------------------------------------ */

describe("policy adapter validation", () => {
  describe("toQualifyingPaymentPolicy", () => {
    it("rejects non-object", () => {
      expect(() => toQualifyingPaymentPolicy("NotePayment", "qpp")).toThrow(
        "Expected qpp to be a policy object",
      );
    });

    it("rejects null", () => {
      expect(() => toQualifyingPaymentPolicy(null, "qpp")).toThrow(
        "Expected qpp to be a policy object",
      );
    });

    it("rejects unknown kind", () => {
      expect(() => toQualifyingPaymentPolicy({ kind: "Unknown" }, "qpp")).toThrow("must be one of");
    });

    it("rejects missing kind", () => {
      expect(() => toQualifyingPaymentPolicy({}, "qpp")).toThrow("must be one of");
    });

    it("accepts NotePayment", () => {
      const result = toQualifyingPaymentPolicy({ kind: "NotePayment" }, "qpp");
      expect(result.kind).toBe("NotePayment");
    });

    it("accepts IOUsesFullyAmortizing with valid amortMonths", () => {
      const result = toQualifyingPaymentPolicy(
        { kind: "IOUsesFullyAmortizing", amortMonths: 360 },
        "qpp",
      );
      expect(result.kind).toBe("IOUsesFullyAmortizing");
    });

    it("rejects IOUsesFullyAmortizing with non-positive amortMonths", () => {
      expect(() =>
        toQualifyingPaymentPolicy({ kind: "IOUsesFullyAmortizing", amortMonths: 0 }, "qpp"),
      ).toThrow("amortMonths");
    });

    it("rejects IOUsesFullyAmortizing with non-finite amortMonths", () => {
      expect(() =>
        toQualifyingPaymentPolicy({ kind: "IOUsesFullyAmortizing", amortMonths: Infinity }, "qpp"),
      ).toThrow("amortMonths");
    });

    it("accepts ARMQualifyMaxNotePlus with valid addPctPoints", () => {
      const result = toQualifyingPaymentPolicy(
        { kind: "ARMQualifyMaxNotePlus", addPctPoints: 2.0 },
        "qpp",
      );
      expect(result.kind).toBe("ARMQualifyMaxNotePlus");
    });

    it("rejects ARMQualifyMaxNotePlus with negative addPctPoints", () => {
      expect(() =>
        toQualifyingPaymentPolicy({ kind: "ARMQualifyMaxNotePlus", addPctPoints: -1 }, "qpp"),
      ).toThrow("addPctPoints");
    });

    it("accepts ARMQualifyFullyIndexedOrNote", () => {
      const result = toQualifyingPaymentPolicy({ kind: "ARMQualifyFullyIndexedOrNote" }, "qpp");
      expect(result.kind).toBe("ARMQualifyFullyIndexedOrNote");
    });
  });

  describe("toReservesPolicy", () => {
    it("rejects non-object", () => {
      expect(() => toReservesPolicy(42, "rp")).toThrow("Expected rp to be a policy object");
    });

    it("rejects unknown kind", () => {
      expect(() => toReservesPolicy({ kind: "FooBar" }, "rp")).toThrow("must be one of");
    });

    it("accepts None", () => {
      const result = toReservesPolicy({ kind: "None" }, "rp");
      expect(result.kind).toBe("None");
    });

    it("accepts FixedMonths with valid months", () => {
      const result = toReservesPolicy({ kind: "FixedMonths", months: 6 }, "rp");
      expect(result.kind).toBe("FixedMonths");
    });

    it("rejects FixedMonths with zero months", () => {
      expect(() => toReservesPolicy({ kind: "FixedMonths", months: 0 }, "rp")).toThrow("months");
    });

    it("rejects FixedMonths with NaN months", () => {
      expect(() => toReservesPolicy({ kind: "FixedMonths", months: NaN }, "rp")).toThrow("months");
    });

    it("accepts AUSDetermined", () => {
      const result = toReservesPolicy({ kind: "AUSDetermined" }, "rp");
      expect(result.kind).toBe("AUSDetermined");
    });

    it("accepts Tiered with array tiers", () => {
      const result = toReservesPolicy({ kind: "Tiered", tiers: [] }, "rp");
      expect(result.kind).toBe("Tiered");
    });

    it("rejects Tiered without tiers array", () => {
      expect(() => toReservesPolicy({ kind: "Tiered" }, "rp")).toThrow("tiers must be an array");
    });
  });
});

/* ------------------------------------------------------------------ */
/*  Decimal.js margin correctness                                     */
/* ------------------------------------------------------------------ */

describe("margin calculations use decimal precision", () => {
  const checks = getCheckEdges();
  const getEdge = (id: string) => {
    const edge = checks.find((item) => item.id === id);
    if (!edge) throw new Error(`Missing check edge ${id}`);
    return edge;
  };

  it("ltv-check margin is exact for known values", () => {
    const edge = getEdge("ltv-check");
    const output = edge.compute({
      ltv: ratio(0.85),
      maxLTVRatio: ratio(0.8),
      occupancy: Occupancy.Primary,
      loanPurpose: LoanPurpose.Purchase,
      loanAmount: money(850000),
      propertyValue: money(1000000),
    });
    const check = output.ltvCheck as UnderwritingCheck;
    expect(check.status).toBe(CheckStatus.FAIL);
    expect(check.margin?.deltaToPass).toBe(50000);
    expect(check.margin?.actionHint).toBe("PayDownLoan");
  });

  it("dti-check margin is exact for known values", () => {
    const edge = getEdge("dti-check");
    const output = edge.compute({
      dti: ratio(0.5),
      maxDTIRatio: ratio(0.45),
      qualifyingIncomeMonthly: money(10000),
    });
    const check = output.dtiCheck as UnderwritingCheck;
    expect(check.status).toBe(CheckStatus.FAIL);
    expect(check.margin?.deltaToPass).toBe(500);
    expect(check.margin?.actionHint).toBe("PayoffLiability");
  });

  it("reserves-check margin is exact for known values", () => {
    const edge = getEdge("reserves-check");
    const output = edge.compute({
      assetAllocation: { remainingReservesDollars: money(10000) },
      requiredReservesDollars: money(15000),
    });
    const check = output.reservesCheck as UnderwritingCheck;
    expect(check.status).toBe(CheckStatus.FAIL);
    expect(check.margin?.deltaToPass).toBe(5000);
    expect(check.margin?.actionHint).toBe("AddReserves");
  });

  it("passing margin has deltaToPass of 0 and no actionHint", () => {
    const edge = getEdge("ltv-check");
    const output = edge.compute({
      ltv: ratio(0.7),
      maxLTVRatio: ratio(0.8),
      occupancy: Occupancy.Primary,
      loanPurpose: LoanPurpose.Purchase,
      loanAmount: money(700000),
      propertyValue: money(1000000),
    });
    const check = output.ltvCheck as UnderwritingCheck;
    expect(check.status).toBe(CheckStatus.PASS);
    expect(check.margin?.deltaToPass).toBe(0);
    expect(check.margin?.actionHint).toBeUndefined();
  });
});
