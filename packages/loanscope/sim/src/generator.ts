import { ActionKind, AmortizationTerm, CheckStatus } from "@loanscope/domain";
import { money } from "@loanscope/domain";
import type { CheckMargin } from "@loanscope/domain";
import type { Action, SimulationPlan, SimState } from "./types";

/** Reserve candidate amounts used when reserve checks are failing. */
const RESERVE_CANDIDATE_AMOUNTS = [10_000, 25_000, 50_000, 100_000] as const;

/** Common amortization terms to consider for ChangeTerm candidates. */
const CANDIDATE_TERMS = [
  AmortizationTerm.M360,
  AmortizationTerm.M300,
  AmortizationTerm.M240,
  AmortizationTerm.M180,
] as const;

/**
 * Generates payoff combinations up to maxCount items per combination,
 * bounded to avoid exponential blowup. Uses iterative deepening by
 * combination size (1, 2, ... maxCount) and stops early once the
 * total number of combinations exceeds a practical ceiling.
 */
export const generatePayoffCombinations = (
  liabilityIds: string[],
  maxCount: number,
): Action[][] => {
  const MAX_TOTAL_COMBINATIONS = 256;
  const results: Action[][] = [[]];

  const clampedMax = Math.min(maxCount, liabilityIds.length);

  const buildCombos = (startIdx: number, currentCombo: Action[], depth: number): void => {
    if (results.length >= MAX_TOTAL_COMBINATIONS) return;
    if (depth > clampedMax) return;

    for (let i = startIdx; i < liabilityIds.length; i++) {
      if (results.length >= MAX_TOTAL_COMBINATIONS) return;
      const id = liabilityIds[i];
      if (id === undefined) continue;
      const next: Action[] = [
        ...currentCombo,
        { kind: ActionKind.PayoffLiability, liabilityId: id },
      ];
      results.push(next);
      buildCombos(i + 1, next, depth + 1);
    }
  };

  buildCombos(0, [], 1);
  return results;
};

/** Creates initial states for each borrower-set variant. */
export const generateBorrowerSetVariants = (
  transaction: SimState["baseTransaction"],
  plan: SimulationPlan,
): SimState[] => {
  const variants = plan.borrowerSets;
  if (variants.length === 0) return [];
  return variants.map((set) => ({
    baseTransaction: transaction,
    variantOverrides: { includedBorrowerIds: set },
    scenarioOverrides: {},
    syntheticAssets: [],
    actions: [{ kind: ActionKind.IncludeBorrowers as const, borrowerIds: set }],
    totalCashUsed: money(0),
    eligibleCount: 0,
  }));
};

/** Sorts actions by relevance to the failing-check margins. */
export const prioritizeActions = (actions: Action[], margins: CheckMargin[]): Action[] => {
  if (margins.length === 0) return actions;
  const priorityKinds: ActionKind[] = margins
    .map((margin) => margin.actionHint)
    .filter((hint): hint is ActionKind => hint !== undefined);

  const prioritized = [...actions];
  prioritized.sort((a, b) => {
    const aIndex = priorityKinds.indexOf(a.kind);
    const bIndex = priorityKinds.indexOf(b.kind);
    return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex);
  });
  return prioritized;
};

/** Produces the candidate action set for the current state and plan. */
export const generateCandidateActions = (state: SimState, plan: SimulationPlan): Action[] => {
  const actions: Action[] = [];
  for (const id of plan.payoffCandidates) {
    actions.push({ kind: ActionKind.PayoffLiability, liabilityId: id });
  }
  if (plan.maxLoanPaydown) {
    actions.push({ kind: ActionKind.PayDownLoan, amount: plan.maxLoanPaydown });
  }
  if (plan.maxDownPaymentAdjust) {
    actions.push({
      kind: ActionKind.AdjustDownPayment,
      amount: plan.maxDownPaymentAdjust,
    });
  }
  if (state.baseTransaction.assets?.length) {
    for (const asset of state.baseTransaction.assets) {
      actions.push({ kind: ActionKind.ExcludeAsset, assetId: asset.id });
    }
  }
  if (state.baseTransaction.borrowers.length > 0) {
    actions.push({
      kind: ActionKind.IncludeBorrowers,
      borrowerIds: state.baseTransaction.borrowers.map((b) => b.id),
    });
  }
  if (plan.borrowerSets.length > 0) {
    for (const set of plan.borrowerSets) {
      actions.push({ kind: ActionKind.IncludeBorrowers, borrowerIds: set });
    }
  }

  // AddReserves candidates when reserve checks are failing
  const reservesFailing = state.results?.some((result) =>
    result.checks?.some(
      (check) => check.key.toLowerCase().includes("reserves") && check.status === CheckStatus.FAIL,
    ),
  );
  if (reservesFailing) {
    for (const amount of RESERVE_CANDIDATE_AMOUNTS) {
      actions.push({ kind: ActionKind.AddReserves, amount: money(amount) });
    }
  }

  // ChangeTerm candidates for terms that differ from the current term
  const currentTerm =
    state.scenarioOverrides.rateNote?.amortizationMonths ??
    state.baseTransaction.scenario.rateNote.amortizationMonths;
  for (const term of CANDIDATE_TERMS) {
    if (term !== currentTerm) {
      actions.push({ kind: ActionKind.ChangeTerm, termMonths: term });
    }
  }

  return actions;
};
