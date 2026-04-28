import { Money, Ratio } from "../primitives";
import { AssetAllocationResult } from "./allocation";
import { UnderwritingCheck, CheckMargin } from "./check";

export interface CashFlowBreakdown {
  qualifyingIncomeMonthly: Money;
  liabilitiesMonthly: Money;
  pitiMonthly: Money;
  dtiBackEndRatio: Ratio;
}

export interface DerivedMetrics {
  loanAmount: Money;
  cashFlow: CashFlowBreakdown;
  assetAllocation: AssetAllocationResult;
  ltvRatio?: Ratio;
  cltvRatio?: Ratio;
  requiredReservesDollars?: Money;
  qualifyingPayment?: Money;
}

export interface UnderwritingResult {
  productId: string;
  productName: string;
  variantId: string;
  eligible: boolean;
  checks: UnderwritingCheck[];
  failureReasons: string[];
  warnings: string[];
  derived: DerivedMetrics;
}

export interface UnderwritingSummary {
  eligibleCount: number;
  ineligibleCount: number;
  warningsCount: number;
  worstMargin?: CheckMargin;
}
