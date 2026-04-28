import Decimal from "decimal.js";
import { LoanPurpose, Money, Months, Ratio, assertNever, money } from "@loanscope/domain";

/**
 * VA service / borrower context that affects funding-fee determination.
 * `priorUse` indicates a subsequent VA loan. The canonical IRRRL signal is
 * `LoanPurpose.IrrrlRefi`; for backward compatibility, the legacy signal
 * `LoanPurpose.RateTermRefi` + `priorUse: true` is also interpreted as an
 * IRRRL by `calculateVaFundingFee`.
 * `reserveOrGuard` is reserved for future tier differentiation; current schedules
 * unify it with the regular tier (per VA fee table effective 2023-04-07).
 */
export interface VaServiceContext {
  readonly priorUse: boolean;
  readonly disabilityExempt: boolean;
  readonly reserveOrGuard: boolean;
}

export interface FhaMipParams {
  readonly loanAmount: Money;
  readonly ltv: Ratio;
  readonly amortizationMonths: Months;
}

export interface VaFundingFeeParams {
  readonly loanAmount: Money;
  readonly ltv: Ratio;
  readonly serviceContext: VaServiceContext;
  readonly loanPurpose: LoanPurpose;
}

export interface UsdaFeeParams {
  readonly loanAmount: Money;
}

/* ------------------------------------------------------------------ */
/*  FHA                                                                */
/* ------------------------------------------------------------------ */

/** FHA Up-Front Mortgage Insurance Premium: 1.75% of base loan amount. */
const FHA_UFMIP_RATE = new Decimal("0.0175");

// FHA annual MIP schedule effective for case numbers assigned on or after
// 2023-03-20 (Mortgagee Letter 2023-05). Each constant is the annual premium
// as a fraction of the loan amount for its amortization-term / LTV tier.

/** FHA annual MIP, term <=15Y, LTV <=90%: 15 bps (ML 2023-05). */
const MIP_LE_15Y_LTV_LE_90 = new Decimal("0.0015");
/** FHA annual MIP, term <=15Y, LTV >90%: 40 bps (ML 2023-05). */
const MIP_LE_15Y_LTV_GT_90 = new Decimal("0.0040");
/** FHA annual MIP, term >15Y, LTV <=90%: 50 bps (ML 2023-05). */
const MIP_GT_15Y_LTV_LE_90 = new Decimal("0.0050");
/** FHA annual MIP, term >15Y, 90% < LTV <=95%: 50 bps (ML 2023-05). */
const MIP_GT_15Y_LTV_LE_95 = new Decimal("0.0050");
/** FHA annual MIP, term >15Y, LTV >95%: 55 bps (ML 2023-05). */
const MIP_GT_15Y_LTV_GT_95 = new Decimal("0.0055");

const fhaAnnualMipRate = (ltv: Ratio, amortizationMonths: Months): Decimal => {
  const ltvNum = Number(ltv);
  const isShortTerm = Number(amortizationMonths) <= 180;

  if (isShortTerm) {
    if (ltvNum <= 0.9) return MIP_LE_15Y_LTV_LE_90;
    return MIP_LE_15Y_LTV_GT_90;
  }
  if (ltvNum <= 0.9) return MIP_GT_15Y_LTV_LE_90;
  if (ltvNum <= 0.95) return MIP_GT_15Y_LTV_LE_95;
  return MIP_GT_15Y_LTV_GT_95;
};

export const calculateFhaUfmip = (params: FhaMipParams): Money => {
  const upfront = new Decimal(params.loanAmount).mul(FHA_UFMIP_RATE);
  return money(upfront.toNumber());
};

export const calculateFhaAnnualMipMonthly = (params: FhaMipParams): Money => {
  const rate = fhaAnnualMipRate(params.ltv, params.amortizationMonths);
  const annual = new Decimal(params.loanAmount).mul(rate);
  return money(annual.div(12).toNumber());
};

/* ------------------------------------------------------------------ */
/*  VA                                                                 */
/* ------------------------------------------------------------------ */

const VA_IRRRL_RATE = new Decimal("0.0050");

/**
 * Discriminator for the VA funding-fee "first use" vs "subsequent use" tier
 * split. Internal to `@loanscope/math#government-fees`; the public
 * `VaServiceContext.priorUse` boolean is translated into this at the
 * module boundary to keep the fee-dispatch logic self-documenting.
 */
type VAUseHistory = "FirstUse" | "Subsequent";

const useHistoryFromPriorUse = (priorUse: boolean): VAUseHistory =>
  priorUse ? "Subsequent" : "FirstUse";

/**
 * VA purchase funding-fee table effective 2023-04-07.
 * Returns the rate as a fraction of loan amount.
 */
const vaPurchaseRate = (ltv: Ratio, useHistory: VAUseHistory): Decimal => {
  const ltvNum = Number(ltv);
  if (useHistory === "FirstUse") {
    if (ltvNum <= 0.9) return new Decimal("0.0125");
    if (ltvNum <= 0.95) return new Decimal("0.0150");
    return new Decimal("0.0215");
  }
  if (ltvNum <= 0.9) return new Decimal("0.0125");
  if (ltvNum <= 0.95) return new Decimal("0.0150");
  return new Decimal("0.0330");
};

/** Cash-out and (non-IRRRL) rate-term refi share the same VA fee schedule. */
const vaRefiRate = (useHistory: VAUseHistory): Decimal =>
  useHistory === "Subsequent" ? new Decimal("0.0330") : new Decimal("0.0215");

const vaFundingFeeRate = (
  loanPurpose: LoanPurpose,
  ltv: Ratio,
  serviceContext: VaServiceContext,
): Decimal => {
  switch (loanPurpose) {
    case LoanPurpose.Purchase:
      return vaPurchaseRate(ltv, useHistoryFromPriorUse(serviceContext.priorUse));
    case LoanPurpose.IrrrlRefi:
      // First-class IRRRL signal. Fixed 0.5% regardless of LTV / priorUse.
      return VA_IRRRL_RATE;
    case LoanPurpose.RateTermRefi:
      // Legacy IRRRL signal: RateTermRefi + priorUse=true. Preserved for
      // backward compatibility with scenarios authored before
      // LoanPurpose.IrrrlRefi existed. New scenarios should prefer the
      // explicit IrrrlRefi enum value.
      if (serviceContext.priorUse) return VA_IRRRL_RATE;
      return vaRefiRate(useHistoryFromPriorUse(serviceContext.priorUse));
    case LoanPurpose.CashOutRefi:
      return vaRefiRate(useHistoryFromPriorUse(serviceContext.priorUse));
    default:
      return assertNever(loanPurpose);
  }
};

export const calculateVaFundingFee = (params: VaFundingFeeParams): Money => {
  if (params.serviceContext.disabilityExempt) {
    return money(0);
  }
  const rate = vaFundingFeeRate(params.loanPurpose, params.ltv, params.serviceContext);
  const fee = new Decimal(params.loanAmount).mul(rate);
  return money(fee.toNumber());
};

/* ------------------------------------------------------------------ */
/*  USDA                                                               */
/* ------------------------------------------------------------------ */

const USDA_UPFRONT_RATE = new Decimal("0.0100");
const USDA_ANNUAL_RATE = new Decimal("0.0035");

export const calculateUsdaUpfrontGuaranteeFee = (params: UsdaFeeParams): Money => {
  const fee = new Decimal(params.loanAmount).mul(USDA_UPFRONT_RATE);
  return money(fee.toNumber());
};

export const calculateUsdaAnnualFeeMonthly = (params: UsdaFeeParams): Money => {
  const annual = new Decimal(params.loanAmount).mul(USDA_ANNUAL_RATE);
  return money(annual.div(12).toNumber());
};
