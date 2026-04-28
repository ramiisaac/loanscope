import type { Money, RatePct, Ratio } from "../primitives";
import type { AssetAllocationResult } from "./allocation";
import type { CheckResult } from "./check";
import type { UnderwritingResult } from "./underwriting-result";
import type { ActionKind, CheckSeverity, CheckStatus } from "../enums";

/** Graph-compatible execution error for scoped run responses. */
export interface ScopedGraphExecutionError {
  edgeId: string;
  message: string;
  code?: string;
  nodeIds?: string[];
}

/** Graph-compatible check result for scoped product evaluation. */
export interface ScopedGraphCheckResult {
  key: string;
  status: CheckStatus;
  actual?: string;
  limit?: string;
  message?: string;
  margin?: {
    kind: "Money" | "Ratio" | "Months";
    deltaToPass: number;
    actionHint?: ActionKind;
  };
  computedBy?: string;
  severity?: CheckSeverity;
}

export type ProductSourceKind = "generic" | "preset" | "custom";

export type ProductSourceSelection =
  | { kind: "generic" }
  | { kind: "preset"; lenderId: string; presetId: string }
  | { kind: "custom"; lenderId?: string; products: unknown[] };

export interface ScopedProductResult {
  productId: string;
  productName: string;
  variantId?: string;
  pricing?: { payment: Money; rate: RatePct };
  ltv?: {
    ltvPct: Ratio;
    cltvPct?: Ratio;
    downPayment: Money;
    maxLoanByLTV: Money;
  };
  dti?: { dtiPct: Ratio; maxLoanByDTI: Money };
  housing?: { pitiMonthly: Money; fullDTI: Ratio };
  cash?: {
    cashToClose: Money;
    assetAllocation: AssetAllocationResult;
    reservesCheck: CheckResult;
  };
  checks?: ScopedGraphCheckResult[];
  full?: UnderwritingResult;
}

export interface ScopedRunResponse {
  inputScope: string[];
  effectiveScope: string[];
  blocked: Array<{
    nodeId: string;
    missingInputs: string[];
    unlocksFeatures: string[];
  }>;
  estimatesUsed: Array<{ field: string; value: unknown; source: string }>;
  errors: ScopedGraphExecutionError[];
  products: ScopedProductResult[];
  productSource?: ProductSourceSelection;
}
