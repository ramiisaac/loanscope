import Decimal from "decimal.js";
import { pmt } from "financial";
import type { Money, Months, RatePct } from "@loanscope/domain";
import { money } from "@loanscope/domain";

/**
 * Fixed-rate monthly payment (P&I).
 * When annualRatePct is 0, returns principal / months (zero-interest loan).
 * Throws on non-positive amortization months or non-finite inputs.
 */
export const calculatePMTFixed = (
  principal: Money,
  annualRatePct: RatePct,
  amortMonths: Months,
): Money => {
  if (
    !Number.isFinite(principal) ||
    !Number.isFinite(annualRatePct) ||
    !Number.isFinite(amortMonths)
  ) {
    throw new RangeError("PMT inputs must be finite");
  }
  if (principal < 0) {
    throw new RangeError(`principal must be non-negative, got ${principal}`);
  }
  if (amortMonths <= 0) {
    throw new RangeError(`amortMonths must be positive, got ${amortMonths}`);
  }

  if (annualRatePct === 0) {
    const payment = new Decimal(principal).div(amortMonths);
    return money(payment.toNumber());
  }

  const rate = new Decimal(annualRatePct).div(100).div(12).toNumber();
  const nper = Number(amortMonths);
  const pv = Number(principal);
  const payment = pmt(rate, nper, pv);
  return money(new Decimal(payment).abs().toNumber());
};

/** Monthly interest-only payment. */
export const calculateInterestOnlyPayment = (principal: Money, annualRatePct: RatePct): Money => {
  if (!Number.isFinite(principal) || !Number.isFinite(annualRatePct)) {
    throw new RangeError("Interest-only inputs must be finite");
  }
  if (principal < 0) {
    throw new RangeError(`principal must be non-negative, got ${principal}`);
  }
  const payment = new Decimal(principal).mul(annualRatePct).div(100).div(12);
  return money(payment.toNumber());
};

/**
 * Total interest paid over the life of the loan.
 * Clamped to 0 to prevent negative totals from rounding or overpayment scenarios.
 */
export const calculateTotalInterest = (
  principal: Money,
  monthlyPayment: Money,
  amortMonths: Months,
): Money => {
  if (
    !Number.isFinite(principal) ||
    !Number.isFinite(monthlyPayment) ||
    !Number.isFinite(amortMonths)
  ) {
    throw new RangeError("Total-interest inputs must be finite");
  }
  if (amortMonths <= 0) {
    throw new RangeError(`amortMonths must be positive, got ${amortMonths}`);
  }
  const totalPaid = new Decimal(monthlyPayment).mul(amortMonths);
  const interest = totalPaid.minus(principal);
  return money(Decimal.max(0, interest).toNumber());
};
