import Decimal from "decimal.js";
import { produce } from "immer";
import { ActionKind, assertNever } from "@loanscope/domain";
import type { AmortizationTerm, Asset, Money, Transaction } from "@loanscope/domain";
import { AssetType, money } from "@loanscope/domain";
import type { Action, SimState } from "./types";

const moneyValue = (value: Money): number => Number(value);

/** Deterministic synthetic reserve asset ID derived from action index. */
const syntheticReserveId = (actionIndex: number): string => `synthetic-reserve-${actionIndex}`;

export class InvalidActionTargetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidActionTargetError";
  }
}

const addCost = (current: Money, cost: Money): Money =>
  money(new Decimal(moneyValue(current)).plus(moneyValue(cost)).toNumber());

const payoffLiability = (state: SimState, liabilityId: string): SimState => {
  const liability = state.baseTransaction.liabilities?.find((l) => l.id === liabilityId);
  if (!liability) {
    throw new InvalidActionTargetError(
      `Liability "${liabilityId}" does not exist on the transaction`,
    );
  }
  const existing = state.variantOverrides.forcePayoffLiabilityIds ?? [];
  if (existing.includes(liabilityId)) return state;
  const cost = liability.unpaidBalance ?? money(0);
  return produce(state, (draft) => {
    draft.variantOverrides.forcePayoffLiabilityIds = [...existing, liabilityId];
    draft.actions.push({ kind: ActionKind.PayoffLiability, liabilityId });
    draft.totalCashUsed = addCost(state.totalCashUsed, cost);
  });
};

const payDownLoan = (state: SimState, amount: Money): SimState => {
  const current =
    state.scenarioOverrides.requestedLoanAmount ??
    state.baseTransaction.scenario.requestedLoanAmount;
  const nextAmount = new Decimal(moneyValue(current)).minus(moneyValue(amount)).toNumber();
  if (nextAmount <= 0) return state;
  const newAmount = money(nextAmount);
  if (moneyValue(current) === moneyValue(newAmount)) return state;
  return produce(state, (draft) => {
    draft.scenarioOverrides.requestedLoanAmount = newAmount;
    draft.actions.push({ kind: ActionKind.PayDownLoan, amount });
    draft.totalCashUsed = addCost(state.totalCashUsed, amount);
  });
};

const excludeAsset = (state: SimState, assetId: string): SimState => {
  const asset = state.baseTransaction.assets?.find((a) => a.id === assetId);
  if (!asset) {
    throw new InvalidActionTargetError(`Asset "${assetId}" does not exist on the transaction`);
  }
  const existing = state.variantOverrides.excludeAssetIds ?? [];
  if (existing.includes(assetId)) return state;
  return produce(state, (draft) => {
    draft.variantOverrides.excludeAssetIds = [...existing, assetId];
    draft.actions.push({ kind: ActionKind.ExcludeAsset, assetId });
  });
};

const includeBorrowers = (state: SimState, borrowerIds: string[]): SimState => {
  const normalized = [...borrowerIds].sort();
  const knownIds = new Set(state.baseTransaction.borrowers.map((b) => b.id));
  for (const id of normalized) {
    if (!knownIds.has(id)) {
      throw new InvalidActionTargetError(`Borrower "${id}" does not exist on the transaction`);
    }
  }
  const existing = state.variantOverrides.includedBorrowerIds ?? [];
  if (existing.length === normalized.length && existing.every((id) => normalized.includes(id))) {
    return state;
  }
  return produce(state, (draft) => {
    draft.variantOverrides.includedBorrowerIds = normalized;
    draft.actions.push({
      kind: ActionKind.IncludeBorrowers,
      borrowerIds: normalized,
    });
  });
};

const adjustDownPayment = (state: SimState, amount: Money): SimState => {
  const current = state.scenarioOverrides.downPayment ?? state.baseTransaction.scenario.downPayment;
  if (current !== undefined && moneyValue(current) === moneyValue(amount)) return state;
  return produce(state, (draft) => {
    draft.scenarioOverrides.downPayment = amount;
    draft.actions.push({ kind: ActionKind.AdjustDownPayment, amount });
    draft.totalCashUsed = addCost(state.totalCashUsed, amount);
  });
};

const addReserves = (state: SimState, amount: Money): SimState => {
  const borrowers = state.baseTransaction.borrowers.map((borrower) => borrower.id);
  const actionIndex = state.actions.length;
  const assetId = syntheticReserveId(actionIndex);
  const asset: Asset = {
    id: assetId,
    type: AssetType.Checking,
    ownerBorrowerIds: borrowers,
    amount,
  };
  const existing = state.syntheticAssets ?? [];
  const already = existing.find((item) => moneyValue(item.amount) === moneyValue(amount));
  if (already) return state;
  return produce(state, (draft) => {
    draft.syntheticAssets = [...existing, asset];
    draft.actions.push({ kind: ActionKind.AddReserves, amount });
    draft.totalCashUsed = addCost(state.totalCashUsed, amount);
  });
};

const changeTerm = (state: SimState, termMonths: AmortizationTerm): SimState => {
  const currentRateNote = state.scenarioOverrides.rateNote;
  const current = currentRateNote?.amortizationMonths;
  if (current === termMonths) return state;
  return produce(state, (draft) => {
    const baseRateNote =
      draft.scenarioOverrides.rateNote ?? state.baseTransaction.scenario.rateNote;
    draft.scenarioOverrides.rateNote = {
      ...baseRateNote,
      amortizationMonths: termMonths,
    };
    draft.actions.push({ kind: ActionKind.ChangeTerm, termMonths });
  });
};

export const applyAction = (state: SimState, action: Action): SimState => {
  switch (action.kind) {
    case ActionKind.PayoffLiability:
      return payoffLiability(state, action.liabilityId);
    case ActionKind.PayDownLoan:
      return payDownLoan(state, action.amount);
    case ActionKind.ExcludeAsset:
      return excludeAsset(state, action.assetId);
    case ActionKind.IncludeBorrowers:
      return includeBorrowers(state, action.borrowerIds);
    case ActionKind.AdjustDownPayment:
      return adjustDownPayment(state, action.amount);
    case ActionKind.AddReserves:
      return addReserves(state, action.amount);
    case ActionKind.ChangeTerm:
      return changeTerm(state, action.termMonths);
    default:
      return assertNever(action);
  }
};

export const actionCost = (action: Action, transaction: Transaction): Money => {
  switch (action.kind) {
    case ActionKind.PayoffLiability: {
      const liability = transaction.liabilities?.find((item) => item.id === action.liabilityId);
      return liability?.unpaidBalance ?? money(0);
    }
    case ActionKind.PayDownLoan:
      return action.amount;
    case ActionKind.ExcludeAsset:
      return money(0);
    case ActionKind.IncludeBorrowers:
      return money(0);
    case ActionKind.AdjustDownPayment:
      return action.amount;
    case ActionKind.AddReserves:
      return action.amount;
    case ActionKind.ChangeTerm:
      return money(0);
    default:
      return assertNever(action);
  }
};

export const describeAction = (action: Action): string => {
  switch (action.kind) {
    case ActionKind.PayoffLiability:
      return `Pay off liability ${action.liabilityId}`;
    case ActionKind.PayDownLoan:
      return `Pay down loan by ${moneyValue(action.amount)}`;
    case ActionKind.ExcludeAsset:
      return `Exclude asset ${action.assetId} from reserves`;
    case ActionKind.IncludeBorrowers:
      return `Include borrowers ${action.borrowerIds.join(",")}`;
    case ActionKind.AdjustDownPayment:
      return `Adjust down payment by ${moneyValue(action.amount)}`;
    case ActionKind.AddReserves:
      return `Add reserves ${moneyValue(action.amount)}`;
    case ActionKind.ChangeTerm:
      return `Change term to ${action.termMonths} months`;
    default:
      return assertNever(action);
  }
};
