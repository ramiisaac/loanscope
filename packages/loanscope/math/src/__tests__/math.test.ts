import { describe, expect, it } from "vitest";
import {
  calculateLTV,
  calculateCLTV,
  ltvToLoanAmount,
  loanPaydownForTargetLTV,
  downPaymentFromLTV,
  calculatePMTFixed,
  calculateInterestOnlyPayment,
  calculateTotalInterest,
  calculateQualifyingPayment,
  calculateARMQualifyingRate,
  calculateDTI,
  maxPaymentForDTI,
  debtReductionForTargetDTI,
  incomeRequiredForDTI,
  sumQualifyingIncome,
  deriveQualifyingIncome,
  allocateAssets,
  applyHaircut,
  filterReservesEligible,
  calculateRequiredReserves,
  resolveReserveMonths,
  estimatePropertyTax,
  estimateInsurance,
  estimateHoa,
  estimateMI,
  estimateClosingCosts,
} from "../index";
import {
  AssetType,
  LoanPurpose,
  Occupancy,
  ProgramKind,
  PropertyType,
  money,
  months,
  ratePct,
  ratio,
} from "@loanscope/domain";
import type {
  Asset,
  Borrower,
  IncomeStream,
  QualifyingPaymentPolicy,
  RateNote,
  ReservesPolicy,
} from "@loanscope/domain";

// ---------------------------------------------------------------------------
// LTV calculations
// ---------------------------------------------------------------------------
describe("ltv calculations", () => {
  it("calculates LTV and CLTV", () => {
    expect(Number(calculateLTV(money(800000), money(1000000)))).toBeCloseTo(0.8, 6);
    expect(Number(calculateCLTV(money(800000), [money(100000)], money(1000000)))).toBeCloseTo(
      0.9,
      6,
    );
  });

  it("derives loan amount and paydown from LTV", () => {
    expect(Number(ltvToLoanAmount(ratio(0.75), money(1000000)))).toBeCloseTo(750000, 2);
    expect(Number(loanPaydownForTargetLTV(money(900000), money(1000000), ratio(0.8)))).toBeCloseTo(
      100000,
      2,
    );
    expect(Number(downPaymentFromLTV(money(1000000), ratio(0.8)))).toBeCloseTo(200000, 2);
  });

  it("throws on divide-by-zero when propertyValue is 0", () => {
    expect(() => calculateLTV(money(100000), money(0))).toThrow(RangeError);
    expect(() => calculateCLTV(money(100000), [], money(0))).toThrow(RangeError);
  });

  it("throws on negative loanAmount", () => {
    expect(() => calculateLTV(money(-1), money(100000))).toThrow(RangeError);
    expect(() => calculateCLTV(money(-1), [], money(100000))).toThrow(RangeError);
  });

  it("throws on negative propertyValue", () => {
    expect(() => calculateLTV(money(100000), money(-500000))).toThrow(RangeError);
    expect(() => calculateCLTV(money(100000), [], money(-500000))).toThrow(RangeError);
  });

  it("throws on negative subordinate lien values in CLTV", () => {
    expect(() => calculateCLTV(money(100000), [money(-50000)], money(500000))).toThrow(RangeError);
    expect(() => calculateCLTV(money(100000), [money(10000), money(-1)], money(500000))).toThrow(
      RangeError,
    );
  });

  it("throws on non-finite loanAmount or propertyValue", () => {
    expect(() => calculateLTV(money(NaN), money(100000))).toThrow(RangeError);
    expect(() => calculateLTV(money(100000), money(Infinity))).toThrow(RangeError);
    expect(() => calculateCLTV(money(Infinity), [], money(100000))).toThrow(RangeError);
  });

  it("handles zero loanAmount with positive property value", () => {
    expect(Number(calculateLTV(money(0), money(500000)))).toBeCloseTo(0, 6);
  });

  it("CLTV with empty subordinate liens equals LTV", () => {
    const ltv = calculateLTV(money(200000), money(400000));
    const cltv = calculateCLTV(money(200000), [], money(400000));
    expect(Number(cltv)).toBeCloseTo(Number(ltv), 6);
  });

  it("CLTV aggregates multiple subordinate liens", () => {
    const cltv = calculateCLTV(
      money(500000),
      [money(50000), money(25000), money(25000)],
      money(1000000),
    );
    expect(Number(cltv)).toBeCloseTo(0.6, 6);
  });

  it("ltvToLoanAmount rejects non-positive propertyValue", () => {
    expect(() => ltvToLoanAmount(ratio(0.8), money(0))).toThrow(RangeError);
    expect(() => ltvToLoanAmount(ratio(0.8), money(-100))).toThrow(RangeError);
  });

  it("loanPaydownForTargetLTV rejects negative currentLoan", () => {
    expect(() => loanPaydownForTargetLTV(money(-1), money(500000), ratio(0.8))).toThrow(RangeError);
  });

  it("downPaymentFromLTV rejects zero propertyValue", () => {
    expect(() => downPaymentFromLTV(money(0), ratio(0.8))).toThrow(RangeError);
  });
});

// ---------------------------------------------------------------------------
// Payment math
// ---------------------------------------------------------------------------
describe("payment math", () => {
  it("calculates fixed PMT", () => {
    const payment = calculatePMTFixed(money(100000), ratePct(6), months(360));
    expect(Number(payment)).toBeCloseTo(599.55, 2);
  });

  it("calculates interest-only payment", () => {
    const payment = calculateInterestOnlyPayment(money(100000), ratePct(6));
    expect(Number(payment)).toBeCloseTo(500, 2);
  });

  it("handles zero-rate loan (PMT = principal / months)", () => {
    const payment = calculatePMTFixed(money(120000), ratePct(0), months(360));
    expect(Number(payment)).toBeCloseTo(333.33, 2);
  });

  it("zero-rate loan for 12 months divides evenly", () => {
    const payment = calculatePMTFixed(money(12000), ratePct(0), months(12));
    expect(Number(payment)).toBeCloseTo(1000, 2);
  });

  it("throws on non-positive amortization months", () => {
    expect(() => calculatePMTFixed(money(100000), ratePct(6), months(0))).toThrow(RangeError);
    expect(() => calculatePMTFixed(money(100000), ratePct(6), months(-12))).toThrow(RangeError);
  });

  it("throws on negative principal", () => {
    expect(() => calculatePMTFixed(money(-100000), ratePct(6), months(360))).toThrow(RangeError);
  });

  it("throws on non-finite inputs", () => {
    expect(() => calculatePMTFixed(money(NaN), ratePct(6), months(360))).toThrow(RangeError);
    expect(() => calculatePMTFixed(money(100000), ratePct(Infinity), months(360))).toThrow(
      RangeError,
    );
    expect(() => calculatePMTFixed(money(100000), ratePct(6), months(NaN))).toThrow(RangeError);
  });

  it("throws on non-finite interest-only inputs", () => {
    expect(() => calculateInterestOnlyPayment(money(NaN), ratePct(6))).toThrow(RangeError);
    expect(() => calculateInterestOnlyPayment(money(100000), ratePct(Infinity))).toThrow(
      RangeError,
    );
  });

  it("throws on negative principal for interest-only", () => {
    expect(() => calculateInterestOnlyPayment(money(-1), ratePct(6))).toThrow(RangeError);
  });

  it("clamps negative total interest to 0", () => {
    // Overpayment scenario: monthly payment exceeds what amortization would produce
    const totalInterest = calculateTotalInterest(money(100000), money(200), months(360));
    // 200 * 360 = 72000 < 100000, so interest would be negative without clamp
    expect(Number(totalInterest)).toBe(0);
  });

  it("calculates positive total interest normally", () => {
    const totalInterest = calculateTotalInterest(money(100000), money(599.55), months(360));
    expect(Number(totalInterest)).toBeGreaterThan(0);
    expect(Number(totalInterest)).toBeCloseTo(115838, 0);
  });

  it("throws on non-positive amort months in total interest", () => {
    expect(() => calculateTotalInterest(money(100000), money(500), months(0))).toThrow(RangeError);
    expect(() => calculateTotalInterest(money(100000), money(500), months(-1))).toThrow(RangeError);
  });

  it("throws on non-finite total interest inputs", () => {
    expect(() => calculateTotalInterest(money(NaN), money(500), months(360))).toThrow(RangeError);
    expect(() => calculateTotalInterest(money(100000), money(Infinity), months(360))).toThrow(
      RangeError,
    );
  });

  it("zero principal with zero rate returns zero payment", () => {
    const payment = calculatePMTFixed(money(0), ratePct(0), months(360));
    expect(Number(payment)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Qualifying payment policies
// ---------------------------------------------------------------------------
describe("qualifying payment policies", () => {
  it("uses note payment and IO when product is interest-only", () => {
    const policy: QualifyingPaymentPolicy = { kind: "NotePayment" };
    const rateNote: RateNote = {
      noteRatePct: ratePct(6),
      productKind: ProgramKind.InterestOnly,
      interestOnlyMonths: months(60),
      amortizationMonths: 360,
    };
    const payment = calculateQualifyingPayment(money(100000), rateNote, policy);
    expect(Number(payment)).toBeCloseTo(500, 2);
  });

  it("uses fully amortizing payment for IO qualify policy", () => {
    const policy: QualifyingPaymentPolicy = {
      kind: "IOUsesFullyAmortizing",
      amortMonths: months(360),
    };
    const rateNote: RateNote = {
      noteRatePct: ratePct(6),
      amortizationMonths: 360,
    };
    const payment = calculateQualifyingPayment(money(100000), rateNote, policy);
    expect(Number(payment)).toBeCloseTo(599.55, 2);
  });

  it("computes ARM qualifying rate with note plus policy", () => {
    const rate = calculateARMQualifyingRate(ratePct(6), ratePct(7), {
      kind: "ARMQualifyMaxNotePlus",
      addPctPoints: ratePct(2),
    });
    expect(Number(rate)).toBeCloseTo(8, 6);
  });

  it("uses fully indexed rate when higher than note", () => {
    const rate = calculateARMQualifyingRate(ratePct(5), ratePct(6), {
      kind: "ARMQualifyFullyIndexedOrNote",
    });
    expect(Number(rate)).toBeCloseTo(6, 6);
  });

  it("throws on unknown policy kind in calculateQualifyingPayment", () => {
    const badPolicy = {
      kind: "SomeFuturePolicy",
    } as unknown as QualifyingPaymentPolicy;
    const rateNote: RateNote = {
      noteRatePct: ratePct(6),
      amortizationMonths: 360,
    };
    expect(() => calculateQualifyingPayment(money(100000), rateNote, badPolicy)).toThrow(
      /unknown qualifying payment policy/i,
    );
  });

  it("throws on non-ARM policy kind passed to calculateARMQualifyingRate", () => {
    expect(() =>
      calculateARMQualifyingRate(ratePct(6), ratePct(7), {
        kind: "NotePayment",
      }),
    ).toThrow(/not an ARM/);
    expect(() =>
      calculateARMQualifyingRate(ratePct(6), ratePct(7), {
        kind: "IOUsesFullyAmortizing",
        amortMonths: months(360),
      }),
    ).toThrow(/not an ARM/);
  });

  it("ARMQualifyMaxNotePlus payment uses the higher of note+add vs fullyIndexed", () => {
    const policy: QualifyingPaymentPolicy = {
      kind: "ARMQualifyMaxNotePlus",
      addPctPoints: ratePct(2),
    };
    const rateNote: RateNote = {
      noteRatePct: ratePct(5),
      amortizationMonths: 360,
      arm: { fullyIndexedRatePct: ratePct(9) },
    };
    const payment = calculateQualifyingPayment(money(100000), rateNote, policy);
    // fullyIndexed 9 > note+2=7, so uses 9%
    const expectedPayment = calculatePMTFixed(money(100000), ratePct(9), months(360));
    expect(Number(payment)).toBeCloseTo(Number(expectedPayment), 2);
  });

  it("ARMQualifyFullyIndexedOrNote uses note when note is higher", () => {
    const rate = calculateARMQualifyingRate(ratePct(8), ratePct(6), {
      kind: "ARMQualifyFullyIndexedOrNote",
    });
    expect(Number(rate)).toBeCloseTo(8, 6);
  });

  it("NotePayment with fixed product uses fully amortizing PMT", () => {
    const policy: QualifyingPaymentPolicy = { kind: "NotePayment" };
    const rateNote: RateNote = {
      noteRatePct: ratePct(7),
      productKind: ProgramKind.Fixed,
      amortizationMonths: 360,
    };
    const payment = calculateQualifyingPayment(money(250000), rateNote, policy);
    const expected = calculatePMTFixed(money(250000), ratePct(7), months(360));
    expect(Number(payment)).toBeCloseTo(Number(expected), 2);
  });
});

// ---------------------------------------------------------------------------
// DTI math
// ---------------------------------------------------------------------------
describe("DTI math", () => {
  it("calculates DTI and derived targets", () => {
    expect(Number(calculateDTI(money(5000), money(10000)))).toBeCloseTo(0.5, 6);
    expect(Number(maxPaymentForDTI(ratio(0.4), money(10000), money(1000)))).toBeCloseTo(3000, 2);
    expect(Number(debtReductionForTargetDTI(money(4500), money(10000), ratio(0.35)))).toBeCloseTo(
      1000,
      2,
    );
    expect(Number(incomeRequiredForDTI(money(3000), ratio(0.3)))).toBeCloseTo(10000, 2);
  });

  it("returns null when income is 0 and obligations are positive", () => {
    const result = calculateDTI(money(5000), money(0));
    expect(result).toBeNull();
  });

  it("returns ratio(0) when both income and obligations are 0", () => {
    const result = calculateDTI(money(0), money(0));
    expect(result).not.toBeNull();
    expect(Number(result)).toBe(0);
  });

  it("returns ratio(0) when obligations are 0 and income is positive", () => {
    const result = calculateDTI(money(0), money(10000));
    expect(result).not.toBeNull();
    expect(Number(result)).toBe(0);
  });

  it("throws on negative obligations", () => {
    expect(() => calculateDTI(money(-1), money(10000))).toThrow(RangeError);
  });

  it("throws on negative income", () => {
    expect(() => calculateDTI(money(5000), money(-1))).toThrow(RangeError);
  });

  it("throws on non-finite DTI inputs", () => {
    expect(() => calculateDTI(money(NaN), money(10000))).toThrow(RangeError);
    expect(() => calculateDTI(money(5000), money(Infinity))).toThrow(RangeError);
  });

  it("throws on targetDTI of 0 in incomeRequiredForDTI", () => {
    expect(() => incomeRequiredForDTI(money(5000), ratio(0))).toThrow(RangeError);
  });

  it("incomeRequiredForDTI works for valid targetDTI", () => {
    expect(Number(incomeRequiredForDTI(money(4500), ratio(0.45)))).toBeCloseTo(10000, 2);
  });

  it("maxPaymentForDTI returns 0 when debts exceed DTI capacity", () => {
    const result = maxPaymentForDTI(ratio(0.3), money(10000), money(5000));
    // maxTotal = 3000, debts = 5000, available = -2000 => clamped to 0
    expect(Number(result)).toBe(0);
  });

  it("debtReductionForTargetDTI returns 0 when already within target", () => {
    const result = debtReductionForTargetDTI(money(2000), money(10000), ratio(0.3));
    // maxTotal = 3000, obligations = 2000, reduction = -1000 => clamped to 0
    expect(Number(result)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Income aggregation
// ---------------------------------------------------------------------------
describe("income aggregation", () => {
  const makeIncome = (
    id: string,
    borrowerId: string,
    monthlyAmount: number,
    qualifying = true,
  ): IncomeStream => ({
    id,
    borrowerId,
    type: "W2" as IncomeStream["type"],
    monthlyAmount: money(monthlyAmount),
    qualifying,
  });

  it("sumQualifyingIncome returns hasIncomeStreams=false for empty array", () => {
    const result = sumQualifyingIncome([]);
    expect(Number(result.totalMonthlyIncome)).toBe(0);
    expect(result.hasIncomeStreams).toBe(false);
  });

  it("sumQualifyingIncome returns hasIncomeStreams=true when qualifying streams exist", () => {
    const result = sumQualifyingIncome([makeIncome("i1", "b1", 5000)]);
    expect(Number(result.totalMonthlyIncome)).toBeCloseTo(5000, 2);
    expect(result.hasIncomeStreams).toBe(true);
  });

  it("sumQualifyingIncome excludes non-qualifying streams", () => {
    const result = sumQualifyingIncome([
      makeIncome("i1", "b1", 5000, true),
      makeIncome("i2", "b1", 3000, false),
    ]);
    expect(Number(result.totalMonthlyIncome)).toBeCloseTo(5000, 2);
    expect(result.hasIncomeStreams).toBe(true);
  });

  it("sumQualifyingIncome with all non-qualifying returns hasIncomeStreams=false", () => {
    const result = sumQualifyingIncome([
      makeIncome("i1", "b1", 5000, false),
      makeIncome("i2", "b1", 3000, false),
    ]);
    expect(Number(result.totalMonthlyIncome)).toBe(0);
    expect(result.hasIncomeStreams).toBe(false);
  });

  it("deriveQualifyingIncome with empty borrowers returns no-data signal", () => {
    const result = deriveQualifyingIncome([], ["b1"]);
    expect(Number(result.totalMonthlyIncome)).toBe(0);
    expect(result.hasIncomeStreams).toBe(false);
  });

  it("deriveQualifyingIncome filters to included borrowers", () => {
    const borrowers: Borrower[] = [
      { id: "b1", fico: 750, incomes: [makeIncome("i1", "b1", 8000)] },
      { id: "b2", fico: 720, incomes: [makeIncome("i2", "b2", 4000)] },
    ];
    const result = deriveQualifyingIncome(borrowers, ["b1"]);
    expect(Number(result.totalMonthlyIncome)).toBeCloseTo(8000, 2);
    expect(result.hasIncomeStreams).toBe(true);
  });

  it("deriveQualifyingIncome with no matching borrowers returns no-data signal", () => {
    const borrowers: Borrower[] = [
      { id: "b1", fico: 750, incomes: [makeIncome("i1", "b1", 8000)] },
    ];
    const result = deriveQualifyingIncome(borrowers, ["b99"]);
    expect(Number(result.totalMonthlyIncome)).toBe(0);
    expect(result.hasIncomeStreams).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Asset allocation
// ---------------------------------------------------------------------------
describe("asset allocation", () => {
  it("allocates assets in liquidity order with haircuts", () => {
    const result = allocateAssets({
      assets: [
        {
          id: "checking",
          type: AssetType.Checking,
          ownerBorrowerIds: ["b1"],
          amount: money(120000),
          liquidityRank: 1,
        },
        {
          id: "brokerage",
          type: AssetType.Brokerage,
          ownerBorrowerIds: ["b1"],
          amount: money(100000),
          liquidityRank: 2,
          haircutRatio: ratio(0.5),
        },
      ],
      requiredClose: money(100000),
      requiredPayoffs: money(50000),
    });

    expect(result.shortfall).toBeUndefined();
    expect(Number(result.remainingReservesDollars)).toBeCloseTo(20000, 2);
    expect(result.used.length).toBeGreaterThan(0);
  });

  it("deterministic ordering: assets with equal liquidityRank are sorted by id", () => {
    const assetsForward: Asset[] = [
      {
        id: "beta",
        type: AssetType.Checking,
        ownerBorrowerIds: ["b1"],
        amount: money(10000),
        liquidityRank: 1,
      },
      {
        id: "alpha",
        type: AssetType.Savings,
        ownerBorrowerIds: ["b1"],
        amount: money(10000),
        liquidityRank: 1,
      },
      {
        id: "gamma",
        type: AssetType.Checking,
        ownerBorrowerIds: ["b1"],
        amount: money(10000),
        liquidityRank: 1,
      },
    ];
    const assetsReversed: Asset[] = [...assetsForward].reverse();

    const result1 = allocateAssets({
      assets: assetsForward,
      requiredClose: money(15000),
      requiredPayoffs: money(0),
    });
    const result2 = allocateAssets({
      assets: assetsReversed,
      requiredClose: money(15000),
      requiredPayoffs: money(0),
    });

    // Both should produce the same allocation regardless of input order
    expect(result1.used.map((u) => u.assetId)).toEqual(result2.used.map((u) => u.assetId));
    // alpha (first by id) should be used first
    expect(result1.used[0]?.assetId).toBe("alpha");
  });

  it("clamps haircutRatio > 1 to 1 (cannot inflate asset value)", () => {
    const result = allocateAssets({
      assets: [
        {
          id: "a1",
          type: AssetType.Checking,
          ownerBorrowerIds: ["b1"],
          amount: money(100000),
          liquidityRank: 1,
          haircutRatio: ratio(1.5),
        },
      ],
      requiredClose: money(100000),
      requiredPayoffs: money(0),
    });

    // haircutRatio clamped to 1, so 100000 * 1 = 100000 usable
    expect(result.shortfall).toBeUndefined();
    const totalUsed = result.used.reduce((sum, u) => sum + Number(u.used), 0);
    expect(totalUsed).toBeCloseTo(100000, 2);
  });

  it("clamps haircutRatio < 0 to 0 (cannot use asset)", () => {
    const result = allocateAssets({
      assets: [
        {
          id: "a1",
          type: AssetType.Checking,
          ownerBorrowerIds: ["b1"],
          amount: money(100000),
          liquidityRank: 1,
          haircutRatio: ratio(-0.5),
        },
      ],
      requiredClose: money(50000),
      requiredPayoffs: money(0),
    });

    // haircutRatio clamped to 0, nothing usable
    expect(result.shortfall).toBeDefined();
    expect(Number(result.shortfall)).toBeCloseTo(50000, 2);
    expect(result.used.length).toBe(0);
  });

  it("applyHaircut clamps invalid ratios", () => {
    expect(Number(applyHaircut(money(100), ratio(1.5)))).toBeCloseTo(100, 2);
    expect(Number(applyHaircut(money(100), ratio(-0.5)))).toBe(0);
    expect(Number(applyHaircut(money(100), ratio(0.7)))).toBeCloseTo(70, 2);
  });

  it("reports shortfall when assets are insufficient", () => {
    const result = allocateAssets({
      assets: [
        {
          id: "a1",
          type: AssetType.Checking,
          ownerBorrowerIds: ["b1"],
          amount: money(30000),
          liquidityRank: 1,
        },
      ],
      requiredClose: money(50000),
      requiredPayoffs: money(0),
    });
    expect(result.shortfall).toBeDefined();
    expect(Number(result.shortfall)).toBeCloseTo(20000, 2);
  });

  it("filterReservesEligible excludes ineligible types and assets marked canUseForReserves=false", () => {
    const assets: Asset[] = [
      {
        id: "a1",
        type: AssetType.Checking,
        ownerBorrowerIds: ["b1"],
        amount: money(50000),
      },
      {
        id: "a2",
        type: AssetType.Gift,
        ownerBorrowerIds: ["b1"],
        amount: money(20000),
      },
      {
        id: "a3",
        type: AssetType.Savings,
        ownerBorrowerIds: ["b1"],
        amount: money(10000),
        canUseForReserves: false,
      },
    ];
    const eligible = filterReservesEligible(assets, [AssetType.Gift]);
    expect(eligible.map((a) => a.id)).toEqual(["a1"]);
  });

  it("handles empty assets array without error", () => {
    const result = allocateAssets({
      assets: [],
      requiredClose: money(0),
      requiredPayoffs: money(0),
    });
    expect(result.shortfall).toBeUndefined();
    expect(Number(result.remainingReservesDollars)).toBe(0);
    expect(result.used.length).toBe(0);
  });

  it("handles empty assets with positive requirements producing shortfall", () => {
    const result = allocateAssets({
      assets: [],
      requiredClose: money(10000),
      requiredPayoffs: money(5000),
    });
    expect(result.shortfall).toBeDefined();
    expect(Number(result.shortfall)).toBeCloseTo(15000, 2);
  });
});

// ---------------------------------------------------------------------------
// Reserves
// ---------------------------------------------------------------------------
describe("reserves", () => {
  it("calculates required reserves from PITI and months", () => {
    const result = calculateRequiredReserves(money(3500), months(6));
    expect(Number(result)).toBeCloseTo(21000, 2);
  });

  it("throws on non-finite reserve inputs", () => {
    expect(() => calculateRequiredReserves(money(NaN), months(6))).toThrow(RangeError);
    expect(() => calculateRequiredReserves(money(3500), months(Infinity))).toThrow(RangeError);
  });

  it("throws on negative reserve months", () => {
    expect(() => calculateRequiredReserves(money(3500), months(-1))).toThrow(RangeError);
  });

  it("zero months produces zero reserves", () => {
    expect(Number(calculateRequiredReserves(money(3500), months(0)))).toBe(0);
  });

  it("resolves None policy to 0 months", () => {
    const result = resolveReserveMonths(
      { kind: "None" },
      money(500000),
      Occupancy.Primary,
      LoanPurpose.Purchase,
    );
    expect(Number(result)).toBe(0);
  });

  it("resolves FixedMonths policy", () => {
    const result = resolveReserveMonths(
      { kind: "FixedMonths", months: months(6) },
      money(500000),
      Occupancy.Primary,
      LoanPurpose.Purchase,
    );
    expect(Number(result)).toBe(6);
  });

  it('resolves AUSDetermined policy to "AUS"', () => {
    const result = resolveReserveMonths(
      { kind: "AUSDetermined" },
      money(500000),
      Occupancy.Primary,
      LoanPurpose.Purchase,
    );
    expect(result).toBe("AUS");
  });

  it("throws on unknown reserves policy kind", () => {
    const badPolicy = { kind: "FuturePolicy" } as unknown as ReservesPolicy;
    expect(() =>
      resolveReserveMonths(badPolicy, money(500000), Occupancy.Primary, LoanPurpose.Purchase),
    ).toThrow(/unknown reserves policy/i);
  });

  it("tiered policy normalizes ordering and matches correct tier", () => {
    // Tiers given out of order
    const policy: ReservesPolicy = {
      kind: "Tiered",
      tiers: [
        {
          loanAmount: { min: money(500001), max: money(1000000) },
          months: months(12),
        },
        {
          loanAmount: { min: money(0), max: money(500000) },
          months: months(6),
        },
      ],
    };
    const result1 = resolveReserveMonths(
      policy,
      money(300000),
      Occupancy.Primary,
      LoanPurpose.Purchase,
    );
    expect(Number(result1)).toBe(6);

    const result2 = resolveReserveMonths(
      policy,
      money(750000),
      Occupancy.Primary,
      LoanPurpose.Purchase,
    );
    expect(Number(result2)).toBe(12);
  });

  it("tiered policy with empty tiers returns 0 months", () => {
    const policy: ReservesPolicy = { kind: "Tiered", tiers: [] };
    const result = resolveReserveMonths(
      policy,
      money(500000),
      Occupancy.Primary,
      LoanPurpose.Purchase,
    );
    expect(Number(result)).toBe(0);
  });

  it("tiered policy returns 0 when no tier matches", () => {
    const policy: ReservesPolicy = {
      kind: "Tiered",
      tiers: [
        {
          loanAmount: { min: money(0), max: money(200000) },
          months: months(6),
          occupancies: [Occupancy.Investment],
        },
      ],
    };
    // Primary does not match the Investment-only tier
    const result = resolveReserveMonths(
      policy,
      money(100000),
      Occupancy.Primary,
      LoanPurpose.Purchase,
    );
    expect(Number(result)).toBe(0);
  });

  it("tiered policy filters by purpose", () => {
    const policy: ReservesPolicy = {
      kind: "Tiered",
      tiers: [
        {
          loanAmount: { min: money(0), max: money(1000000) },
          months: months(12),
          purposes: [LoanPurpose.CashOutRefi],
        },
        {
          loanAmount: { min: money(0), max: money(1000000) },
          months: months(6),
          purposes: [LoanPurpose.Purchase],
        },
      ],
    };
    const result = resolveReserveMonths(
      policy,
      money(500000),
      Occupancy.Primary,
      LoanPurpose.Purchase,
    );
    expect(Number(result)).toBe(6);
  });
});

// ---------------------------------------------------------------------------
// Estimate helpers
// ---------------------------------------------------------------------------
describe("estimate helpers", () => {
  it("estimates taxes, insurance, HOA, MI, and closing costs", () => {
    const propertyValue = money(1200000);
    expect(Number(estimatePropertyTax(propertyValue))).toBeCloseTo(1250, 2);
    expect(Number(estimateInsurance(propertyValue))).toBeCloseTo(350, 2);
    expect(Number(estimateHoa(PropertyType.Condo))).toBeCloseTo(300, 2);
    const mi = estimateMI(ratio(0.92), 680, money(500000));
    expect(Number(mi)).toBeCloseTo(583.33, 1);
    expect(Number(estimateClosingCosts(money(200000)))).toBeCloseTo(6000, 2);
  });
});
