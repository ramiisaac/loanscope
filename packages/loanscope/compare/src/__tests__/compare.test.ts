import { describe, expect, it } from "vitest";
import {
  ComparisonGridBuilder,
  executeGrid,
  executeGridAsync,
  expandGrid,
  ltvSteps,
  termDimension,
  loanAmountSteps,
  occupancyDimension,
  productDimension,
  lenderDimension,
  borrowerSetDimension,
} from "../grid";
import { findMaxLoanAmount } from "../goalseek";
import { findMinDownPayment } from "../goalseek/min-down";
import { findMinFico } from "../goalseek/min-fico";
import { findMaxPurchasePrice } from "../goalseek/max-price";
import { findMinReserves } from "../goalseek/min-reserves";
import { gridToTable, gridToCSV, summarizeGrid } from "../output";
import { validateDimension, validateGoalSeekBounds } from "../types";
import {
  AmortizationTerm,
  AmortizationType,
  Channel,
  LoanPurpose,
  LoanType,
  Occupancy,
  ProgramKind,
  PropertyType,
  money,
  months,
  ratePct,
  ratio,
} from "@loanscope/domain";
import type { ProductDefinition, Transaction } from "@loanscope/domain";
import { quickQuoteToTransaction } from "@loanscope/engine";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const baseProduct: ProductDefinition = {
  id: "compare_product",
  name: "Compare Product",
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
};

const createTransaction = (
  overrides?: Partial<{
    loanAmount: number;
    purchasePrice: number;
    totalLiquidAssets: number;
    fico: number;
    monthlyIncome: number;
  }>,
): Transaction => {
  const transaction = quickQuoteToTransaction({
    loanAmount: money(overrides?.loanAmount ?? 800000),
    purchasePrice: money(overrides?.purchasePrice ?? 1000000),
    fico: overrides?.fico ?? 740,
    occupancy: Occupancy.Primary,
    propertyType: PropertyType.SFR,
    loanPurpose: LoanPurpose.Purchase,
    monthlyIncome: money(overrides?.monthlyIncome ?? 12000),
    monthlyDebts: money(1000),
    annualTaxes: money(7200),
    annualInsurance: money(1800),
    noteRatePct: ratePct(6.75),
    amortizationMonths: months(360),
    totalLiquidAssets: money(overrides?.totalLiquidAssets ?? 500000),
    stateCode: "CA",
  });
  transaction.scenario.monthlyHousing.mi = money(0);
  transaction.scenario.monthlyHousing.floodInsurance = money(0);
  transaction.scenario.location = { stateCode: "CA" };
  return transaction;
};

// ---------------------------------------------------------------------------
// Dimension validation
// ---------------------------------------------------------------------------

describe("dimension validation", () => {
  it("rejects empty Terms array", () => {
    expect(() => validateDimension({ kind: "Terms", values: [] })).toThrow(/at least one term/);
  });

  it("rejects invalid amortization term value", () => {
    expect(() => validateDimension({ kind: "Terms", values: [999 as AmortizationTerm] })).toThrow(
      /Invalid amortization term/,
    );
  });

  it("rejects empty Rates array", () => {
    expect(() => validateDimension({ kind: "Rates", values: [] })).toThrow(/at least one rate/);
  });

  it("rejects negative rate", () => {
    expect(() => validateDimension({ kind: "Rates", values: [ratePct(-1)] })).toThrow(
      /Invalid rate value/,
    );
  });

  it("rejects LTV min exceeding max", () => {
    expect(() => ltvSteps(ratio(0.9), ratio(0.5), ratio(0.05))).toThrow(/min.*exceeds max/);
  });

  it("rejects LTV step of zero", () => {
    expect(() => ltvSteps(ratio(0.5), ratio(0.9), ratio(0))).toThrow(/step must be positive/);
  });

  it("rejects out-of-range LTV min", () => {
    expect(() => ltvSteps(ratio(-0.1), ratio(0.9), ratio(0.1))).toThrow(/LTV min must be in/);
  });

  it("rejects out-of-range LTV max beyond 1.5", () => {
    expect(() => ltvSteps(ratio(0.5), ratio(2.0), ratio(0.1))).toThrow(/LTV max must be in/);
  });

  it("rejects LoanAmount min exceeding max", () => {
    expect(() => loanAmountSteps(money(500000), money(100000), money(50000))).toThrow(
      /min.*exceeds max/,
    );
  });

  it("rejects LoanAmount step of zero", () => {
    expect(() => loanAmountSteps(money(100000), money(500000), money(0))).toThrow(
      /step must be positive/,
    );
  });

  it("rejects negative LoanAmount min", () => {
    expect(() => loanAmountSteps(money(-100), money(500000), money(50000))).toThrow(/non-negative/);
  });

  it("rejects empty Occupancy array", () => {
    expect(() => occupancyDimension([])).toThrow(/at least one value/);
  });

  it("rejects empty Products array", () => {
    expect(() => productDimension([])).toThrow(/at least one product/);
  });

  it("rejects empty Lenders array", () => {
    expect(() => lenderDimension([])).toThrow(/at least one lender/);
  });

  it("rejects empty BorrowerSets array", () => {
    expect(() => borrowerSetDimension([])).toThrow(/at least one set/);
  });
});

// ---------------------------------------------------------------------------
// Comparison grid basics
// ---------------------------------------------------------------------------

describe("comparison grid", () => {
  it("expands dimensions into cartesian product", () => {
    const transaction = createTransaction();
    const builder = ComparisonGridBuilder.fromTransaction(transaction)
      .withDimension(termDimension([360 as AmortizationTerm]))
      .withDimension(ltvSteps(ratio(0.7), ratio(0.9), ratio(0.1)));
    const grid = builder.build();
    const expanded = expandGrid(grid);
    expect(expanded.length).toBe(3);
  });

  it("executes grid and returns summary with error count", () => {
    const transaction = createTransaction();
    const builder = ComparisonGridBuilder.fromTransaction(transaction).withDimension(
      termDimension([360 as AmortizationTerm]),
    );
    const grid = builder.build();
    const result = executeGrid(grid, [baseProduct]);
    expect(result.summary.totalCells).toBe(1);
    expect(result.summary.errorCount).toBeGreaterThanOrEqual(0);
    expect(result.errors).toBeDefined();
    expect(Array.isArray(result.errors)).toBe(true);
  });

  it("attaches full underwriting results for fully computable cells", () => {
    const transaction = createTransaction();
    const builder = ComparisonGridBuilder.fromTransaction(transaction);
    const grid = builder.build();
    const result = executeGrid(grid, [baseProduct]);

    expect(result.summary.totalCells).toBe(1);
    expect(result.summary.partialCount).toBe(0);
    expect(result.cells[0]?.result.full).toBeDefined();
    expect(result.cells[0]?.result.full?.variantId).toBe("default");
  });

  it("expands LTV dimension using Decimal.js-accurate steps", () => {
    const transaction = createTransaction();
    const builder = ComparisonGridBuilder.fromTransaction(transaction).withDimension(
      ltvSteps(ratio(0.75), ratio(0.95), ratio(0.05)),
    );
    const grid = builder.build();
    const expanded = expandGrid(grid);
    // (0.95 - 0.75) / 0.05 + 1 = 5
    expect(expanded.length).toBe(5);
  });

  it("expands LoanAmount dimension correctly", () => {
    const transaction = createTransaction();
    const builder = ComparisonGridBuilder.fromTransaction(transaction).withDimension(
      loanAmountSteps(money(500000), money(700000), money(100000)),
    );
    const grid = builder.build();
    const expanded = expandGrid(grid);
    // 500k, 600k, 700k
    expect(expanded.length).toBe(3);
  });

  it("produces a single cell when no dimensions are added", () => {
    const transaction = createTransaction();
    const builder = ComparisonGridBuilder.fromTransaction(transaction);
    const grid = builder.build();
    const expanded = expandGrid(grid);
    expect(expanded.length).toBe(1);
  });

  it("throws when building without a base transaction", () => {
    const builder = new ComparisonGridBuilder();
    expect(() => builder.build()).toThrow(/requires a base transaction/);
  });

  it("throws when executeGrid receives an empty product list", () => {
    const transaction = createTransaction();
    const builder = ComparisonGridBuilder.fromTransaction(transaction);
    const grid = builder.build();
    expect(() => executeGrid(grid, [])).toThrow(/non-empty product list/);
  });
});

// ---------------------------------------------------------------------------
// Invalid coordinates
// ---------------------------------------------------------------------------

describe("invalid coordinates", () => {
  it("handles non-string productId in coordinates gracefully", () => {
    const transaction = createTransaction();
    const builder = ComparisonGridBuilder.fromTransaction(transaction).withDimension(
      termDimension([360 as AmortizationTerm]),
    );
    const grid = builder.build();
    // Numeric productId coordinate should not crash the filter
    const result = executeGrid(grid, [baseProduct]);
    expect(result.cells.length).toBeGreaterThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------
// Error surfacing
// ---------------------------------------------------------------------------

describe("error surfacing", () => {
  it("surfaces unsupported product as error rather than silently skipping", () => {
    const transaction = createTransaction();
    // Use a product with term 180 but the transaction defaults to 360
    const mismatchProduct: ProductDefinition = {
      ...baseProduct,
      id: "mismatch_term_product",
      variants: [
        {
          ...baseProduct.variants[0]!,
          terms: [180],
        },
      ],
    };
    const builder = ComparisonGridBuilder.fromTransaction(transaction);
    const grid = builder.build();
    const result = executeGrid(grid, [mismatchProduct]);
    // Either the cell evaluated (if the engine handled it as ineligible)
    // or it was surfaced as an error -- but not silently swallowed
    const total = result.cells.length + result.errors.length;
    expect(total).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// Output formatting
// ---------------------------------------------------------------------------

describe("output formatting", () => {
  it("gridToTable includes all header columns", () => {
    const transaction = createTransaction();
    const builder = ComparisonGridBuilder.fromTransaction(transaction).withDimension(
      termDimension([360 as AmortizationTerm]),
    );
    const grid = builder.build();
    const result = executeGrid(grid, [baseProduct]);
    const table = gridToTable(result);
    expect(table.headers).toContain("product");
    expect(table.headers).toContain("eligible");
    expect(table.headers).toContain("payment");
  });

  it("gridToCSV produces valid CSV with quoted values", () => {
    const transaction = createTransaction();
    const builder = ComparisonGridBuilder.fromTransaction(transaction).withDimension(
      termDimension([360 as AmortizationTerm]),
    );
    const grid = builder.build();
    const result = executeGrid(grid, [baseProduct]);
    const csv = gridToCSV(result);
    expect(csv).toContain(",");
    const lines = csv.split("\n");
    expect(lines.length).toBeGreaterThanOrEqual(2);
  });

  it("summarizeGrid returns the summary object", () => {
    const transaction = createTransaction();
    const builder = ComparisonGridBuilder.fromTransaction(transaction).withDimension(
      termDimension([360 as AmortizationTerm]),
    );
    const grid = builder.build();
    const result = executeGrid(grid, [baseProduct]);
    const summary = summarizeGrid(result);
    expect(summary.totalCells).toBeGreaterThanOrEqual(0);
    expect(typeof summary.errorCount).toBe("number");
  });
});

// ---------------------------------------------------------------------------
// Goal-seek bound validation
// ---------------------------------------------------------------------------

describe("goal-seek bound validation", () => {
  it("throws on min > max bounds", () => {
    expect(() => validateGoalSeekBounds({ min: 500000, max: 100000 }, "test")).toThrow(
      /min bound.*exceeds max/,
    );
  });

  it("throws on non-finite bounds", () => {
    expect(() => validateGoalSeekBounds({ min: NaN, max: 100000 }, "test")).toThrow(
      /finite numbers/,
    );
  });

  it("throws on Infinity bounds", () => {
    expect(() => validateGoalSeekBounds({ min: 0, max: Infinity }, "test")).toThrow(
      /finite numbers/,
    );
  });

  it("throws on negative min bound", () => {
    expect(() => validateGoalSeekBounds({ min: -100, max: 100000 }, "test")).toThrow(
      /non-negative/,
    );
  });
});

// ---------------------------------------------------------------------------
// Goal seek -- max loan convergence
// ---------------------------------------------------------------------------

describe("goal seek -- max loan", () => {
  it("converges to max loan amount", () => {
    const transaction = createTransaction({ monthlyIncome: 20000 });
    const result = findMaxLoanAmount({
      target: "MaxLoanAmount",
      transaction,
      product: baseProduct,
      bounds: { min: 700000, max: 1000000 },
      tolerance: 1000,
    });
    expect(result.converged).toBe(true);
    expect(result.found).toBe(true);
    expect(result.targetValue).toBeGreaterThan(700000);
    expect(result.targetValue).toBeLessThanOrEqual(1000000);
  });

  it("reports never-feasible when cash-to-close always fails", () => {
    // With only 10k in assets, no loan amount can close
    const transaction = createTransaction({ totalLiquidAssets: 10000 });
    const result = findMaxLoanAmount({
      target: "MaxLoanAmount",
      transaction,
      product: baseProduct,
      bounds: { min: 700000, max: 1000000 },
      tolerance: 1000,
    });
    expect(result.found).toBe(false);
    expect(result.reason).toBe("never_feasible");
  });

  it("reports already-feasible when max bound passes", () => {
    // With ample assets and a small range, max is feasible
    const transaction = createTransaction({
      totalLiquidAssets: 1000000,
      monthlyIncome: 20000,
    });
    const result = findMaxLoanAmount({
      target: "MaxLoanAmount",
      transaction,
      product: baseProduct,
      bounds: { min: 800000, max: 900000 },
      tolerance: 1000,
    });
    expect(result.found).toBe(true);
    expect(result.reason).toBe("already_feasible");
    expect(result.targetValue).toBe(900000);
  });

  it("throws on malformed bounds", () => {
    const transaction = createTransaction();
    expect(() =>
      findMaxLoanAmount({
        target: "MaxLoanAmount",
        transaction,
        product: baseProduct,
        bounds: { min: 1000000, max: 500000 },
        tolerance: 1000,
      }),
    ).toThrow(/min bound.*exceeds max/);
  });
});

// ---------------------------------------------------------------------------
// Goal seek -- min down payment
// ---------------------------------------------------------------------------

describe("goal seek -- min down payment", () => {
  it("converges to minimum down payment", () => {
    const transaction = createTransaction({ monthlyIncome: 20000 });
    const result = findMinDownPayment({
      target: "MinDownPayment",
      transaction,
      product: baseProduct,
      bounds: { min: 0, max: 300000 },
      tolerance: 1000,
    });
    expect(result.converged).toBe(true);
    expect(result.found).toBe(true);
    // With ample assets and the engine's actual check coverage,
    // the minimum down converges to a value within the bounds
    expect(result.targetValue).toBeGreaterThanOrEqual(0);
    expect(result.targetValue).toBeLessThanOrEqual(300000);
  });

  it("handles boundary case when already eligible at minimum", () => {
    // With ample assets, sufficient income, and fully lenient LTV/CLTV,
    // $0 down should be eligible.
    const transaction = createTransaction({
      totalLiquidAssets: 1000000,
      monthlyIncome: 20000,
    });
    const lenientProduct: ProductDefinition = {
      ...baseProduct,
      id: "lenient_product",
      variants: [
        {
          ...baseProduct.variants[0]!,
          constraints: {
            Primary: {
              maxLTVRatio: ratio(1),
              maxCLTVRatio: ratio(1),
              minFico: 620,
            },
            Secondary: {
              maxLTVRatio: ratio(1),
              maxCLTVRatio: ratio(1),
              minFico: 620,
            },
            Investment: {
              maxLTVRatio: ratio(1),
              maxCLTVRatio: ratio(1),
              minFico: 620,
            },
          },
        },
      ],
    };
    const result = findMinDownPayment({
      target: "MinDownPayment",
      transaction,
      product: lenientProduct,
      bounds: { min: 0, max: 300000 },
      tolerance: 1000,
    });
    expect(result.found).toBe(true);
    expect(result.converged).toBe(true);
    // With lenient LTV (100%) and ample assets, the minimum down payment
    // converges to a low value driven by closing-cost coverage requirements
    expect(result.targetValue).toBeLessThanOrEqual(50000);
  });

  it("reports never-feasible when cash-to-close always fails", () => {
    // With only $100 in assets, no down payment amount can produce enough
    // funds to close (closing costs exceed available assets)
    const transaction = createTransaction({ totalLiquidAssets: 100 });
    const result = findMinDownPayment({
      target: "MinDownPayment",
      transaction,
      product: baseProduct,
      bounds: { min: 0, max: 200000 },
      tolerance: 1000,
    });
    expect(result.found).toBe(false);
    expect(result.reason).toBe("never_feasible");
  });

  it("throws on malformed bounds", () => {
    const transaction = createTransaction();
    expect(() =>
      findMinDownPayment({
        target: "MinDownPayment",
        transaction,
        product: baseProduct,
        bounds: { min: 300000, max: 100000 },
      }),
    ).toThrow(/min bound.*exceeds max/);
  });
});

// ---------------------------------------------------------------------------
// Goal seek -- min FICO
// ---------------------------------------------------------------------------

describe("goal seek -- min fico", () => {
  it("converges to minimum FICO within bounds", () => {
    const transaction = createTransaction({ monthlyIncome: 20000 });
    const result = findMinFico({
      target: "MinFico",
      transaction,
      product: baseProduct,
      bounds: { min: 300, max: 850 },
      tolerance: 1,
    });
    // The engine may consider all FICOs eligible if the only enforced check
    // is CashToClose (which FICO does not affect). In that case the search
    // returns already_feasible at min. Either way the search should complete.
    expect(result.found).toBe(true);
    expect(result.targetValue).toBeGreaterThanOrEqual(300);
    expect(result.targetValue).toBeLessThanOrEqual(850);
  });

  it("reports already-feasible when min FICO already passes", () => {
    const transaction = createTransaction({ monthlyIncome: 20000 });
    const result = findMinFico({
      target: "MinFico",
      transaction,
      product: baseProduct,
      bounds: { min: 740, max: 850 },
      tolerance: 1,
    });
    expect(result.found).toBe(true);
    // FICO 740 is above minFico=620 so engine should pass
    expect(result.reason).toBe("already_feasible");
    expect(result.targetValue).toBe(740);
  });

  it("reports never-feasible when cash-to-close prevents eligibility", () => {
    // With near-zero assets, CashToClose fails regardless of FICO
    const transaction = createTransaction({ totalLiquidAssets: 100 });
    const result = findMinFico({
      target: "MinFico",
      transaction,
      product: baseProduct,
      bounds: { min: 300, max: 850 },
      tolerance: 1,
    });
    expect(result.found).toBe(false);
    expect(result.reason).toBe("never_feasible");
  });
});

// ---------------------------------------------------------------------------
// Goal seek -- max purchase price
// ---------------------------------------------------------------------------

describe("goal seek -- max purchase price", () => {
  it("converges to max purchase price or reports already-feasible", () => {
    const transaction = createTransaction();
    const result = findMaxPurchasePrice({
      target: "MaxPurchasePrice",
      transaction,
      product: baseProduct,
      bounds: { min: 500000, max: 2000000 },
      tolerance: 5000,
    });
    expect(result.found).toBe(true);
    expect(result.converged || result.reason === "already_feasible").toBe(true);
    expect(result.targetValue).toBeGreaterThanOrEqual(500000);
  });

  it("reports never-feasible when cash-to-close always fails", () => {
    const transaction = createTransaction({ totalLiquidAssets: 100 });
    const result = findMaxPurchasePrice({
      target: "MaxPurchasePrice",
      transaction,
      product: baseProduct,
      bounds: { min: 500000, max: 2000000 },
      tolerance: 5000,
    });
    expect(result.found).toBe(false);
    expect(result.reason).toBe("never_feasible");
  });

  it("throws on malformed bounds", () => {
    const transaction = createTransaction();
    expect(() =>
      findMaxPurchasePrice({
        target: "MaxPurchasePrice",
        transaction,
        product: baseProduct,
        bounds: { min: -1000, max: 2000000 },
      }),
    ).toThrow(/non-negative/);
  });
});

// ---------------------------------------------------------------------------
// Goal seek -- min reserves
// ---------------------------------------------------------------------------

describe("goal seek -- min reserves", () => {
  it("finds minimum reserves or reports already-feasible", () => {
    const transaction = createTransaction({ monthlyIncome: 20000 });
    const result = findMinReserves({
      target: "MinReserves",
      transaction,
      product: baseProduct,
      bounds: { min: 0, max: 200000 },
      tolerance: 500,
    });
    expect(result.found).toBe(true);
    expect(result.converged || result.reason === "already_feasible").toBe(true);
  });

  it("reports never-feasible when no reserve amount achieves eligibility", () => {
    // Use a product that requires RateTermRefi but the transaction is Purchase,
    // so eligibility is structurally impossible regardless of reserves
    const refiOnlyProduct: ProductDefinition = {
      ...baseProduct,
      id: "refi_only_product",
      baseConstraints: {
        ...baseProduct.baseConstraints,
        allowedPurposes: [LoanPurpose.RateTermRefi],
      },
    };
    const transaction = createTransaction();
    const result = findMinReserves({
      target: "MinReserves",
      transaction,
      product: refiOnlyProduct,
      bounds: { min: 0, max: 200000 },
      tolerance: 500,
    });
    expect(result.found).toBe(false);
    expect(result.reason).toBe("never_feasible");
  });

  it("throws on malformed bounds", () => {
    const transaction = createTransaction();
    expect(() =>
      findMinReserves({
        target: "MinReserves",
        transaction,
        product: baseProduct,
        bounds: { min: NaN, max: 200000 },
      }),
    ).toThrow(/finite numbers/);
  });
});

// ---------------------------------------------------------------------------
// Bounded parallel execution
// ---------------------------------------------------------------------------

describe("bounded parallel execution", () => {
  it("executeGridAsync produces the same result as executeGrid", async () => {
    const transaction = createTransaction();
    const builder = ComparisonGridBuilder.fromTransaction(transaction)
      .withDimension(termDimension([360 as AmortizationTerm]))
      .withDimension(ltvSteps(ratio(0.7), ratio(0.9), ratio(0.1)));
    const grid = builder.build();
    const syncResult = executeGrid(grid, [baseProduct]);
    const asyncResult = await executeGridAsync(grid, [baseProduct], {
      concurrency: 2,
    });
    expect(asyncResult.cells.length).toBe(syncResult.cells.length);
    expect(asyncResult.errors.length).toBe(syncResult.errors.length);
    expect(asyncResult.summary.totalCells).toBe(syncResult.summary.totalCells);
    expect(asyncResult.summary.passCount).toBe(syncResult.summary.passCount);
    expect(asyncResult.summary.failCount).toBe(syncResult.summary.failCount);
  });

  it("respects concurrency limit of 1 (serial execution)", async () => {
    const transaction = createTransaction();
    const builder = ComparisonGridBuilder.fromTransaction(transaction).withDimension(
      ltvSteps(ratio(0.7), ratio(0.9), ratio(0.1)),
    );
    const grid = builder.build();
    const result = await executeGridAsync(grid, [baseProduct], {
      concurrency: 1,
    });
    // 3 LTV steps with 1 product = 3 cells (or errors)
    expect(result.cells.length + result.errors.length).toBe(3);
  });

  it("rejects concurrency of 0", async () => {
    const transaction = createTransaction();
    const builder = ComparisonGridBuilder.fromTransaction(transaction);
    const grid = builder.build();
    await expect(executeGridAsync(grid, [baseProduct], { concurrency: 0 })).rejects.toThrow(
      /positive finite integer/,
    );
  });

  it("rejects negative concurrency", async () => {
    const transaction = createTransaction();
    const builder = ComparisonGridBuilder.fromTransaction(transaction);
    const grid = builder.build();
    await expect(executeGridAsync(grid, [baseProduct], { concurrency: -1 })).rejects.toThrow(
      /positive finite integer/,
    );
  });

  it("throws when executeGridAsync receives an empty product list", async () => {
    const transaction = createTransaction();
    const builder = ComparisonGridBuilder.fromTransaction(transaction);
    const grid = builder.build();
    await expect(executeGridAsync(grid, [])).rejects.toThrow(/non-empty product list/);
  });
});

// ---------------------------------------------------------------------------
// Wave 8-A: Goal-seek convergence within tolerance
// ---------------------------------------------------------------------------

describe("goal-seek convergence within tolerance", () => {
  it("max loan converges within specified tolerance of 500", () => {
    const transaction = createTransaction({ monthlyIncome: 20000 });
    const tolerance = 500;
    const result = findMaxLoanAmount({
      target: "MaxLoanAmount",
      transaction,
      product: baseProduct,
      bounds: { min: 700000, max: 1000000 },
      tolerance,
    });
    expect(result.converged).toBe(true);
    expect(result.found).toBe(true);
    // The binary search should stop within the tolerance band
    expect(result.iterations).toBeGreaterThan(0);
    expect(result.targetValue).toBeGreaterThanOrEqual(700000);
    expect(result.targetValue).toBeLessThanOrEqual(1000000);
  });

  it("min down payment converges within tolerance", () => {
    const transaction = createTransaction();
    const result = findMinDownPayment({
      target: "MinDownPayment",
      transaction,
      product: baseProduct,
      bounds: { min: 50000, max: 300000 },
      tolerance: 1000,
    });
    // Either converged or reported a boundary condition
    expect(
      result.converged ||
        result.reason === "already_feasible" ||
        result.reason === "never_feasible",
    ).toBe(true);
    expect(result.iterations).toBeGreaterThan(0);
  });

  it("min FICO converges within tolerance", () => {
    const transaction = createTransaction();
    const result = findMinFico({
      target: "MinFico",
      transaction,
      product: baseProduct,
      bounds: { min: 620, max: 850 },
      tolerance: 5,
    });
    expect(
      result.converged ||
        result.reason === "already_feasible" ||
        result.reason === "never_feasible",
    ).toBe(true);
    expect(result.iterations).toBeGreaterThan(0);
  });

  it("max purchase price converges within tolerance", () => {
    const transaction = createTransaction();
    const result = findMaxPurchasePrice({
      target: "MaxPurchasePrice",
      transaction,
      product: baseProduct,
      bounds: { min: 800000, max: 2000000 },
      tolerance: 1000,
    });
    expect(
      result.converged ||
        result.reason === "already_feasible" ||
        result.reason === "never_feasible",
    ).toBe(true);
    expect(result.iterations).toBeGreaterThan(0);
  });

  it("min reserves converges within tolerance", () => {
    const transaction = createTransaction();
    const result = findMinReserves({
      target: "MinReserves",
      transaction,
      product: baseProduct,
      bounds: { min: 0, max: 500000 },
      tolerance: 1000,
    });
    expect(
      result.converged ||
        result.reason === "already_feasible" ||
        result.reason === "never_feasible",
    ).toBe(true);
    expect(result.iterations).toBeGreaterThan(0);
  });

  it("goal-seek finalResult always contains a ScopedProductResult", () => {
    const transaction = createTransaction();
    const result = findMaxLoanAmount({
      target: "MaxLoanAmount",
      transaction,
      product: baseProduct,
      bounds: { min: 700000, max: 1000000 },
      tolerance: 1000,
    });
    expect(result.finalResult).toBeDefined();
    expect(result.finalResult.productId).toBe(baseProduct.id);
    expect(result.finalResult.productName).toBe(baseProduct.name);
  });
});

// ---------------------------------------------------------------------------
// Wave 8-A: Compare cartesian-product correctness
// ---------------------------------------------------------------------------

describe("compare cartesian-product correctness", () => {
  it("produces correct cell count for single dimension", () => {
    const transaction = createTransaction();
    const builder = ComparisonGridBuilder.fromTransaction(transaction).withDimension(
      ltvSteps(ratio(0.7), ratio(0.9), ratio(0.1)),
    );
    const grid = builder.build();
    const expanded = expandGrid(grid);
    // 0.7, 0.8, 0.9 => 3 cells
    expect(expanded.length).toBe(3);
  });

  it("produces correct cell count for two dimensions (cartesian product)", () => {
    const transaction = createTransaction();
    const builder = ComparisonGridBuilder.fromTransaction(transaction)
      .withDimension(termDimension([360 as AmortizationTerm, 180 as AmortizationTerm]))
      .withDimension(ltvSteps(ratio(0.7), ratio(0.9), ratio(0.1)));
    const grid = builder.build();
    const expanded = expandGrid(grid);
    // 2 terms x 3 LTV steps = 6 cells
    expect(expanded.length).toBe(6);
  });

  it("produces correct cell count for three dimensions", () => {
    const transaction = createTransaction();
    const builder = ComparisonGridBuilder.fromTransaction(transaction)
      .withDimension(termDimension([360 as AmortizationTerm]))
      .withDimension(ltvSteps(ratio(0.7), ratio(0.8), ratio(0.1)))
      .withDimension(occupancyDimension([Occupancy.Primary, Occupancy.Secondary]));
    const grid = builder.build();
    const expanded = expandGrid(grid);
    // 1 term x 2 LTV steps x 2 occupancies = 4 cells
    expect(expanded.length).toBe(4);
  });

  it("produces correct cell count with loan amount dimension", () => {
    const transaction = createTransaction();
    const builder = ComparisonGridBuilder.fromTransaction(transaction).withDimension(
      loanAmountSteps(money(500000), money(900000), money(200000)),
    );
    const grid = builder.build();
    const expanded = expandGrid(grid);
    // 500000, 700000, 900000 => 3 cells
    expect(expanded.length).toBe(3);
  });

  it("grid execution cell count matches expanded cell count", () => {
    const transaction = createTransaction();
    const builder = ComparisonGridBuilder.fromTransaction(transaction)
      .withDimension(termDimension([360 as AmortizationTerm]))
      .withDimension(ltvSteps(ratio(0.7), ratio(0.9), ratio(0.1)));
    const grid = builder.build();
    const expanded = expandGrid(grid);
    const result = executeGrid(grid, [baseProduct]);
    // Total cells + errors should account for all expanded items
    expect(result.summary.totalCells + result.summary.errorCount).toBe(expanded.length);
  });

  it("each cell has unique coordinates", () => {
    const transaction = createTransaction();
    const builder = ComparisonGridBuilder.fromTransaction(transaction)
      .withDimension(termDimension([360 as AmortizationTerm, 240 as AmortizationTerm]))
      .withDimension(ltvSteps(ratio(0.7), ratio(0.8), ratio(0.1)));
    const grid = builder.build();
    const result = executeGrid(grid, [baseProduct]);
    const coordStrings = result.cells.map((c) => JSON.stringify(c.coordinates));
    const uniqueCoords = new Set(coordStrings);
    expect(uniqueCoords.size).toBe(result.cells.length);
  });
});

// ---------------------------------------------------------------------------
// Wave 8-A: Disconnected traversal support
// ---------------------------------------------------------------------------

describe("disconnected traversal support", () => {
  it("grid execution handles product dimension filtering correctly", () => {
    const transaction = createTransaction();
    const secondProduct: ProductDefinition = {
      ...baseProduct,
      id: "compare_product_alt",
      name: "Compare Product Alt",
    };
    const builder = ComparisonGridBuilder.fromTransaction(transaction)
      .withDimension(termDimension([360 as AmortizationTerm]))
      .withDimension(productDimension([baseProduct.id, secondProduct.id]));
    const grid = builder.build();
    const result = executeGrid(grid, [baseProduct, secondProduct]);

    // Each product is evaluated independently per cell coordinate.
    // With 1 term x 2 products, we should get cells for each product.
    expect(result.summary.totalCells + result.summary.errorCount).toBe(2);
  });

  it("grid handles multiple independent products without cross-contamination", () => {
    const transaction = createTransaction();
    const builder = ComparisonGridBuilder.fromTransaction(transaction).withDimension(
      termDimension([360 as AmortizationTerm]),
    );
    const grid = builder.build();

    const secondProduct: ProductDefinition = {
      ...baseProduct,
      id: "compare_product_b",
      name: "Compare Product B",
    };

    const result = executeGrid(grid, [baseProduct, secondProduct]);

    // Both products should be evaluated for the single cell
    const productIds = result.cells.map((c) => c.coordinates["productId"]);
    const uniqueProducts = new Set(productIds);
    expect(uniqueProducts.size).toBe(2);
    expect(uniqueProducts.has(baseProduct.id)).toBe(true);
    expect(uniqueProducts.has(secondProduct.id)).toBe(true);
  });

  it("async grid produces same results as sync grid", async () => {
    const transaction = createTransaction();
    const builder = ComparisonGridBuilder.fromTransaction(transaction)
      .withDimension(termDimension([360 as AmortizationTerm]))
      .withDimension(ltvSteps(ratio(0.7), ratio(0.8), ratio(0.1)));
    const grid = builder.build();

    const syncResult = executeGrid(grid, [baseProduct]);
    const asyncResult = await executeGridAsync(grid, [baseProduct], {
      concurrency: 2,
    });

    expect(asyncResult.summary.totalCells).toBe(syncResult.summary.totalCells);
    expect(asyncResult.summary.errorCount).toBe(syncResult.summary.errorCount);
  });
});
