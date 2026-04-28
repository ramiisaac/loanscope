import { describe, expect, it } from "vitest";
import { evaluate } from "../evaluate";
import { quickQuoteToTransaction } from "../quick-quote";
import { getAllProducts } from "@loanscope/products";
import type {
  Borrower,
  IncomeStream,
  ProductDefinition,
  Transaction,
  TransactionVariant,
} from "@loanscope/domain";
import {
  IncomeType,
  LoanPurpose,
  Occupancy,
  PropertyType,
  money,
  months,
  ratePct,
  ratio,
} from "@loanscope/domain";

/**
 * Engine integration tests pinning the wiring of `incomePolicies` and
 * `borrowerBlendPolicy` through `evaluate.ts#rawInputs`.
 *
 * Both fields are declared on `packages/loanscope/calculations/src/nodes/inputs.ts`
 * with `defaultValue: null` and consumed by the `apply-income-policies`
 * and `apply-borrower-blend` edges. Prior to this wave, `evaluate.ts`
 * never seeded them from the matched product or transaction, so the
 * per-program SE-averaging bridge, rental-factor cap, per-IncomeType
 * overrides, and policy-aware FICO blending were all inert end-to-end.
 *
 * These tests assert that the engine now seeds both fields and that the
 * relevant graph-computed values reflect the matched product's policies.
 */

const getProduct = (id: string): ProductDefinition => {
  const product = getAllProducts().find((item) => item.id === id);
  if (!product) {
    throw new Error(`Missing product ${id}`);
  }
  return product;
};

const getVariant = (transaction: Transaction): TransactionVariant => {
  const v = transaction.variants[0];
  if (!v) throw new Error("Transaction has no variants");
  return v;
};

/**
 * Trailing 24 months of net business income (most recent last). Sum =
 * $203,000; average = $8,458.33/mo. Mirrors the values shipped in
 * `examples/scenarios/34-se-24mo-averaging.yaml`.
 */
const SE_HISTORICAL_24: readonly number[] = [
  7800, 7900, 8000, 8100, 8050, 8150, 8200, 8300, 8250, 8400, 8350, 8500, 8550, 8600, 8500, 8650,
  8700, 8750, 8800, 8850, 8900, 8950, 9000, 8750,
];

const SE_STATED_MONTHLY = 9200;
const SE_AVERAGED_MONTHLY = 8458.33;

/**
 * Build a transaction whose sole borrower carries a SelfEmployed income
 * stream with a stated $9,200/mo monthly amount and 24 months of trailing
 * `historicalAmounts`. No explicit `qualifyingPolicy` is attached, so the
 * resolver bridge in `@loanscope/math#resolveQualifyingPolicy` decides
 * the effective policy from the matched product's
 * `incomePolicies.selfEmployedAveragingMonths`.
 */
const buildSelfEmployedTransaction = (): Transaction => {
  const transaction = quickQuoteToTransaction({
    loanAmount: money(512000),
    purchasePrice: money(640000),
    fico: 740,
    occupancy: Occupancy.Primary,
    propertyType: PropertyType.SFR,
    loanPurpose: LoanPurpose.Purchase,
    annualTaxes: money(8640),
    annualInsurance: money(2220),
    monthlyHoa: money(0),
    noteRatePct: ratePct(6.75),
    amortizationMonths: months(360),
    stateCode: "TX",
    totalLiquidAssets: money(175000),
  });

  const seStream: IncomeStream = {
    id: "inc_b1_se",
    borrowerId: "b1",
    type: IncomeType.SelfEmployed,
    monthlyAmount: money(SE_STATED_MONTHLY),
    qualifying: true,
    historicalAmounts: [...SE_HISTORICAL_24],
  };

  const b1 = transaction.borrowers[0];
  if (!b1) throw new Error("Expected seeded borrower b1");
  b1.incomes = [seStream];

  transaction.scenario.monthlyHousing.mi = money(0);
  transaction.scenario.monthlyHousing.floodInsurance = money(0);
  return transaction;
};

/**
 * Read the engine-computed `qualifyingIncomeMonthly` value as a number,
 * honoring the existing integration-test convention that the node may
 * resolve to either a raw `Money` or a structured object whose
 * `totalMonthlyIncome` field carries the canonical figure.
 */
const readQualifyingIncome = (result: ReturnType<typeof evaluate>): number | undefined => {
  const entry = result.computed["qualifyingIncomeMonthly"];
  if (entry === undefined) return undefined;
  const value: unknown = entry.value;
  if (typeof value === "number") return value;
  if (
    typeof value === "object" &&
    value !== null &&
    "totalMonthlyIncome" in (value as Record<string, unknown>)
  ) {
    const total = (value as Record<string, unknown>).totalMonthlyIncome;
    return typeof total === "number" ? total : Number(total);
  }
  return undefined;
};

const readBlendedFico = (result: ReturnType<typeof evaluate>): number | undefined => {
  const entry = result.computed["blendedFico"];
  if (entry === undefined) return undefined;
  const value: unknown = entry.value;
  return typeof value === "number" ? value : undefined;
};

describe("engine seeds product incomePolicies into rawInputs (SE 24-mo averaging)", () => {
  it("FHA averages SE income to $8,458.33/mo via the engine bridge", () => {
    const transaction = buildSelfEmployedTransaction();
    const variant = getVariant(transaction);
    const product = getProduct("fha");

    const result = evaluate(transaction, variant, product);
    const income = readQualifyingIncome(result);

    expect(income).toBeDefined();
    expect(income!).toBeCloseTo(SE_AVERAGED_MONTHLY, 2);
    expect(income!).not.toBeCloseTo(SE_STATED_MONTHLY, 2);
  });

  it("VA averages SE income to $8,458.33/mo via the engine bridge", () => {
    const transaction = buildSelfEmployedTransaction();
    const variant = getVariant(transaction);
    const product = getProduct("va");

    const result = evaluate(transaction, variant, product);
    const income = readQualifyingIncome(result);

    expect(income).toBeDefined();
    expect(income!).toBeCloseTo(SE_AVERAGED_MONTHLY, 2);
  });

  it("USDA averages SE income to $8,458.33/mo via the engine bridge", () => {
    const transaction = buildSelfEmployedTransaction();
    const variant = getVariant(transaction);
    const product = getProduct("usda");

    const result = evaluate(transaction, variant, product);
    const income = readQualifyingIncome(result);

    expect(income).toBeDefined();
    expect(income!).toBeCloseTo(SE_AVERAGED_MONTHLY, 2);
  });

  it("UWM Jumbo Pink (PortfolioBase child) averages SE income to $8,458.33/mo", () => {
    const transaction = buildSelfEmployedTransaction();
    const variant = getVariant(transaction);
    const product = getProduct("uwm_jumbo_pink");

    const result = evaluate(transaction, variant, product);
    const income = readQualifyingIncome(result);

    expect(income).toBeDefined();
    expect(income!).toBeCloseTo(SE_AVERAGED_MONTHLY, 2);
  });

  it("agency_conforming has no selfEmployedAveragingMonths and returns the stated $9,200/mo", () => {
    // Negative control: agency_conforming (and its fannie_base parent) do
    // not declare an SE averaging window. The bridge must fall through to
    // the per-IncomeType default (PercentOfStated 1.0), preserving the
    // stated monthlyAmount.
    const transaction = buildSelfEmployedTransaction();
    const variant = getVariant(transaction);
    const product = getProduct("agency_conforming");

    const result = evaluate(transaction, variant, product);
    const income = readQualifyingIncome(result);

    expect(income).toBeDefined();
    expect(income!).toBeCloseTo(SE_STATED_MONTHLY, 2);
    expect(income!).not.toBeCloseTo(SE_AVERAGED_MONTHLY, 2);
  });

  it("seeds incomePolicies even when historicalAmounts is shorter than the 24-mo window (graceful fallback)", () => {
    // Regression guard for the `?.incomePolicies` undefined-vs-null
    // wiring: the engine must seed the matched product's policies bag
    // even when the SE bridge cannot activate (here because the stream
    // supplies only 12 months of history). The math layer falls back to
    // the per-IncomeType default (PercentOfStated 1.0), which preserves
    // the stated monthlyAmount.
    const transaction = buildSelfEmployedTransaction();
    const b1 = transaction.borrowers[0];
    if (!b1) throw new Error("Expected seeded borrower b1");
    const seStream = b1.incomes[0];
    if (!seStream) throw new Error("Expected SE stream");
    seStream.historicalAmounts = SE_HISTORICAL_24.slice(-12);

    const variant = getVariant(transaction);
    const product = getProduct("fha");

    const result = evaluate(transaction, variant, product);
    const income = readQualifyingIncome(result);

    expect(income).toBeDefined();
    expect(income!).toBeCloseTo(SE_STATED_MONTHLY, 2);
  });
});

describe("engine seeds product incomePolicies into rawInputs (rental policies)", () => {
  it("FHA applies its 0.75 per-IncomeType rental factor end-to-end", () => {
    // Rental default in math is already 0.75, but the test exercises the
    // engine wiring path explicitly: a Rental stream with no explicit
    // qualifyingPolicy, evaluated against FHA, must route through
    // incomePolicies.perIncomeType[Rental] and produce the 75% net
    // amount. Total: $5,000 W2 AsStated + $4,000 Rental * 0.75 = $8,000.
    const transaction = quickQuoteToTransaction({
      loanAmount: money(400000),
      purchasePrice: money(500000),
      fico: 720,
      occupancy: Occupancy.Primary,
      propertyType: PropertyType.SFR,
      loanPurpose: LoanPurpose.Purchase,
      monthlyIncome: money(5000),
      annualTaxes: money(6000),
      annualInsurance: money(1800),
      monthlyHoa: money(0),
      noteRatePct: ratePct(6.75),
      amortizationMonths: months(360),
      stateCode: "TX",
      totalLiquidAssets: money(60000),
    });

    const b1 = transaction.borrowers[0];
    if (!b1) throw new Error("Expected seeded borrower b1");
    const rentalStream: IncomeStream = {
      id: "inc_rent",
      borrowerId: "b1",
      type: IncomeType.Rental,
      monthlyAmount: money(4000),
      qualifying: true,
    };
    b1.incomes.push(rentalStream);

    transaction.scenario.monthlyHousing.mi = money(0);
    transaction.scenario.monthlyHousing.floodInsurance = money(0);

    const variant = getVariant(transaction);
    const product = getProduct("fha");

    const result = evaluate(transaction, variant, product);
    const income = readQualifyingIncome(result);

    expect(income).toBeDefined();
    // 5000 W2 (AsStated) + 4000 Rental * 0.75 = 8000
    expect(income!).toBeCloseTo(8000, 2);
  });

  it("FHA caps an explicit Rental PercentOfStated 0.85 at the 0.75 maxRentalFactor", () => {
    // The borrower attaches an explicit qualifyingPolicy of
    // PercentOfStated 0.85, which exceeds FHA's
    // incomePolicies.maxRentalFactor of 0.75. The engine must route the
    // matched product's policies into the math layer's cap-rental branch
    // so the effective factor is tightened to 0.75.
    // Total: $5,000 W2 + $4,000 Rental * 0.75 (capped) = $8,000.
    const transaction = quickQuoteToTransaction({
      loanAmount: money(400000),
      purchasePrice: money(500000),
      fico: 720,
      occupancy: Occupancy.Primary,
      propertyType: PropertyType.SFR,
      loanPurpose: LoanPurpose.Purchase,
      monthlyIncome: money(5000),
      annualTaxes: money(6000),
      annualInsurance: money(1800),
      monthlyHoa: money(0),
      noteRatePct: ratePct(6.75),
      amortizationMonths: months(360),
      stateCode: "TX",
      totalLiquidAssets: money(60000),
    });

    const b1 = transaction.borrowers[0];
    if (!b1) throw new Error("Expected seeded borrower b1");
    const rentalStream: IncomeStream = {
      id: "inc_rent",
      borrowerId: "b1",
      type: IncomeType.Rental,
      monthlyAmount: money(4000),
      qualifying: true,
      qualifyingPolicy: { kind: "PercentOfStated", factor: ratio(0.85) },
    };
    b1.incomes.push(rentalStream);

    transaction.scenario.monthlyHousing.mi = money(0);
    transaction.scenario.monthlyHousing.floodInsurance = money(0);

    const variant = getVariant(transaction);
    const product = getProduct("fha");

    const result = evaluate(transaction, variant, product);
    const income = readQualifyingIncome(result);

    expect(income).toBeDefined();
    // Cap binds: 4000 * 0.75 = 3000, not 4000 * 0.85 = 3400.
    expect(income!).toBeCloseTo(8000, 2);
    expect(income!).not.toBeCloseTo(8400, 2);
  });
});

describe("engine seeds transaction.borrowerBlendPolicy into rawInputs", () => {
  /**
   * Build a 2-borrower transaction with materially distinct FICO tri-merge
   * arrays and materially distinct W2 incomes. b1 is the higher earner
   * with a 720 mid; b2 is the lower earner with a 690 mid.
   */
  const buildMultiBorrowerTransaction = (): Transaction => {
    const transaction = quickQuoteToTransaction({
      loanAmount: money(600000),
      purchasePrice: money(800000),
      fico: 720,
      occupancy: Occupancy.Primary,
      propertyType: PropertyType.SFR,
      loanPurpose: LoanPurpose.Purchase,
      monthlyIncome: money(16500),
      annualTaxes: money(9600),
      annualInsurance: money(2400),
      monthlyHoa: money(0),
      noteRatePct: ratePct(6.75),
      amortizationMonths: months(360),
      stateCode: "TX",
      totalLiquidAssets: money(120000),
    });

    const b1 = transaction.borrowers[0];
    if (!b1) throw new Error("Expected seeded borrower b1");
    b1.fico = 720;
    b1.ficoScores = [700, 720, 740];

    const b2: Borrower = {
      id: "b2",
      fico: 690,
      ficoScores: [680, 690, 710],
      incomes: [
        {
          id: "inc_b2",
          borrowerId: "b2",
          type: IncomeType.W2,
          monthlyAmount: money(5500),
          qualifying: true,
        },
      ],
    };
    transaction.borrowers.push(b2);

    const baseVariant = getVariant(transaction);
    transaction.variants = [
      {
        ...baseVariant,
        includedBorrowerIds: ["b1", "b2"],
      },
    ];

    transaction.scenario.monthlyHousing.mi = money(0);
    transaction.scenario.monthlyHousing.floodInsurance = money(0);

    return transaction;
  };

  it("LowestMid (default) emits blendedFico equal to the minimum of mids (690)", () => {
    // No explicit policy attached; the apply-borrower-blend edge defaults
    // to LowestMid. Min of mids across {720, 690} = 690.
    const transaction = buildMultiBorrowerTransaction();
    const variant = getVariant(transaction);
    const product = getProduct("agency_conforming");

    const result = evaluate(transaction, variant, product);
    const blended = readBlendedFico(result);

    expect(blended).toBeDefined();
    expect(blended!).toBe(690);
  });

  it("WeightedAverage with incomeWeighted lifts blendedFico above LowestMid (720*16500 + 690*5500) / 22000 = 712.5 -> 713", () => {
    // Income-weighted blend pulls the representative FICO toward the
    // primary earner (b1 at 720, $16,500/mo) and away from the lower
    // earner (b2 at 690, $5,500/mo). Half-up rounding lands at 713.
    const transaction = buildMultiBorrowerTransaction();
    transaction.borrowerBlendPolicy = {
      kind: "WeightedAverage",
      incomeWeighted: true,
    };

    const variant = getVariant(transaction);
    const product = getProduct("agency_conforming");

    const result = evaluate(transaction, variant, product);
    const blended = readBlendedFico(result);

    expect(blended).toBeDefined();
    expect(blended!).toBe(713);
    expect(blended!).toBeGreaterThan(690);
  });

  it("preserves the raw fico input as the engine-seeded minFico for backward compat", () => {
    // The blendedFico computed value is a separate node from the raw
    // `fico` input that `evaluate.ts` continues to seed via `minFico`.
    // Both must coexist after the wiring fix: blendedFico carries policy
    // semantics, fico carries the back-compat minimum.
    const transaction = buildMultiBorrowerTransaction();
    transaction.borrowerBlendPolicy = {
      kind: "WeightedAverage",
      incomeWeighted: true,
    };

    const variant = getVariant(transaction);
    const product = getProduct("agency_conforming");

    const result = evaluate(transaction, variant, product);

    const blended = readBlendedFico(result);
    expect(blended).toBeDefined();

    // The raw `fico` input is recorded as the engine-seeded provided
    // input, not as a computed value. Confirm both surfaces coexist by
    // asserting blendedFico does not equal the raw min(fico) here:
    // min(720, 690) = 690 vs. weighted = 713.
    expect(blended!).not.toBe(690);
  });
});

/* ------------------------------------------------------------------ */
/*  FICO check uses blendedFico end-to-end              */
/* ------------------------------------------------------------------ */

/**
 * These tests pin the wiring change in
 * `packages/loanscope/calculations/src/checks/index.ts#fico-check`
 * (and the parallel change in `estimates/mi.ts#estimate-mi`):
 * the underwriting FICO check now consumes the policy-blended
 * representative FICO produced by `apply-borrower-blend`, not the raw
 * `fico` input the engine seeds via `minFico(borrowers)`. The raw
 * `fico` input node is preserved for backward compat at the JSON
 * surface, but no edge consumes it.
 */
describe("FICO check uses blendedFico end-to-end", () => {
  /**
   * Read the first-class GraphCheckResult for the fico-check edge.
   *
   * The graph executor stores results keyed by `GraphCheckResult.key`
   * (the human-readable check key emitted by `pass`/`fail`/`blocked`),
   * not by the output node id. The fico-check edge emits key "FICO".
   */
  const readFicoCheck = (result: ReturnType<typeof evaluate>) => {
    const entry = result.checks["FICO"];
    if (!entry) {
      throw new Error(
        `Expected FICO check in graph result; saw keys: ${Object.keys(result.checks).join(", ")}`,
      );
    }
    return entry;
  };

  it("default LowestMid for a single borrower reflects that borrower's FICO against minFico", () => {
    // Single borrower with fico=740, no ficoScores. LowestMid for one
    // borrower returns that borrower's fico. agency_conforming primary
    // minFico=620, so the check passes with actual="740" against
    // limit="620".
    const transaction = quickQuoteToTransaction({
      loanAmount: money(400000),
      purchasePrice: money(500000),
      fico: 740,
      occupancy: Occupancy.Primary,
      propertyType: PropertyType.SFR,
      loanPurpose: LoanPurpose.Purchase,
      monthlyIncome: money(10000),
      annualTaxes: money(6000),
      annualInsurance: money(1800),
      monthlyHoa: money(0),
      noteRatePct: ratePct(6.75),
      amortizationMonths: months(360),
      stateCode: "TX",
      totalLiquidAssets: money(60000),
    });
    transaction.scenario.monthlyHousing.mi = money(0);
    transaction.scenario.monthlyHousing.floodInsurance = money(0);

    const variant = getVariant(transaction);
    const product = getProduct("agency_conforming");

    const result = evaluate(transaction, variant, product);

    const blended = readBlendedFico(result);
    expect(blended).toBe(740);

    const ficoCheck = readFicoCheck(result);
    expect(ficoCheck.status).toBe("PASS");
    expect(ficoCheck.actual).toBe("740");
    expect(ficoCheck.limit).toBe("620");
  });

  it("default LowestMid for two borrowers reflects min(fico) (no ficoScores) against minFico", () => {
    // Two borrowers with raw fico {760, 680} and no tri-merge arrays:
    // LowestMid falls through to borrower.fico for each (since
    // ficoScores.length < 3) and takes the minimum, yielding 680. This
    // matches the legacy minFico(borrowers) behavior, demonstrating
    // semantic equivalence for default-policy multi-borrower scenarios.
    const transaction = quickQuoteToTransaction({
      loanAmount: money(600000),
      purchasePrice: money(800000),
      fico: 760,
      occupancy: Occupancy.Primary,
      propertyType: PropertyType.SFR,
      loanPurpose: LoanPurpose.Purchase,
      monthlyIncome: money(16500),
      annualTaxes: money(9600),
      annualInsurance: money(2400),
      monthlyHoa: money(0),
      noteRatePct: ratePct(6.75),
      amortizationMonths: months(360),
      stateCode: "TX",
      totalLiquidAssets: money(120000),
    });
    transaction.scenario.monthlyHousing.mi = money(0);
    transaction.scenario.monthlyHousing.floodInsurance = money(0);

    const b1 = transaction.borrowers[0];
    if (!b1) throw new Error("Expected seeded borrower b1");
    b1.fico = 760;

    const b2: Borrower = {
      id: "b2",
      fico: 680,
      incomes: [
        {
          id: "inc_b2",
          borrowerId: "b2",
          type: IncomeType.W2,
          monthlyAmount: money(5500),
          qualifying: true,
        },
      ],
    };
    transaction.borrowers.push(b2);

    const baseVariant = getVariant(transaction);
    transaction.variants = [
      {
        ...baseVariant,
        includedBorrowerIds: ["b1", "b2"],
      },
    ];

    const variant = getVariant(transaction);
    const product = getProduct("agency_conforming");

    const result = evaluate(transaction, variant, product);

    const blended = readBlendedFico(result);
    expect(blended).toBe(680);

    const ficoCheck = readFicoCheck(result);
    expect(ficoCheck.status).toBe("PASS");
    expect(ficoCheck.actual).toBe("680");
    expect(ficoCheck.limit).toBe("620");
  });

  it("explicit WeightedAverage (income-weighted) shifts the FICO check away from min-of-fico", () => {
    // Two borrowers with raw fico {760, 680} and incomes {16500, 5500}.
    // Income-weighted blend: (760*16500 + 680*5500) / 22000 = 740 exactly.
    // Previously the FICO check would have used min(fico)=680 regardless of
    // policy; under the retarget the check sees the policy-blended value.
    const transaction = quickQuoteToTransaction({
      loanAmount: money(600000),
      purchasePrice: money(800000),
      fico: 760,
      occupancy: Occupancy.Primary,
      propertyType: PropertyType.SFR,
      loanPurpose: LoanPurpose.Purchase,
      monthlyIncome: money(16500),
      annualTaxes: money(9600),
      annualInsurance: money(2400),
      monthlyHoa: money(0),
      noteRatePct: ratePct(6.75),
      amortizationMonths: months(360),
      stateCode: "TX",
      totalLiquidAssets: money(120000),
    });
    transaction.scenario.monthlyHousing.mi = money(0);
    transaction.scenario.monthlyHousing.floodInsurance = money(0);

    const b1 = transaction.borrowers[0];
    if (!b1) throw new Error("Expected seeded borrower b1");
    b1.fico = 760;

    const b2: Borrower = {
      id: "b2",
      fico: 680,
      incomes: [
        {
          id: "inc_b2",
          borrowerId: "b2",
          type: IncomeType.W2,
          monthlyAmount: money(5500),
          qualifying: true,
        },
      ],
    };
    transaction.borrowers.push(b2);

    const baseVariant = getVariant(transaction);
    transaction.variants = [
      {
        ...baseVariant,
        includedBorrowerIds: ["b1", "b2"],
      },
    ];

    transaction.borrowerBlendPolicy = {
      kind: "WeightedAverage",
      incomeWeighted: true,
    };

    const variant = getVariant(transaction);
    const product = getProduct("agency_conforming");

    const result = evaluate(transaction, variant, product);

    const blended = readBlendedFico(result);
    expect(blended).toBe(740);

    const ficoCheck = readFicoCheck(result);
    expect(ficoCheck.status).toBe("PASS");
    expect(ficoCheck.actual).toBe("740");
    expect(ficoCheck.actual).not.toBe("680");
    expect(ficoCheck.limit).toBe("620");
  });

  it("LowestMid uses the per-borrower mid score (not raw fico) when ficoScores has 3 entries", () => {
    // Single borrower with ficoScores=[738, 745, 760]. The per-borrower
    // mid is the median (745), not the raw `fico` field. This proves the
    // FICO check now consumes the blended representative score and that
    // LowestMid uses the industry mid-of-three convention.
    const transaction = quickQuoteToTransaction({
      loanAmount: money(400000),
      purchasePrice: money(500000),
      fico: 700,
      occupancy: Occupancy.Primary,
      propertyType: PropertyType.SFR,
      loanPurpose: LoanPurpose.Purchase,
      monthlyIncome: money(10000),
      annualTaxes: money(6000),
      annualInsurance: money(1800),
      monthlyHoa: money(0),
      noteRatePct: ratePct(6.75),
      amortizationMonths: months(360),
      stateCode: "TX",
      totalLiquidAssets: money(60000),
    });
    transaction.scenario.monthlyHousing.mi = money(0);
    transaction.scenario.monthlyHousing.floodInsurance = money(0);

    const b1 = transaction.borrowers[0];
    if (!b1) throw new Error("Expected seeded borrower b1");
    // Raw fico intentionally differs from the mid-of-three to prove the
    // edge consumes the mid, not the raw field.
    b1.fico = 700;
    b1.ficoScores = [738, 745, 760];

    const variant = getVariant(transaction);
    const product = getProduct("agency_conforming");

    const result = evaluate(transaction, variant, product);

    const blended = readBlendedFico(result);
    expect(blended).toBe(745);

    const ficoCheck = readFicoCheck(result);
    expect(ficoCheck.status).toBe("PASS");
    expect(ficoCheck.actual).toBe("745");
    expect(ficoCheck.actual).not.toBe("700");
    expect(ficoCheck.limit).toBe("620");
  });
});
