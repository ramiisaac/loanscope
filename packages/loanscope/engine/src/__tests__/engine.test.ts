import { describe, expect, it } from "vitest";
import {
  buildEffectiveData,
  buildScopedResponse,
  evaluate,
  evaluateProduct,
  quickQuoteToTransaction,
  resolveTier,
  resolveVariant,
  extractChecksFromGraph,
  computeEligibility,
} from "../index";
import {
  AmortizationType,
  AssetType,
  Channel,
  CheckStatus,
  LoanType,
  LoanPurpose,
  Occupancy,
  ProgramKind,
  PropertyType,
  money,
  months,
  ratePct,
  ratio,
} from "@loanscope/domain";
import type { ProductDefinition, Transaction, TransactionVariant } from "@loanscope/domain";
import type { EvaluationResult, EdgeRegistry } from "@loanscope/graph";

/** Safely retrieves the first variant or throws a clear error. */
const getVariant = (transaction: Transaction): TransactionVariant => {
  const v = transaction.variants[0];
  if (!v) throw new Error("Transaction has no variants");
  return v;
};

const baseProduct: ProductDefinition = {
  id: "test_product",
  name: "Test Product",
  loanType: LoanType.Conventional,
  channel: Channel.Agency,
  variants: [
    {
      programKind: ProgramKind.Fixed,
      amortization: {
        type: AmortizationType.FullyAmortizing,
        qualifyingPaymentPolicy: { kind: "NotePayment" },
      },
      terms: [360],
      constraints: {
        Primary: { maxLTVRatio: ratio(0.9), minFico: 620 },
        Secondary: { maxLTVRatio: ratio(0.8), minFico: 680 },
        Investment: { maxLTVRatio: ratio(0.75), minFico: 700 },
      },
    },
  ],
  baseConstraints: {
    allowedPurposes: [LoanPurpose.Purchase],
    allowedOccupancies: [Occupancy.Primary, Occupancy.Secondary, Occupancy.Investment],
    allowedPropertyTypes: [PropertyType.SFR],
    maxDTIRatio: ratio(0.45),
  },
  tiers: [
    {
      range: { min: money(0), max: money(766550) },
      maxLTVRatio: ratio(0.9),
    },
    {
      range: { min: money(766551), max: money(1200000) },
      maxLTVRatio: ratio(0.85),
    },
  ],
};

const createTransaction = (): Transaction => {
  const transaction = quickQuoteToTransaction({
    loanAmount: money(800000),
    purchasePrice: money(1000000),
    fico: 740,
    occupancy: Occupancy.Primary,
    propertyType: PropertyType.SFR,
    loanPurpose: LoanPurpose.Purchase,
    monthlyIncome: money(12000),
    monthlyDebts: money(1000),
    annualTaxes: money(7200),
    annualInsurance: money(1800),
    noteRatePct: ratePct(6.75),
    amortizationMonths: months(360),
    totalLiquidAssets: money(150000),
    stateCode: "CA",
  });
  transaction.scenario.monthlyHousing.mi = money(0);
  transaction.scenario.monthlyHousing.floodInsurance = money(0);
  transaction.scenario.location = { stateCode: "CA" };
  return transaction;
};

/** Helper to build a minimal EvaluationResult for unit-level aggregator tests. */
const emptyEvalResult = (overrides?: Partial<EvaluationResult>): EvaluationResult => ({
  inputs: {},
  computed: {},
  checks: {},
  blocked: [],
  errors: [],
  inputScope: [],
  effectiveScope: [],
  estimatesUsed: [],
  ...overrides,
});

describe("quick quote conversion", () => {
  it("creates borrowers, scenario, and default variant", () => {
    const transaction = createTransaction();
    expect(transaction.borrowers.length).toBe(1);
    expect(transaction.variants.length).toBe(1);
    expect(transaction.scenario.requestedLoanAmount).toBeDefined();
  });

  it("preserves explicit ARM quick-quote inputs", () => {
    const transaction = quickQuoteToTransaction({
      loanAmount: money(800000),
      purchasePrice: money(1000000),
      fico: 740,
      occupancy: Occupancy.Primary,
      propertyType: PropertyType.SFR,
      loanPurpose: LoanPurpose.Purchase,
      programKind: ProgramKind.ARM,
      armInitialFixedMonths: 84,
    });

    expect(transaction.scenario.rateNote.productKind).toBe(ProgramKind.ARM);
    expect(transaction.scenario.rateNote.arm?.initialFixedMonths).toBe(84);
  });
});

describe("effective data", () => {
  it("filters borrowers and assets by variant", () => {
    const transaction = createTransaction();
    transaction.borrowers.push({
      id: "b2",
      fico: 720,
      incomes: [],
    });
    transaction.assets?.push({
      id: "b2-assets",
      type: AssetType.Checking,
      ownerBorrowerIds: ["b2"],
      amount: money(50000),
    });
    const baseVariant = getVariant(transaction);
    const variant: TransactionVariant = {
      ...baseVariant,
      includedBorrowerIds: ["b2"],
    };
    const effective = buildEffectiveData(transaction, variant);
    expect(effective.borrowers.map((b) => b.id)).toEqual(["b2"]);
    expect(effective.assets.map((a) => a.id)).toEqual(["b2-assets"]);
  });
});

describe("tier and variant resolution", () => {
  it("resolves tier based on loan amount", () => {
    const rules = resolveTier(baseProduct, money(900000), Occupancy.Primary, LoanPurpose.Purchase);
    expect(rules.maxLoanAmount).toBeDefined();
    expect(Number(rules.maxLoanAmount)).toBe(1200000);
  });

  it("resolves a variant by term and amortization", () => {
    const variant = resolveVariant(
      baseProduct,
      360,
      Occupancy.Primary,
      AmortizationType.FullyAmortizing,
    );
    expect(variant.programKind).toBe(ProgramKind.Fixed);
  });
});

describe("evaluation pipeline", () => {
  it("evaluates graph results and derives LTV", () => {
    const transaction = createTransaction();
    const variant = getVariant(transaction);
    const result = evaluate(transaction, variant, baseProduct);
    const ltvValue = result.inputs["ltv"]?.value ?? result.computed["ltv"]?.value;
    expect(ltvValue).toBeDefined();
  });

  it("builds scoped response with provided values tracked correctly", () => {
    const transaction = createTransaction();
    const variant = getVariant(transaction);
    const result = evaluate(transaction, variant, baseProduct);
    const scoped = buildScopedResponse(transaction, [baseProduct], result, variant.id);
    expect(Array.isArray(scoped.estimatesUsed)).toBe(true);
    expect(Array.isArray(scoped.inputScope)).toBe(true);
    expect(Array.isArray(scoped.effectiveScope)).toBe(true);
  });

  it("produces underwriting result for product evaluation", () => {
    const transaction = createTransaction();
    const variant = getVariant(transaction);
    const underwriting = evaluateProduct(transaction, variant, baseProduct);
    expect(underwriting.productId).toBe(baseProduct.id);
    expect(underwriting.variantId).toBe(variant.id);
    expect(underwriting.derived.ltvRatio).toBeDefined();
  });
});

describe("undefined-input cleaning", () => {
  it("handles undefined property values without crashing", () => {
    const transaction = createTransaction();
    // Set optional inputs to undefined to verify the engine cleans them
    (transaction.scenario.monthlyHousing as Record<string, unknown>).hoa = undefined;
    const variant = getVariant(transaction);
    const result = evaluate(transaction, variant, baseProduct);
    // The evaluation should complete without throwing
    expect(result).toBeDefined();
    expect(result.checks).toBeDefined();
  });

  it("does not pass undefined inputs into the graph as explicit values", () => {
    const transaction = createTransaction();
    (transaction.scenario.monthlyHousing as Record<string, unknown>).floodInsurance = undefined;
    const variant = getVariant(transaction);
    const result = evaluate(transaction, variant, baseProduct);
    // If an input was provided as undefined, it should not appear in result.inputs
    // with an undefined value -- the graph should either omit it or default it
    for (const [, entry] of Object.entries(result.inputs)) {
      expect(entry.value).not.toBeUndefined();
    }
  });
});

describe("surfaced graph errors", () => {
  it("includes graph errors in scoped response", () => {
    const graphResult = emptyEvalResult({
      checks: {
        ltvCheck: {
          key: "ltvCheck",
          status: "PASS",
          severity: "blocker",
        },
      },
      errors: [
        {
          edgeId: "broken-edge",
          message: "Something went wrong in computation",
          code: "COMPUTE_FAILURE",
        },
      ],
    });
    const scoped = buildScopedResponse(createTransaction(), [baseProduct], graphResult);
    expect(scoped.errors.length).toBe(1);
    const firstError = scoped.errors[0];
    expect(firstError).toBeDefined();
    expect(firstError?.edgeId).toBe("broken-edge");
    expect(firstError?.message).toBe("Something went wrong in computation");
    expect(firstError?.code).toBe("COMPUTE_FAILURE");
  });

  it("returns empty errors array when graph has no errors", () => {
    const graphResult = emptyEvalResult({
      checks: {
        ltvCheck: {
          key: "ltvCheck",
          status: "PASS",
          severity: "blocker",
        },
      },
    });
    const scoped = buildScopedResponse(createTransaction(), [baseProduct], graphResult);
    expect(scoped.errors).toEqual([]);
  });
});

describe("DTI blocked when income missing", () => {
  it("marks ineligible when blocker check has all inputs resolved but did not fire", () => {
    // Scenario: dtiCheck is blocked, its missing input (dti) is resolved
    // (present in computed), meaning the check edge should have fired but
    // somehow did not. This is a logic error and must fail eligibility.
    const blockerRegistry: EdgeRegistry = new Map([
      [
        "dti-check",
        {
          id: "dti-check",
          kind: "check",
          inputs: ["dti", "maxDTIRatio"],
          outputs: ["dtiCheck"],
          confidence: "derived",
          metadata: { category: "check", severity: "blocker" },
          compute: () => ({}),
        },
      ],
      [
        "ltv-check",
        {
          id: "ltv-check",
          kind: "check",
          inputs: ["ltv", "maxLTVRatio"],
          outputs: ["ltvCheck"],
          confidence: "derived",
          metadata: { category: "check", severity: "blocker" },
          compute: () => ({}),
        },
      ],
    ]);

    const graphResult = emptyEvalResult({
      computed: {
        dti: { value: 0.45, source: "derived" },
        maxDTIRatio: { value: 0.5, source: "provided" },
      },
      checks: {
        ltvCheck: {
          key: "ltvCheck",
          status: "PASS",
          severity: "blocker",
          computedBy: "ltv-check",
        },
      },
      blocked: [{ nodeId: "dtiCheck", missingInputs: ["dti", "maxDTIRatio"] }],
    });

    const eligible = computeEligibility(graphResult, blockerRegistry);
    expect(eligible).toBe(false);
  });

  it("does not auto-fail when blocker check is blocked by unresolved optional inputs", () => {
    // Scenario: dtiCheck is blocked because qualifyingIncomeMonthly was never
    // provided/computed (cascading unavailability). This represents partial
    // evaluation from missing optional data and must NOT fail eligibility.
    const blockerRegistry: EdgeRegistry = new Map([
      [
        "dti-check",
        {
          id: "dti-check",
          kind: "check",
          inputs: ["dti", "maxDTIRatio"],
          outputs: ["dtiCheck"],
          confidence: "derived",
          metadata: { category: "check", severity: "blocker" },
          compute: () => ({}),
        },
      ],
      [
        "ltv-check",
        {
          id: "ltv-check",
          kind: "check",
          inputs: ["ltv", "maxLTVRatio"],
          outputs: ["ltvCheck"],
          confidence: "derived",
          metadata: { category: "check", severity: "blocker" },
          compute: () => ({}),
        },
      ],
    ]);

    const graphResult = emptyEvalResult({
      checks: {
        ltvCheck: {
          key: "ltvCheck",
          status: "PASS",
          severity: "blocker",
          computedBy: "ltv-check",
        },
      },
      blocked: [
        // dti is itself unresolved, so dtiCheck cascades from unavailable data
        { nodeId: "dtiCheck", missingInputs: ["dti"] },
      ],
    });

    const eligible = computeEligibility(graphResult, blockerRegistry);
    // Should NOT auto-fail: the check simply could not run due to missing data
    expect(eligible).toBe(true);
  });

  it("marks ineligible when no checks computed at all (empty evaluation)", () => {
    const emptyRegistry: EdgeRegistry = new Map();
    const graphResult = emptyEvalResult();
    const eligible = computeEligibility(graphResult, emptyRegistry);
    expect(eligible).toBe(false);
  });

  it("marks ineligible when a blocker-severity check edge has an error", () => {
    const blockerRegistry: EdgeRegistry = new Map([
      [
        "dti-check",
        {
          id: "dti-check",
          kind: "check",
          inputs: ["dti", "maxDTIRatio"],
          outputs: ["dtiCheck"],
          confidence: "derived",
          metadata: { category: "check", severity: "blocker" },
          compute: () => ({}),
        },
      ],
    ]);

    const graphResult = emptyEvalResult({
      checks: {
        ltvCheck: {
          key: "ltvCheck",
          status: "PASS",
          severity: "blocker",
        },
      },
      errors: [
        {
          edgeId: "dti-check",
          message: "Division by zero in DTI computation",
        },
      ],
    });

    const eligible = computeEligibility(graphResult, blockerRegistry);
    expect(eligible).toBe(false);
  });
});

describe("property-tax estimation when omitted", () => {
  it("uses estimated property tax when not provided explicitly", () => {
    const transaction = createTransaction();
    // Remove propertyTax to trigger estimation
    delete (transaction.scenario.monthlyHousing as Record<string, unknown>)["propertyTax"];
    const variant = getVariant(transaction);
    const result = evaluate(transaction, variant, baseProduct);
    // The engine should still produce a result without crashing
    expect(result).toBeDefined();
    // If the graph has an estimate edge for propertyTax, it should appear in estimatesUsed
    // or propertyTax should still resolve to some value (default or estimated)
    const hasPitiOrEstimate =
      result.computed["pitiMonthly"] !== undefined ||
      result.estimatesUsed.some((e) => e.nodeId === "propertyTax");
    expect(hasPitiOrEstimate).toBe(true);
  });

  it("prefers provided property tax over estimate", () => {
    const transaction = createTransaction();
    // Explicitly provide a property tax value
    transaction.scenario.monthlyHousing.propertyTax = money(600);
    const variant = getVariant(transaction);
    const result = evaluate(transaction, variant, baseProduct);
    // propertyTax should appear in inputs as provided, not in estimatesUsed
    const inInputs = result.inputs["propertyTax"];
    if (inInputs) {
      expect(inInputs.source).toBe("provided");
    }
    const estimatedPropertyTax = result.estimatesUsed.find((e) => e.nodeId === "propertyTax");
    expect(estimatedPropertyTax).toBeUndefined();
  });
});

describe("first-class check extraction", () => {
  it("extracts checks from result.checks directly", () => {
    const graphResult = emptyEvalResult({
      checks: {
        ltvCheck: {
          key: "ltvCheck",
          status: "PASS",
          actual: "0.8",
          limit: "0.9",
          severity: "blocker",
        },
        dtiCheck: {
          key: "dtiCheck",
          status: "FAIL",
          actual: "0.55",
          limit: "0.45",
          message: "DTI exceeds limit",
          severity: "blocker",
        },
        appraisalCheck: {
          key: "appraisalCheck",
          status: "WARN",
          message: "Appraisal waiver eligible",
          severity: "warning",
        },
      },
    });

    const checks = extractChecksFromGraph(graphResult);
    expect(checks.length).toBe(3);

    const ltv = checks.find((c) => c.key === "ltvCheck");
    expect(ltv).toBeDefined();
    expect(ltv?.status).toBe(CheckStatus.PASS);
    expect(ltv?.actual).toBe("0.8");
    expect(ltv?.limit).toBe("0.9");

    const dti = checks.find((c) => c.key === "dtiCheck");
    expect(dti).toBeDefined();
    expect(dti?.status).toBe(CheckStatus.FAIL);
    expect(dti?.message).toBe("DTI exceeds limit");

    const appraisal = checks.find((c) => c.key === "appraisalCheck");
    expect(appraisal).toBeDefined();
    expect(appraisal?.status).toBe(CheckStatus.WARN);
  });

  it("returns empty array when no checks present", () => {
    const graphResult = emptyEvalResult();
    const checks = extractChecksFromGraph(graphResult);
    expect(checks).toEqual([]);
  });
});

describe("scoped response shape", () => {
  it("preserves distinct inputScope and effectiveScope from graph result", () => {
    const graphResult = emptyEvalResult({
      inputScope: ["loanAmount", "fico", "propertyValue"],
      effectiveScope: ["loanAmount", "fico", "propertyValue", "ltv", "dti", "pitiMonthly"],
      checks: {
        ltvCheck: {
          key: "ltvCheck",
          status: "PASS",
          severity: "blocker",
        },
      },
    });

    const scoped = buildScopedResponse(createTransaction(), [baseProduct], graphResult);
    expect(scoped.inputScope).toEqual(["loanAmount", "fico", "propertyValue"]);
    expect(scoped.effectiveScope).toEqual([
      "loanAmount",
      "fico",
      "propertyValue",
      "ltv",
      "dti",
      "pitiMonthly",
    ]);
  });

  it("surfaces estimatesUsed from graph structural data", () => {
    const graphResult = emptyEvalResult({
      checks: {
        ltvCheck: {
          key: "ltvCheck",
          status: "PASS",
          severity: "blocker",
        },
      },
      estimatesUsed: [
        {
          nodeId: "propertyTax",
          estimatedBy: "estimate-property-tax",
          value: 500,
        },
      ],
    });

    const scoped = buildScopedResponse(createTransaction(), [baseProduct], graphResult);
    expect(scoped.estimatesUsed.length).toBe(1);
    const firstEstimate = scoped.estimatesUsed[0];
    expect(firstEstimate).toBeDefined();
    expect(firstEstimate?.field).toBe("propertyTax");
    expect(firstEstimate?.value).toBe(500);
    expect(firstEstimate?.source).toBe("estimate-property-tax");
  });

  it("populates blocked[].unlocksFeatures for blocked nodes", () => {
    const graphResult = emptyEvalResult({
      checks: {
        ltvCheck: {
          key: "ltvCheck",
          status: "PASS",
          severity: "blocker",
        },
      },
      blocked: [
        { nodeId: "qualifyingIncomeMonthly", missingInputs: ["borrowers"] },
        {
          nodeId: "dtiCheck",
          missingInputs: ["qualifyingIncomeMonthly"],
        },
      ],
    });

    const scoped = buildScopedResponse(createTransaction(), [baseProduct], graphResult);
    expect(scoped.blocked.length).toBe(2);
    const incomeBlocked = scoped.blocked.find((b) => b.nodeId === "qualifyingIncomeMonthly");
    expect(incomeBlocked).toBeDefined();
    // dtiCheck depends on qualifyingIncomeMonthly, so it should show as an unlocked feature
    expect(incomeBlocked?.unlocksFeatures).toContain("dtiCheck");
  });
});

describe("eligibility aggregation edge cases", () => {
  it("returns true when all blocker checks pass", () => {
    const registry: EdgeRegistry = new Map([
      [
        "ltv-check",
        {
          id: "ltv-check",
          kind: "check",
          inputs: ["ltv", "maxLTVRatio"],
          outputs: ["ltvCheck"],
          confidence: "derived",
          metadata: { category: "check", severity: "blocker" },
          compute: () => ({}),
        },
      ],
    ]);

    const graphResult = emptyEvalResult({
      checks: {
        ltvCheck: {
          key: "ltvCheck",
          status: "PASS",
          severity: "blocker",
          computedBy: "ltv-check",
        },
      },
    });

    expect(computeEligibility(graphResult, registry)).toBe(true);
  });

  it("returns false when a blocker check fails", () => {
    const registry: EdgeRegistry = new Map([
      [
        "ltv-check",
        {
          id: "ltv-check",
          kind: "check",
          inputs: ["ltv", "maxLTVRatio"],
          outputs: ["ltvCheck"],
          confidence: "derived",
          metadata: { category: "check", severity: "blocker" },
          compute: () => ({}),
        },
      ],
    ]);

    const graphResult = emptyEvalResult({
      checks: {
        ltvCheck: {
          key: "ltvCheck",
          status: "FAIL",
          severity: "blocker",
          computedBy: "ltv-check",
        },
      },
    });

    expect(computeEligibility(graphResult, registry)).toBe(false);
  });

  it("returns true when a warning check fails but no blocker fails", () => {
    const registry: EdgeRegistry = new Map([
      [
        "ltv-check",
        {
          id: "ltv-check",
          kind: "check",
          inputs: ["ltv", "maxLTVRatio"],
          outputs: ["ltvCheck"],
          confidence: "derived",
          metadata: { category: "check", severity: "blocker" },
          compute: () => ({}),
        },
      ],
      [
        "appraisal-check",
        {
          id: "appraisal-check",
          kind: "check",
          inputs: ["loanAmount"],
          outputs: ["appraisalCheck"],
          confidence: "derived",
          metadata: { category: "check", severity: "warning" },
          compute: () => ({}),
        },
      ],
    ]);

    const graphResult = emptyEvalResult({
      checks: {
        ltvCheck: {
          key: "ltvCheck",
          status: "PASS",
          severity: "blocker",
          computedBy: "ltv-check",
        },
        appraisalCheck: {
          key: "appraisalCheck",
          status: "FAIL",
          severity: "warning",
          computedBy: "appraisal-check",
        },
      },
    });

    expect(computeEligibility(graphResult, registry)).toBe(true);
  });
});
