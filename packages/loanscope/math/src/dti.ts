import Decimal from "decimal.js";
import type { Money, Ratio } from "@loanscope/domain";
import { money, ratio } from "@loanscope/domain";

/**
 * Calculates debt-to-income ratio.
 * Returns null when income is zero but obligations are positive (DTI is not computable).
 * Returns ratio(0) when both are zero (no debt, no income).
 */
export const calculateDTI = (
  totalMonthlyObligations: Money,
  qualifyingIncome: Money,
): Ratio | null => {
  if (!Number.isFinite(totalMonthlyObligations) || !Number.isFinite(qualifyingIncome)) {
    throw new RangeError("DTI inputs must be finite");
  }
  if (totalMonthlyObligations < 0) {
    throw new RangeError(
      `totalMonthlyObligations must be non-negative, got ${totalMonthlyObligations}`,
    );
  }
  if (qualifyingIncome < 0) {
    throw new RangeError(`qualifyingIncome must be non-negative, got ${qualifyingIncome}`);
  }
  if (qualifyingIncome === 0) {
    return totalMonthlyObligations > 0 ? null : ratio(0);
  }
  const result = new Decimal(totalMonthlyObligations).div(qualifyingIncome);
  return ratio(result.toNumber());
};

/** Maximum housing payment allowed given a target DTI, income, and existing debts. */
export const maxPaymentForDTI = (targetDTI: Ratio, income: Money, existingDebts: Money): Money => {
  const maxTotal = new Decimal(income).mul(targetDTI);
  const available = maxTotal.minus(existingDebts);
  return money(Decimal.max(0, available).toNumber());
};

/** Debt reduction needed to reach a target DTI. */
export const debtReductionForTargetDTI = (
  currentObligations: Money,
  income: Money,
  targetDTI: Ratio,
): Money => {
  const maxTotal = new Decimal(income).mul(targetDTI);
  const reduction = new Decimal(currentObligations).minus(maxTotal);
  return money(Decimal.max(0, reduction).toNumber());
};

/**
 * Income required to achieve a target DTI for given obligations.
 * Throws when targetDTI is 0 -- infinite income would be needed.
 */
export const incomeRequiredForDTI = (obligations: Money, targetDTI: Ratio): Money => {
  if (targetDTI === 0) {
    throw new RangeError("targetDTI must be positive; a DTI of 0 requires infinite income");
  }
  const required = new Decimal(obligations).div(targetDTI);
  return money(required.toNumber());
};
