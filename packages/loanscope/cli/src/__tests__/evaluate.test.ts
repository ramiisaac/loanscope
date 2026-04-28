import { describe, expect, it } from "vitest";
import { buildScopedResponse, evaluate } from "@loanscope/engine";
import { filterDisplayProducts, getAllProducts } from "@loanscope/products";
import { applyScenarioOverrides } from "../commands/scenario-overrides";
import {
  assertCompatibleProducts,
  filterProductsByScenarioCompatibility,
} from "../commands/scenario-compatibility";
import { CliValidationError } from "../cli-error";
import { parseCliEnum, parseCliArmFixedPeriod } from "../cli-parsers";
import { parseCliRange, parseBorrowerSets } from "../cli-parsers";
import {
  validateLenderId,
  validateLenderIds,
  validateProductId,
  validateProductIds,
} from "../cli-validators";
import { findDefaultScenario, loadTransaction } from "../config-loaders";
import { renderScopeAnalysis } from "../output";
import { Occupancy, CheckStatus, CheckSeverity, ActionKind, ProgramKind } from "@loanscope/domain";
import type { ScopedRunResponse } from "@loanscope/domain";
// ---------------------------------------------------------------------------
// Command registration
// ---------------------------------------------------------------------------

describe("scenario overrides", () => {
  it("applies ARM overrides to a loaded transaction", () => {
    const base = loadTransaction(findDefaultScenario());
    const overridden = applyScenarioOverrides(base, {
      program: "ARM",
      armFixed: "60",
      term: "360",
      rate: "6.25",
    });

    expect(overridden.scenario.rateNote.productKind).toBe(ProgramKind.ARM);
    expect(overridden.scenario.rateNote.arm?.initialFixedMonths).toBe(60);
    expect(overridden.scenario.rateNote.noteRatePct).toBe(6.25);
    expect(overridden.scenario.rateNote.amortizationMonths).toBe(360);
  });

  it("rejects arm-fixed override without explicit ARM program", () => {
    const base = loadTransaction(findDefaultScenario());
    expect(() =>
      applyScenarioOverrides(base, {
        armFixed: "60",
      }),
    ).toThrow(CliValidationError);
  });

  it("clears ARM details when switching back to fixed", () => {
    const base = loadTransaction(findDefaultScenario());
    base.scenario.rateNote.productKind = ProgramKind.ARM;
    base.scenario.rateNote.arm = { initialFixedMonths: 84 };

    const overridden = applyScenarioOverrides(base, {
      program: "Fixed",
    });

    expect(overridden.scenario.rateNote.productKind).toBe(ProgramKind.Fixed);
    expect(overridden.scenario.rateNote.arm).toBeUndefined();
  });

  it("rejects quote-style ARM period without ARM program", () => {
    const programKind = undefined;
    const armInitialFixedMonths = parseCliArmFixedPeriod("60");

    expect(() => {
      if (armInitialFixedMonths !== undefined && programKind === undefined) {
        throw new CliValidationError("ARM fixed period requires --program ARM.");
      }
    }).toThrow(CliValidationError);
  });
});

describe("default evaluate scenario", () => {
  it("evaluates the bundled default scenario without scoped execution errors", () => {
    const transaction = loadTransaction(findDefaultScenario());
    const variant = transaction.variants[0];
    const product = filterDisplayProducts(getAllProducts())[0];

    if (!variant) {
      throw new Error("Default transaction must include at least one variant");
    }
    if (!product) {
      throw new Error("Display product list must not be empty");
    }

    const graphResult = evaluate(transaction, variant, product);
    const scoped = buildScopedResponse(transaction, [product], graphResult, variant.id);

    expect(scoped.errors).toEqual([]);
    expect(graphResult.computed["qualifyingIncomeMonthly"]?.value).toBe(20000);
    expect(graphResult.computed["requiredReserveMonths"]?.value).toBe(6);
  });
});

describe("scenario compatibility filtering", () => {
  it("filters ARM products out of fixed quote/evaluate scenarios", () => {
    const transaction = loadTransaction(findDefaultScenario());
    const products = filterDisplayProducts(getAllProducts());

    const compatible = filterProductsByScenarioCompatibility(products, transaction);

    expect(compatible.length).toBeGreaterThan(0);
    expect(compatible.some((product) => product.id === "fannie_conforming_arm")).toBe(false);
    expect(compatible.some((product) => product.id === "freddie_conforming_arm")).toBe(false);
    expect(compatible.some((product) => product.id === "agency_conforming")).toBe(true);
  });

  it("keeps ARM products when the scenario explicitly requests ARM terms", () => {
    const transaction = loadTransaction(findDefaultScenario());
    transaction.scenario.rateNote.productKind = ProgramKind.ARM;
    transaction.scenario.rateNote.arm = { initialFixedMonths: 60 };

    const products = filterDisplayProducts(getAllProducts());
    const compatible = filterProductsByScenarioCompatibility(products, transaction);

    expect(compatible.some((product) => product.id === "fannie_conforming_arm")).toBe(true);
    expect(compatible.some((product) => product.id === "freddie_conforming_arm")).toBe(true);
    expect(compatible.some((product) => product.id === "agency_conforming")).toBe(false);
  });

  it("throws a descriptive error when no products match the scenario", () => {
    const transaction = loadTransaction(findDefaultScenario());
    transaction.scenario.rateNote.productKind = ProgramKind.ARM;
    transaction.scenario.rateNote.arm = { initialFixedMonths: 84 };
    transaction.scenario.rateNote.amortizationMonths = 180;

    expect(() => assertCompatibleProducts([], transaction)).toThrow(
      /No products match the current scenario \(ARM 84, 180-month term\)/,
    );
  });
});

describe("quote/evaluate/compare lender selection support", () => {
  it("validateLenderId accepts a known lender ID", () => {
    const known = ["uwm", "agency", "government"];
    expect(() => validateLenderId("uwm", known)).not.toThrow();
  });

  it("validateLenderId rejects an unknown lender ID with descriptive message", () => {
    const known = ["uwm", "agency"];
    expect(() => validateLenderId("unknown_lender", known)).toThrow(CliValidationError);
    try {
      validateLenderId("unknown_lender", known);
    } catch (err) {
      expect(err).toBeInstanceOf(CliValidationError);
      expect((err as Error).message).toContain("unknown_lender");
      expect((err as Error).message).toContain("uwm");
    }
  });

  it("validateLenderIds accepts all known lender IDs", () => {
    const known = ["uwm", "agency", "government"];
    expect(() => validateLenderIds(["uwm", "agency"], known)).not.toThrow();
  });

  it("validateLenderIds rejects if any lender ID is unknown", () => {
    const known = ["uwm", "agency"];
    expect(() => validateLenderIds(["uwm", "bad"], known)).toThrow(CliValidationError);
  });

  it("validateProductId accepts a known product ID", () => {
    const known = ["uwm_jumbo_pink", "agency_conforming"];
    expect(() => validateProductId("uwm_jumbo_pink", known)).not.toThrow();
  });

  it("validateProductId rejects unknown product with descriptive message", () => {
    const known = ["uwm_jumbo_pink", "agency_conforming"];
    expect(() => validateProductId("fake_product", known)).toThrow(CliValidationError);
    try {
      validateProductId("fake_product", known);
    } catch (err) {
      expect(err).toBeInstanceOf(CliValidationError);
      expect((err as Error).message).toContain("fake_product");
      expect((err as Error).message).toContain("uwm_jumbo_pink");
    }
  });

  it("validateProductIds rejects unknown product in list", () => {
    const known = ["uwm_jumbo_pink", "agency_conforming"];
    expect(() => validateProductIds(["uwm_jumbo_pink", "nope"], known)).toThrow(CliValidationError);
  });

  it("parseBorrowerSets parses lender-scoped borrower set notation", () => {
    const sets = parseBorrowerSets("b1|b2;b1");
    expect(sets).toEqual([["b1", "b2"], ["b1"]]);
  });

  it("parseBorrowerSets handles comma-separated IDs within a set", () => {
    const sets = parseBorrowerSets("b1,b2;b3");
    expect(sets).toEqual([["b1", "b2"], ["b3"]]);
  });

  it("parseCliEnum parses lender-related enum values case-insensitively", () => {
    const result = parseCliEnum("primary", Occupancy, "Occupancy");
    expect(result).toBe(Occupancy.Primary);
  });

  it("parseCliRange parses LTV range for compare dimension", () => {
    const range = parseCliRange("0.75:0.95:0.05", "LTV");
    expect(range.min).toBe(0.75);
    expect(range.max).toBe(0.95);
    expect(range.step).toBe(0.05);
  });
});

describe("CLI JSON output surfaces scoped errors and estimates", () => {
  it("JSON output includes blocked nodes with missingInputs and unlocksFeatures", () => {
    const response: ScopedRunResponse = {
      inputScope: ["loanAmount", "fico"],
      effectiveScope: ["loanAmount", "fico", "ltv"],
      blocked: [
        {
          nodeId: "dti",
          missingInputs: ["qualifyingIncomeMonthly"],
          unlocksFeatures: ["dtiCheck", "fullUnderwriting"],
        },
        {
          nodeId: "reservesCheck",
          missingInputs: ["requiredReserves"],
          unlocksFeatures: ["cashToClose"],
        },
      ],
      estimatesUsed: [{ field: "propertyTax", value: 600, source: "county-average" }],
      errors: [],
      products: [],
    };

    const json = JSON.stringify({ scope: response }, null, 2);
    const parsed = JSON.parse(json) as { scope: ScopedRunResponse };

    expect(parsed.scope.blocked).toHaveLength(2);
    expect(parsed.scope.blocked[0]!.nodeId).toBe("dti");
    expect(parsed.scope.blocked[0]!.missingInputs).toContain("qualifyingIncomeMonthly");
    expect(parsed.scope.blocked[0]!.unlocksFeatures).toContain("dtiCheck");
    expect(parsed.scope.blocked[1]!.nodeId).toBe("reservesCheck");
  });

  it("JSON output includes execution errors with edge and node info", () => {
    const response: ScopedRunResponse = {
      inputScope: [],
      effectiveScope: [],
      blocked: [],
      estimatesUsed: [],
      errors: [
        {
          edgeId: "derive-qualifying-income",
          message: "Income computation failed",
          code: "INCOME_ERROR",
          nodeIds: ["qualifyingIncomeMonthly"],
        },
        {
          edgeId: "check-ltv",
          message: "LTV edge error",
        },
      ],
      products: [],
    };

    const json = JSON.stringify({ scope: response }, null, 2);
    const parsed = JSON.parse(json) as { scope: ScopedRunResponse };

    expect(parsed.scope.errors).toHaveLength(2);
    expect(parsed.scope.errors[0]!.edgeId).toBe("derive-qualifying-income");
    expect(parsed.scope.errors[0]!.code).toBe("INCOME_ERROR");
    expect(parsed.scope.errors[0]!.nodeIds).toContain("qualifyingIncomeMonthly");
    expect(parsed.scope.errors[1]!.edgeId).toBe("check-ltv");
  });

  it("JSON output includes estimates used with field, value, and source", () => {
    const response: ScopedRunResponse = {
      inputScope: ["loanAmount"],
      effectiveScope: ["loanAmount", "propertyTax", "insurance"],
      blocked: [],
      estimatesUsed: [
        { field: "propertyTax", value: 600, source: "county-average" },
        { field: "insurance", value: 150, source: "state-average" },
        { field: "floodInsurance", value: null, source: "not-required" },
      ],
      errors: [],
      products: [],
    };

    const json = JSON.stringify({ scope: response }, null, 2);
    const parsed = JSON.parse(json) as { scope: ScopedRunResponse };

    expect(parsed.scope.estimatesUsed).toHaveLength(3);
    expect(parsed.scope.estimatesUsed[0]!.field).toBe("propertyTax");
    expect(parsed.scope.estimatesUsed[0]!.value).toBe(600);
    expect(parsed.scope.estimatesUsed[0]!.source).toBe("county-average");
    expect(parsed.scope.estimatesUsed[2]!.value).toBeNull();
  });

  it("JSON output includes product checks with margin and severity", () => {
    const response: ScopedRunResponse = {
      inputScope: [],
      effectiveScope: [],
      blocked: [],
      estimatesUsed: [],
      errors: [],
      products: [
        {
          productId: "uwm_jumbo_pink",
          productName: "Jumbo Pink",
          variantId: "fixed-360",
          checks: [
            {
              key: "ltvCheck",
              status: CheckStatus.PASS,
              actual: "80%",
              limit: "90%",
            },
            {
              key: "dtiCheck",
              status: CheckStatus.FAIL,
              actual: "52%",
              limit: "50%",
              message: "DTI exceeds limit",
              margin: {
                kind: "Ratio",
                deltaToPass: -0.02,
                actionHint: ActionKind.PayoffLiability,
              },
              severity: CheckSeverity.Blocker,
            },
            {
              key: "ficoCheck",
              status: CheckStatus.WARN,
              actual: "705",
              limit: "700",
              message: "FICO near minimum",
              severity: CheckSeverity.Warning,
            },
          ],
        },
      ],
    };

    const json = JSON.stringify({ scope: response }, null, 2);
    const parsed = JSON.parse(json) as { scope: ScopedRunResponse };

    expect(parsed.scope.products).toHaveLength(1);
    const product = parsed.scope.products[0]!;
    expect(product.productId).toBe("uwm_jumbo_pink");
    expect(product.variantId).toBe("fixed-360");
    expect(product.checks).toHaveLength(3);

    const passCheck = product.checks![0]!;
    expect(passCheck.status).toBe("PASS");
    expect(passCheck.actual).toBe("80%");

    const failCheck = product.checks![1]!;
    expect(failCheck.status).toBe("FAIL");
    expect(failCheck.margin).toBeDefined();
    expect(failCheck.margin!.kind).toBe("Ratio");
    expect(failCheck.margin!.deltaToPass).toBe(-0.02);
    expect(failCheck.margin!.actionHint).toBe(ActionKind.PayoffLiability);
    expect(failCheck.severity).toBe("blocker");

    const warnCheck = product.checks![2]!;
    expect(warnCheck.status).toBe("WARN");
    expect(warnCheck.severity).toBe("warning");
  });

  it("renderScopeAnalysis outputs blocked node information in text", () => {
    const response: ScopedRunResponse = {
      inputScope: ["loanAmount"],
      effectiveScope: ["loanAmount", "ltv"],
      blocked: [
        {
          nodeId: "dti",
          missingInputs: ["income"],
          unlocksFeatures: ["fullUnderwriting"],
        },
      ],
      estimatesUsed: [],
      errors: [],
      products: [],
    };

    const output = renderScopeAnalysis(response);
    expect(output).toContain("dti");
    expect(output).toContain("income");
    expect(output).toContain("fullUnderwriting");
  });

  it("renderScopeAnalysis outputs error information in text", () => {
    const response: ScopedRunResponse = {
      inputScope: [],
      effectiveScope: [],
      blocked: [],
      estimatesUsed: [],
      errors: [
        {
          edgeId: "edge-calc",
          message: "Calculation failed",
          code: "ERR",
          nodeIds: ["node1"],
        },
      ],
      products: [],
    };

    const output = renderScopeAnalysis(response);
    expect(output).toContain("Calculation failed");
    expect(output).toContain("edge-calc");
  });

  it("renderScopeAnalysis outputs estimate information in text", () => {
    const response: ScopedRunResponse = {
      inputScope: [],
      effectiveScope: [],
      blocked: [],
      estimatesUsed: [{ field: "propertyTax", value: 500, source: "estimate-engine" }],
      errors: [],
      products: [],
    };

    const output = renderScopeAnalysis(response);
    expect(output).toContain("propertyTax");
    expect(output).toContain("500");
    expect(output).toContain("estimate-engine");
  });

  it("JSON roundtrip preserves all scoped response fields", () => {
    const response: ScopedRunResponse = {
      inputScope: ["a", "b"],
      effectiveScope: ["a", "b", "c"],
      blocked: [{ nodeId: "x", missingInputs: ["y"], unlocksFeatures: ["z"] }],
      estimatesUsed: [{ field: "f", value: 42, source: "s" }],
      errors: [{ edgeId: "e1", message: "m1" }],
      products: [
        {
          productId: "p1",
          productName: "Product One",
          checks: [{ key: "ck", status: CheckStatus.PASS }],
        },
      ],
    };

    const serialized = JSON.stringify(response);
    const restored = JSON.parse(serialized) as ScopedRunResponse;

    expect(restored.inputScope).toEqual(response.inputScope);
    expect(restored.effectiveScope).toEqual(response.effectiveScope);
    expect(restored.blocked).toEqual(response.blocked);
    expect(restored.estimatesUsed).toEqual(response.estimatesUsed);
    expect(restored.errors).toEqual(response.errors);
    expect(restored.products).toHaveLength(1);
    expect(restored.products[0]!.checks).toHaveLength(1);
  });
});
