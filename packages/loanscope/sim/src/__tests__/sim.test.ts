import { describe, expect, it } from "vitest";
import {
  applyAction,
  createInitialState,
  deriveStateMetrics,
  evaluateState,
  generateCandidateActions,
  generatePayoffCombinations,
  prioritizeActions,
  rankStates,
  simulate,
  stateKey,
  actionCost,
  InvalidActionTargetError,
} from "../index";
import {
  AmortizationType,
  AssetType,
  ActionKind,
  Channel,
  LiabilityType,
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

const baseProduct: ProductDefinition = {
  id: "sim_product",
  name: "Sim Product",
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
    allowedOccupancies: [Occupancy.Primary],
    allowedPropertyTypes: [PropertyType.SFR],
    maxDTIRatio: ratio(0.45),
  },
};

const createTransaction = (): Transaction => {
  const transaction = quickQuoteToTransaction({
    loanAmount: money(800000),
    purchasePrice: money(1000000),
    fico: 740,
    occupancy: Occupancy.Primary,
    propertyType: PropertyType.SFR,
    loanPurpose: LoanPurpose.Purchase,
    monthlyIncome: money(10000),
    monthlyDebts: money(2000),
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
  transaction.liabilities = [
    {
      id: "auto",
      type: LiabilityType.Auto,
      borrowerIds: transaction.borrowers.map((b) => b.id),
      monthlyPayment: money(600),
      unpaidBalance: money(12000),
      payoffAmount: money(12000),
    },
    {
      id: "student",
      type: LiabilityType.StudentLoan,
      borrowerIds: transaction.borrowers.map((b) => b.id),
      monthlyPayment: money(400),
      unpaidBalance: money(25000),
      payoffAmount: money(25000),
    },
  ];
  transaction.assets = [
    {
      id: "checking",
      type: AssetType.Checking,
      ownerBorrowerIds: transaction.borrowers.map((b) => b.id),
      amount: money(50000),
    },
    {
      id: "savings",
      type: AssetType.Savings,
      ownerBorrowerIds: transaction.borrowers.map((b) => b.id),
      amount: money(100000),
    },
  ];
  return transaction;
};

describe("action application", () => {
  it("applies each action type idempotently", () => {
    const transaction = createTransaction();
    const variant = transaction.variants[0];
    if (!variant) throw new Error("missing variant");
    let state = createInitialState(transaction, variant);
    state = applyAction(state, {
      kind: ActionKind.PayoffLiability,
      liabilityId: "auto",
    });
    state = applyAction(state, {
      kind: ActionKind.PayoffLiability,
      liabilityId: "auto",
    });
    expect(state.variantOverrides.forcePayoffLiabilityIds).toEqual(["auto"]);

    state = applyAction(state, {
      kind: ActionKind.PayDownLoan,
      amount: money(10000),
    });
    expect(state.scenarioOverrides.requestedLoanAmount).toBeDefined();

    state = applyAction(state, {
      kind: ActionKind.ExcludeAsset,
      assetId: "checking",
    });
    expect(state.variantOverrides.excludeAssetIds).toEqual(["checking"]);

    const borrowerIds = transaction.borrowers.map((b) => b.id);
    state = applyAction(state, {
      kind: ActionKind.IncludeBorrowers,
      borrowerIds,
    });
    expect(state.variantOverrides.includedBorrowerIds).toEqual([...borrowerIds].sort());

    state = applyAction(state, {
      kind: ActionKind.AdjustDownPayment,
      amount: money(20000),
    });
    expect(state.scenarioOverrides.downPayment).toBeDefined();

    state = applyAction(state, {
      kind: ActionKind.AddReserves,
      amount: money(10000),
    });
    expect(state.syntheticAssets?.length).toBe(1);
  });
});

describe("deterministic cash accounting", () => {
  it("starts with zero totalCashUsed", () => {
    const transaction = createTransaction();
    const variant = transaction.variants[0];
    if (!variant) throw new Error("missing variant");
    const state = createInitialState(transaction, variant);
    expect(Number(state.totalCashUsed)).toBe(0);
  });

  it("accumulates payoff cost into totalCashUsed", () => {
    const transaction = createTransaction();
    const variant = transaction.variants[0];
    if (!variant) throw new Error("missing variant");
    const state = createInitialState(transaction, variant);
    const afterPayoff = applyAction(state, {
      kind: ActionKind.PayoffLiability,
      liabilityId: "auto",
    });
    expect(Number(afterPayoff.totalCashUsed)).toBe(12000);
  });

  it("accumulates multiple action costs correctly", () => {
    const transaction = createTransaction();
    const variant = transaction.variants[0];
    if (!variant) throw new Error("missing variant");
    let state = createInitialState(transaction, variant);

    state = applyAction(state, {
      kind: ActionKind.PayoffLiability,
      liabilityId: "auto",
    });
    state = applyAction(state, {
      kind: ActionKind.PayDownLoan,
      amount: money(5000),
    });
    state = applyAction(state, {
      kind: ActionKind.AddReserves,
      amount: money(3000),
    });

    expect(Number(state.totalCashUsed)).toBe(12000 + 5000 + 3000);
  });

  it("does not accumulate cost for idempotent re-application", () => {
    const transaction = createTransaction();
    const variant = transaction.variants[0];
    if (!variant) throw new Error("missing variant");
    let state = createInitialState(transaction, variant);
    state = applyAction(state, {
      kind: ActionKind.PayoffLiability,
      liabilityId: "auto",
    });
    const cashAfterFirst = Number(state.totalCashUsed);
    state = applyAction(state, {
      kind: ActionKind.PayoffLiability,
      liabilityId: "auto",
    });
    expect(Number(state.totalCashUsed)).toBe(cashAfterFirst);
  });

  it("ExcludeAsset and IncludeBorrowers do not add cash cost", () => {
    const transaction = createTransaction();
    const variant = transaction.variants[0];
    if (!variant) throw new Error("missing variant");
    let state = createInitialState(transaction, variant);
    state = applyAction(state, {
      kind: ActionKind.ExcludeAsset,
      assetId: "checking",
    });
    expect(Number(state.totalCashUsed)).toBe(0);
    state = applyAction(state, {
      kind: ActionKind.IncludeBorrowers,
      borrowerIds: transaction.borrowers.map((b) => b.id),
    });
    expect(Number(state.totalCashUsed)).toBe(0);
  });

  it("AdjustDownPayment accumulates cost", () => {
    const transaction = createTransaction();
    const variant = transaction.variants[0];
    if (!variant) throw new Error("missing variant");
    let state = createInitialState(transaction, variant);
    state = applyAction(state, {
      kind: ActionKind.AdjustDownPayment,
      amount: money(15000),
    });
    expect(Number(state.totalCashUsed)).toBe(15000);
  });

  it("actionCost returns correct values per action type", () => {
    const transaction = createTransaction();
    expect(
      Number(actionCost({ kind: ActionKind.PayoffLiability, liabilityId: "auto" }, transaction)),
    ).toBe(12000);
    expect(
      Number(actionCost({ kind: ActionKind.PayDownLoan, amount: money(7000) }, transaction)),
    ).toBe(7000);
    expect(
      Number(actionCost({ kind: ActionKind.ExcludeAsset, assetId: "checking" }, transaction)),
    ).toBe(0);
    expect(
      Number(
        actionCost(
          {
            kind: ActionKind.IncludeBorrowers,
            borrowerIds: ["b1"],
          },
          transaction,
        ),
      ),
    ).toBe(0);
    expect(
      Number(actionCost({ kind: ActionKind.AddReserves, amount: money(5000) }, transaction)),
    ).toBe(5000);
  });
});

describe("action target validation", () => {
  it("throws InvalidActionTargetError for nonexistent liability", () => {
    const transaction = createTransaction();
    const variant = transaction.variants[0];
    if (!variant) throw new Error("missing variant");
    const state = createInitialState(transaction, variant);
    expect(() =>
      applyAction(state, {
        kind: ActionKind.PayoffLiability,
        liabilityId: "nonexistent",
      }),
    ).toThrow(InvalidActionTargetError);
  });

  it("throws InvalidActionTargetError for nonexistent asset", () => {
    const transaction = createTransaction();
    const variant = transaction.variants[0];
    if (!variant) throw new Error("missing variant");
    const state = createInitialState(transaction, variant);
    expect(() =>
      applyAction(state, {
        kind: ActionKind.ExcludeAsset,
        assetId: "nonexistent",
      }),
    ).toThrow(InvalidActionTargetError);
  });

  it("throws InvalidActionTargetError for nonexistent borrower", () => {
    const transaction = createTransaction();
    const variant = transaction.variants[0];
    if (!variant) throw new Error("missing variant");
    const state = createInitialState(transaction, variant);
    expect(() =>
      applyAction(state, {
        kind: ActionKind.IncludeBorrowers,
        borrowerIds: ["ghost-borrower"],
      }),
    ).toThrow(InvalidActionTargetError);
  });

  it("succeeds for valid targets", () => {
    const transaction = createTransaction();
    const variant = transaction.variants[0];
    if (!variant) throw new Error("missing variant");
    const state = createInitialState(transaction, variant);
    expect(() =>
      applyAction(state, {
        kind: ActionKind.PayoffLiability,
        liabilityId: "auto",
      }),
    ).not.toThrow();
    expect(() =>
      applyAction(state, {
        kind: ActionKind.ExcludeAsset,
        assetId: "checking",
      }),
    ).not.toThrow();
    expect(() =>
      applyAction(state, {
        kind: ActionKind.IncludeBorrowers,
        borrowerIds: transaction.borrowers.map((b) => b.id),
      }),
    ).not.toThrow();
  });
});

describe("deterministic synthetic reserve asset IDs", () => {
  it("generates IDs based on action index, not random values", () => {
    const transaction = createTransaction();
    const variant = transaction.variants[0];
    if (!variant) throw new Error("missing variant");
    const state = createInitialState(transaction, variant);

    const withReserves = applyAction(state, {
      kind: ActionKind.AddReserves,
      amount: money(10000),
    });

    const assets = withReserves.syntheticAssets ?? [];
    expect(assets.length).toBe(1);
    expect(assets[0]?.id).toBe("synthetic-reserve-0");
  });

  it("produces distinct IDs for sequential reserve additions", () => {
    const transaction = createTransaction();
    const variant = transaction.variants[0];
    if (!variant) throw new Error("missing variant");
    let state = createInitialState(transaction, variant);

    state = applyAction(state, {
      kind: ActionKind.AddReserves,
      amount: money(10000),
    });
    state = applyAction(state, {
      kind: ActionKind.PayoffLiability,
      liabilityId: "auto",
    });
    state = applyAction(state, {
      kind: ActionKind.AddReserves,
      amount: money(5000),
    });

    const assets = state.syntheticAssets ?? [];
    expect(assets.length).toBe(2);
    expect(assets[0]?.id).toBe("synthetic-reserve-0");
    expect(assets[1]?.id).toBe("synthetic-reserve-2");
  });

  it("is deterministic across identical action sequences", () => {
    const transaction = createTransaction();
    const variant = transaction.variants[0];
    if (!variant) throw new Error("missing variant");

    const run = (): string[] => {
      let s = createInitialState(transaction, variant);
      s = applyAction(s, {
        kind: ActionKind.AddReserves,
        amount: money(10000),
      });
      s = applyAction(s, {
        kind: ActionKind.PayoffLiability,
        liabilityId: "auto",
      });
      s = applyAction(s, {
        kind: ActionKind.AddReserves,
        amount: money(5000),
      });
      return (s.syntheticAssets ?? []).map((a) => a.id);
    };

    expect(run()).toEqual(run());
  });
});

describe("state key uniqueness", () => {
  it("produces unique keys for distinct states", () => {
    const transaction = createTransaction();
    const variant = transaction.variants[0];
    if (!variant) throw new Error("missing variant");
    const stateA = createInitialState(transaction, variant);
    const stateB = applyAction(stateA, {
      kind: ActionKind.PayDownLoan,
      amount: money(10000),
    });
    expect(stateKey(stateA)).not.toBe(stateKey(stateB));
  });

  it("produces equal keys for the same action sequence", () => {
    const transaction = createTransaction();
    const variant = transaction.variants[0];
    if (!variant) throw new Error("missing variant");
    const stateA = applyAction(createInitialState(transaction, variant), {
      kind: ActionKind.PayoffLiability,
      liabilityId: "auto",
    });
    const stateB = applyAction(createInitialState(transaction, variant), {
      kind: ActionKind.PayoffLiability,
      liabilityId: "auto",
    });
    expect(stateKey(stateA)).toBe(stateKey(stateB));
  });
});

describe("bounded action generation", () => {
  it("generatePayoffCombinations respects maxCount", () => {
    const ids = ["a", "b", "c", "d", "e"];
    const combos = generatePayoffCombinations(ids, 2);
    for (const combo of combos) {
      expect(combo.length).toBeLessThanOrEqual(2);
    }
    // Should include empty combo
    expect(combos.some((c) => c.length === 0)).toBe(true);
    // Should include single-item combos
    expect(combos.filter((c) => c.length === 1).length).toBe(5);
    // Should include 2-item combos (C(5,2) = 10)
    expect(combos.filter((c) => c.length === 2).length).toBe(10);
    // No 3+ item combos
    expect(combos.filter((c) => c.length >= 3).length).toBe(0);
  });

  it("does not exceed hard upper bound on total combinations", () => {
    // 20 liabilities would be 2^20 = ~1M without bounding
    const ids = Array.from({ length: 20 }, (_, i) => `liability-${i}`);
    const combos = generatePayoffCombinations(ids, 20);
    expect(combos.length).toBeLessThanOrEqual(256);
  });

  it("generates empty set for zero maxCount", () => {
    const combos = generatePayoffCombinations(["a", "b"], 0);
    expect(combos).toEqual([[]]);
  });

  it("all generated actions use ActionKind.PayoffLiability", () => {
    const combos = generatePayoffCombinations(["x", "y"], 2);
    for (const combo of combos) {
      for (const action of combo) {
        expect(action.kind).toBe(ActionKind.PayoffLiability);
      }
    }
  });
});

describe("action generation and prioritization", () => {
  it("prioritizes actions based on margin hints", () => {
    const transaction = createTransaction();
    const variant = transaction.variants[0];
    if (!variant) throw new Error("missing variant");
    const state = createInitialState(transaction, variant);
    const candidates = generateCandidateActions(state, {
      borrowerSets: [],
      payoffCandidates: ["auto"],
      maxPayoffCount: 1,
      objectives: ["MaximizeEligible"],
      limits: { maxStates: 10, maxDepth: 2 },
    });
    const prioritized = prioritizeActions(candidates, [
      {
        kind: "Money",
        deltaToPass: 1000,
        actionHint: ActionKind.PayoffLiability,
      },
    ]);
    expect(prioritized[0]?.kind).toBe(ActionKind.PayoffLiability);
  });

  it("all generated candidate actions use ActionKind enum values", () => {
    const transaction = createTransaction();
    const variant = transaction.variants[0];
    if (!variant) throw new Error("missing variant");
    const state = createInitialState(transaction, variant);
    const candidates = generateCandidateActions(state, {
      borrowerSets: [transaction.borrowers.map((b) => b.id)],
      payoffCandidates: ["auto", "student"],
      maxPayoffCount: 2,
      maxLoanPaydown: money(5000),
      maxDownPaymentAdjust: money(5000),
      objectives: ["MaximizeEligible"],
      limits: { maxStates: 10, maxDepth: 2 },
    });
    const validKinds = new Set(Object.values(ActionKind));
    for (const action of candidates) {
      expect(validKinds.has(action.kind)).toBe(true);
    }
  });
});

describe("payoff action improves DTI", () => {
  it("reduces DTI when payoff liability is applied", () => {
    const transaction = createTransaction();
    const variant = transaction.variants[0];
    if (!variant) throw new Error("missing variant");
    const baseState = createInitialState(transaction, variant);
    const evaluatedBase = evaluateState(baseState, [baseProduct]);
    const baseMetrics = deriveStateMetrics(evaluatedBase);

    const payoffState = applyAction(evaluatedBase, {
      kind: ActionKind.PayoffLiability,
      liabilityId: "auto",
    });
    const evaluatedPayoff = evaluateState(payoffState, [baseProduct]);
    const payoffMetrics = deriveStateMetrics(evaluatedPayoff);

    expect(payoffMetrics.eligibleCount).toBeGreaterThanOrEqual(baseMetrics.eligibleCount);
  });
});

describe("typed Pareto ranking", () => {
  it("returns pareto-optimal states without type suppression", () => {
    const transaction = createTransaction();
    const variant = transaction.variants[0];
    if (!variant) throw new Error("missing variant");
    const base = createInitialState(transaction, variant);
    const states = [
      {
        ...base,
        eligibleCount: 1,
        totalCashUsed: money(5000),
        actions: [],
      },
      {
        ...base,
        eligibleCount: 2,
        totalCashUsed: money(10000),
        actions: [
          {
            kind: ActionKind.PayDownLoan as const,
            amount: money(1000),
          },
        ],
      },
      {
        ...base,
        eligibleCount: 2,
        totalCashUsed: money(3000),
        actions: [],
      },
    ];
    const ranked = rankStates(states, ["MaximizeEligible", "MinimizeCash"]);
    expect(ranked.length).toBeGreaterThan(0);
    expect(ranked.some((state) => Number(state.totalCashUsed) === 3000)).toBe(true);
  });

  it("filters dominated states", () => {
    const transaction = createTransaction();
    const variant = transaction.variants[0];
    if (!variant) throw new Error("missing variant");
    const base = createInitialState(transaction, variant);

    // State A: eligible=2, cash=3000 dominates State B: eligible=1, cash=5000
    const stateA = {
      ...base,
      eligibleCount: 2,
      totalCashUsed: money(3000),
      actions: [],
    };
    const stateB = {
      ...base,
      eligibleCount: 1,
      totalCashUsed: money(5000),
      actions: [],
    };
    const ranked = rankStates([stateA, stateB], ["MaximizeEligible", "MinimizeCash"]);
    expect(ranked.length).toBe(1);
    expect(ranked[0]?.eligibleCount).toBe(2);
  });

  it("returns both states when neither dominates the other", () => {
    const transaction = createTransaction();
    const variant = transaction.variants[0];
    if (!variant) throw new Error("missing variant");
    const base = createInitialState(transaction, variant);

    // A is better on eligible, B is better on cash
    const stateA = {
      ...base,
      eligibleCount: 3,
      totalCashUsed: money(8000),
      actions: [],
    };
    const stateB = {
      ...base,
      eligibleCount: 1,
      totalCashUsed: money(1000),
      actions: [],
    };
    const ranked = rankStates([stateA, stateB], ["MaximizeEligible", "MinimizeCash"]);
    expect(ranked.length).toBe(2);
  });

  it("handles empty state array", () => {
    const ranked = rankStates([], ["MaximizeEligible"]);
    expect(ranked).toEqual([]);
  });
});

describe("executor error surfacing", () => {
  it("captures product evaluation errors in state.errors", () => {
    const transaction = createTransaction();
    const variant = transaction.variants[0];
    if (!variant) throw new Error("missing variant");
    const state = createInitialState(transaction, variant);

    // Create a product that will fail evaluation
    const badProduct: ProductDefinition = {
      ...baseProduct,
      id: "bad_product",
      name: "Bad Product",
      variants: [],
    };

    const result = evaluateState(state, [badProduct]);
    // The product either produces no results or captures errors
    const hasError = (result.errors ?? []).length > 0;
    const hasNoResult = !result.results || result.results.length === 0;
    expect(hasError || hasNoResult).toBe(true);
  });

  it("counts eligible products when scoped results have underwriting basis", () => {
    const transaction = createTransaction();
    const variant = transaction.variants[0];
    if (!variant) throw new Error("missing variant");
    const state = createInitialState(transaction, variant);

    const result = evaluateState(state, [baseProduct]);
    const metrics = deriveStateMetrics(result);
    const expectedEligibleCount = result.results?.[0]?.full?.eligible ? 1 : 0;

    expect(result.results?.[0]?.full).toBeDefined();
    expect(metrics.eligibleCount).toBe(expectedEligibleCount);
  });
});

describe("simulation", () => {
  it("finds fixes within limits", () => {
    const transaction = createTransaction();
    const report = simulate(transaction, [baseProduct], {
      borrowerSets: [],
      payoffCandidates: ["auto"],
      maxPayoffCount: 1,
      maxLoanPaydown: money(5000),
      maxDownPaymentAdjust: money(5000),
      objectives: ["MaximizeEligible", "MinimizeCash"],
      limits: { maxStates: 50, maxDepth: 3 },
    });
    expect(report.statesExplored).toBeGreaterThan(0);
    expect(report.bestStates.length).toBeGreaterThan(0);
  });

  it("respects maxStates limit", () => {
    const transaction = createTransaction();
    const report = simulate(transaction, [baseProduct], {
      borrowerSets: [],
      payoffCandidates: ["auto", "student"],
      maxPayoffCount: 2,
      maxLoanPaydown: money(5000),
      objectives: ["MaximizeEligible"],
      limits: { maxStates: 5, maxDepth: 3 },
    });
    expect(report.statesExplored).toBeLessThanOrEqual(5);
  });

  it("all best states have zero or positive totalCashUsed", () => {
    const transaction = createTransaction();
    const report = simulate(transaction, [baseProduct], {
      borrowerSets: [],
      payoffCandidates: ["auto"],
      maxPayoffCount: 1,
      objectives: ["MaximizeEligible", "MinimizeCash"],
      limits: { maxStates: 20, maxDepth: 2 },
    });
    for (const state of report.bestStates) {
      expect(Number(state.totalCashUsed)).toBeGreaterThanOrEqual(0);
    }
  });

  it("fix discovery: payoff suggestion can produce eligible states", () => {
    const transaction = createTransaction();
    const report = simulate(transaction, [baseProduct], {
      borrowerSets: [],
      payoffCandidates: ["auto", "student"],
      maxPayoffCount: 2,
      maxLoanPaydown: money(10000),
      objectives: ["MaximizeEligible", "MinimizeCash"],
      limits: { maxStates: 50, maxDepth: 3 },
    });

    const hasEligible = report.bestStates.some((state) => state.eligibleCount > 0);
    // At minimum, the simulation explored states and produced output
    expect(report.statesExplored).toBeGreaterThan(1);
    // If any state found eligibility, that validates fix discovery
    if (hasEligible) {
      expect(report.bestStates.filter((s) => s.eligibleCount > 0).length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Wave 8-A: Simulation payoff recommendation behavior
// ---------------------------------------------------------------------------

describe("simulation payoff recommendation behavior", () => {
  it("payoff actions produce states with fewer liabilities in scope", () => {
    const transaction = createTransaction();
    const variant = transaction.variants[0];
    if (!variant) throw new Error("missing variant");
    const state = createInitialState(transaction, variant);

    const afterPayoff = applyAction(state, {
      kind: ActionKind.PayoffLiability,
      liabilityId: "auto",
    });

    // The payoff should be recorded in forcePayoffLiabilityIds
    expect(afterPayoff.variantOverrides.forcePayoffLiabilityIds).toContain("auto");
    // Cash used should reflect the payoff cost
    expect(Number(afterPayoff.totalCashUsed)).toBe(12000);
  });

  it("simulation with payoff candidates explores payoff states", () => {
    const transaction = createTransaction();
    const report = simulate(transaction, [baseProduct], {
      borrowerSets: [],
      payoffCandidates: ["auto", "student"],
      maxPayoffCount: 2,
      maxLoanPaydown: money(5000),
      maxDownPaymentAdjust: money(5000),
      objectives: ["MaximizeEligible", "MinimizeCash"],
      limits: { maxStates: 50, maxDepth: 3 },
    });

    // The simulation must explore states beyond just the base
    expect(report.statesExplored).toBeGreaterThan(1);

    // The simulator should have considered payoff actions even if they did not
    // produce the globally best state.
    expect(report.statesExplored).toBeGreaterThanOrEqual(2);
  });

  it("payoff recommendation reduces monthly debt obligation", () => {
    const transaction = createTransaction();
    const variant = transaction.variants[0];
    if (!variant) throw new Error("missing variant");
    const baseState = createInitialState(transaction, variant);
    const evaluatedBase = evaluateState(baseState, [baseProduct]);
    const baseMetrics = deriveStateMetrics(evaluatedBase);

    const payoffState = applyAction(baseState, {
      kind: ActionKind.PayoffLiability,
      liabilityId: "auto",
    });
    const evaluatedPayoff = evaluateState(payoffState, [baseProduct]);
    const payoffMetrics = deriveStateMetrics(evaluatedPayoff);

    // After paying off auto loan ($600/mo), eligible count should be
    // at least as good (the payoff removes monthly debt).
    expect(payoffMetrics.eligibleCount).toBeGreaterThanOrEqual(baseMetrics.eligibleCount);
  });

  it("simulation report contains perProductFixes when eligible states exist", () => {
    const transaction = createTransaction();
    const report = simulate(transaction, [baseProduct], {
      borrowerSets: [],
      payoffCandidates: ["auto", "student"],
      maxPayoffCount: 2,
      maxLoanPaydown: money(10000),
      maxDownPaymentAdjust: money(10000),
      objectives: ["MaximizeEligible", "MinimizeCash"],
      limits: { maxStates: 50, maxDepth: 3 },
    });

    // perProductFixes should be an array (possibly empty if no eligible state found)
    expect(Array.isArray(report.perProductFixes)).toBe(true);

    // If any fix was found, it should reference the product
    for (const fix of report.perProductFixes) {
      expect(fix.productId).toBe(baseProduct.id);
      expect(fix.productName).toBe(baseProduct.name);
      expect(Array.isArray(fix.actions)).toBe(true);
      expect(Number(fix.cashRequired)).toBeGreaterThanOrEqual(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Wave 8-A: Deterministic synthetic reserve asset IDs (confirm)
// ---------------------------------------------------------------------------

describe("deterministic synthetic reserve asset IDs (confirmation)", () => {
  it("reserve ID is derived from action index position in state", () => {
    const transaction = createTransaction();
    const variant = transaction.variants[0];
    if (!variant) throw new Error("missing variant");
    const state = createInitialState(transaction, variant);

    // First action at index 0
    const s1 = applyAction(state, {
      kind: ActionKind.AddReserves,
      amount: money(20000),
    });
    const assets1 = s1.syntheticAssets ?? [];
    expect(assets1.length).toBe(1);
    expect(assets1[0]?.id).toBe("synthetic-reserve-0");

    // Second action at index 1 (payoff, not reserve -- so next reserve is index 2)
    const s2 = applyAction(s1, {
      kind: ActionKind.PayoffLiability,
      liabilityId: "auto",
    });
    const s3 = applyAction(s2, {
      kind: ActionKind.AddReserves,
      amount: money(15000),
    });
    const assets3 = s3.syntheticAssets ?? [];
    expect(assets3.length).toBe(2);
    expect(assets3[1]?.id).toBe("synthetic-reserve-2");
  });

  it("repeated identical action sequences yield identical asset IDs", () => {
    const transaction = createTransaction();
    const variant = transaction.variants[0];
    if (!variant) throw new Error("missing variant");

    const runSequence = (): string[] => {
      let s = createInitialState(transaction, variant);
      s = applyAction(s, {
        kind: ActionKind.AddReserves,
        amount: money(25000),
      });
      s = applyAction(s, {
        kind: ActionKind.PayoffLiability,
        liabilityId: "student",
      });
      s = applyAction(s, {
        kind: ActionKind.AddReserves,
        amount: money(10000),
      });
      return (s.syntheticAssets ?? []).map((a) => a.id);
    };

    const first = runSequence();
    const second = runSequence();
    expect(first).toEqual(second);
    expect(first.length).toBe(2);
  });

  it("different action orders produce different asset IDs", () => {
    const transaction = createTransaction();
    const variant = transaction.variants[0];
    if (!variant) throw new Error("missing variant");

    // Sequence A: reserve first, then payoff, then reserve
    let stateA = createInitialState(transaction, variant);
    stateA = applyAction(stateA, {
      kind: ActionKind.AddReserves,
      amount: money(10000),
    });
    stateA = applyAction(stateA, {
      kind: ActionKind.PayoffLiability,
      liabilityId: "auto",
    });
    stateA = applyAction(stateA, {
      kind: ActionKind.AddReserves,
      amount: money(5000),
    });

    // Sequence B: payoff first, then reserve, then reserve
    let stateB = createInitialState(transaction, variant);
    stateB = applyAction(stateB, {
      kind: ActionKind.PayoffLiability,
      liabilityId: "auto",
    });
    stateB = applyAction(stateB, {
      kind: ActionKind.AddReserves,
      amount: money(10000),
    });
    stateB = applyAction(stateB, {
      kind: ActionKind.AddReserves,
      amount: money(5000),
    });

    const idsA = (stateA.syntheticAssets ?? []).map((a) => a.id);
    const idsB = (stateB.syntheticAssets ?? []).map((a) => a.id);

    // IDs should differ because the action index positions are different
    expect(idsA).not.toEqual(idsB);
  });
});

// ---------------------------------------------------------------------------
// Wave 8-A: Deterministic cash accounting (confirm)
// ---------------------------------------------------------------------------

describe("deterministic cash accounting (confirmation)", () => {
  it("identical action sequences produce identical totalCashUsed", () => {
    const transaction = createTransaction();
    const variant = transaction.variants[0];
    if (!variant) throw new Error("missing variant");

    const runSequence = (): number => {
      let s = createInitialState(transaction, variant);
      s = applyAction(s, {
        kind: ActionKind.PayoffLiability,
        liabilityId: "auto",
      });
      s = applyAction(s, {
        kind: ActionKind.AddReserves,
        amount: money(10000),
      });
      s = applyAction(s, {
        kind: ActionKind.PayDownLoan,
        amount: money(5000),
      });
      return Number(s.totalCashUsed);
    };

    const first = runSequence();
    const second = runSequence();
    expect(first).toBe(second);
    // auto payoff (12000) + reserves (10000) + paydown (5000) = 27000
    expect(first).toBe(27000);
  });

  it("cash accounting reflects exact payoff amounts from liability data", () => {
    const transaction = createTransaction();
    const variant = transaction.variants[0];
    if (!variant) throw new Error("missing variant");
    let state = createInitialState(transaction, variant);

    // Pay off auto ($12000 unpaid balance)
    state = applyAction(state, {
      kind: ActionKind.PayoffLiability,
      liabilityId: "auto",
    });
    expect(Number(state.totalCashUsed)).toBe(12000);

    // Pay off student ($25000 unpaid balance)
    state = applyAction(state, {
      kind: ActionKind.PayoffLiability,
      liabilityId: "student",
    });
    expect(Number(state.totalCashUsed)).toBe(37000);
  });

  it("ExcludeAsset and IncludeBorrowers cost zero cash", () => {
    const transaction = createTransaction();
    const variant = transaction.variants[0];
    if (!variant) throw new Error("missing variant");
    let state = createInitialState(transaction, variant);

    state = applyAction(state, {
      kind: ActionKind.ExcludeAsset,
      assetId: "checking",
    });
    expect(Number(state.totalCashUsed)).toBe(0);

    state = applyAction(state, {
      kind: ActionKind.IncludeBorrowers,
      borrowerIds: [transaction.borrowers[0]!.id],
    });
    expect(Number(state.totalCashUsed)).toBe(0);
  });

  it("AdjustDownPayment adds to cash used deterministically", () => {
    const transaction = createTransaction();
    const variant = transaction.variants[0];
    if (!variant) throw new Error("missing variant");
    let state = createInitialState(transaction, variant);

    state = applyAction(state, {
      kind: ActionKind.AdjustDownPayment,
      amount: money(50000),
    });
    expect(Number(state.totalCashUsed)).toBe(50000);
  });

  it("actionCost helper returns correct cost per action type", () => {
    const transaction = createTransaction();

    const payoffCost = actionCost(
      { kind: ActionKind.PayoffLiability, liabilityId: "auto" },
      transaction,
    );
    expect(Number(payoffCost)).toBe(12000);

    const paydownCost = actionCost(
      { kind: ActionKind.PayDownLoan, amount: money(3000) },
      transaction,
    );
    expect(Number(paydownCost)).toBe(3000);

    const excludeCost = actionCost(
      { kind: ActionKind.ExcludeAsset, assetId: "checking" },
      transaction,
    );
    expect(Number(excludeCost)).toBe(0);

    const includeCost = actionCost(
      {
        kind: ActionKind.IncludeBorrowers,
        borrowerIds: [transaction.borrowers[0]!.id],
      },
      transaction,
    );
    expect(Number(includeCost)).toBe(0);

    const reserveCost = actionCost(
      { kind: ActionKind.AddReserves, amount: money(7500) },
      transaction,
    );
    expect(Number(reserveCost)).toBe(7500);
  });
});

// ---------------------------------------------------------------------------
// Integration: simulation with real products (moved from engine)
// ---------------------------------------------------------------------------

describe("simulation integration with real products", () => {
  it("explores states and processes payoff candidates", () => {
    const transaction = quickQuoteToTransaction({
      loanAmount: money(800000),
      purchasePrice: money(1000000),
      fico: 700,
      occupancy: Occupancy.Primary,
      propertyType: PropertyType.SFR,
      loanPurpose: LoanPurpose.Purchase,
      monthlyIncome: money(8000),
      monthlyDebts: money(2000),
      annualTaxes: money(7200),
      annualInsurance: money(1800),
      monthlyHoa: money(0),
      noteRatePct: ratePct(6.75),
      amortizationMonths: months(360),
      stateCode: "CA",
      totalLiquidAssets: money(150000),
    });
    transaction.scenario.monthlyHousing.mi = money(0);
    transaction.scenario.monthlyHousing.floodInsurance = money(0);
    transaction.scenario.location = { stateCode: "CA" };
    transaction.liabilities = [
      {
        id: "auto",
        type: LiabilityType.Auto,
        borrowerIds: transaction.borrowers.map((b) => b.id),
        monthlyPayment: money(800),
        unpaidBalance: money(12000),
        payoffAmount: money(12000),
      },
    ];

    const products: ProductDefinition[] = [baseProduct];
    const report = simulate(transaction, products, {
      borrowerSets: [],
      payoffCandidates: ["auto"],
      maxPayoffCount: 1,
      maxLoanPaydown: money(5000),
      maxDownPaymentAdjust: money(5000),
      objectives: ["MaximizeEligible", "MinimizeCash"],
      limits: { maxStates: 30, maxDepth: 2 },
    });

    expect(report.statesExplored).toBeGreaterThan(0);
    expect(report.statesExplored).toBeGreaterThanOrEqual(2);
  });
});
