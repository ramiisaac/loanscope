import type {
  AmortizationTerm,
  Asset,
  CheckMargin,
  Money,
  Scenario,
  ScopedProductResult,
  Transaction,
  TransactionVariant,
  UnderwritingCheck,
} from "@loanscope/domain";
import { ActionKind } from "@loanscope/domain";

export type Action =
  | { kind: ActionKind.PayoffLiability; liabilityId: string }
  | { kind: ActionKind.PayDownLoan; amount: Money }
  | { kind: ActionKind.ExcludeAsset; assetId: string }
  | { kind: ActionKind.IncludeBorrowers; borrowerIds: string[] }
  | { kind: ActionKind.AdjustDownPayment; amount: Money }
  | { kind: ActionKind.AddReserves; amount: Money }
  | { kind: ActionKind.ChangeTerm; termMonths: AmortizationTerm };

/** Error captured during state evaluation instead of being silently swallowed. */
export interface SimError {
  productId: string;
  message: string;
}

export interface SimState {
  baseTransaction: Transaction;
  variantOverrides: Partial<TransactionVariant>;
  scenarioOverrides: Partial<Scenario>;
  syntheticAssets?: Asset[];
  actions: Action[];
  results?: ScopedProductResult[];
  totalCashUsed: Money;
  eligibleCount: number;
  worstMargin?: CheckMargin;
  errors?: SimError[];
}

export type SimulationObjective =
  | "MaximizeEligible"
  | "MinimizeCash"
  | "MinimizeActions"
  | "MaximizeWorstMargin";

export interface SimulationLimits {
  maxStates: number;
  maxDepth: number;
  timeoutMs?: number;
}

export interface SimulationPlan {
  borrowerSets: string[][];
  payoffCandidates: string[];
  maxPayoffCount: number;
  maxLoanPaydown?: Money;
  maxDownPaymentAdjust?: Money;
  objectives: SimulationObjective[];
  limits: SimulationLimits;
}

export interface ProductFix {
  productId: string;
  productName: string;
  actions: Action[];
  cashRequired: Money;
  resultingChecks: UnderwritingCheck[];
  eligible: boolean;
}

export interface SimulationReport {
  perProductFixes: ProductFix[];
  bestStates: SimState[];
  statesExplored: number;
  terminated: "complete" | "limit" | "timeout";
}
