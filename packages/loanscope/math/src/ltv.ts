import Decimal from "decimal.js";
import type { Money, Ratio } from "@loanscope/domain";
import { money, ratio } from "@loanscope/domain";

/** Validates that a money value is non-negative and finite. */
const requireNonNegativeMoney = (value: Money, label: string): void => {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${label} must be finite, got ${value}`);
  }
  if (value < 0) {
    throw new RangeError(`${label} must be non-negative, got ${value}`);
  }
};

/** Validates that property value is positive (non-zero, non-negative, finite). */
const requirePositivePropertyValue = (propertyValue: Money): void => {
  if (!Number.isFinite(propertyValue)) {
    throw new RangeError(`propertyValue must be finite, got ${propertyValue}`);
  }
  if (propertyValue <= 0) {
    throw new RangeError(`propertyValue must be positive, got ${propertyValue}`);
  }
};

export const calculateLTV = (loanAmount: Money, propertyValue: Money): Ratio => {
  requireNonNegativeMoney(loanAmount, "loanAmount");
  requirePositivePropertyValue(propertyValue);
  const result = new Decimal(loanAmount).div(propertyValue);
  return ratio(result.toNumber());
};

export const calculateCLTV = (
  loanAmount: Money,
  subordinateLiens: Money[],
  propertyValue: Money,
): Ratio => {
  requireNonNegativeMoney(loanAmount, "loanAmount");
  requirePositivePropertyValue(propertyValue);
  for (let i = 0; i < subordinateLiens.length; i++) {
    const lien = subordinateLiens[i]!;
    requireNonNegativeMoney(lien, `subordinateLiens[${i}]`);
  }
  const totalLien = subordinateLiens.reduce((sum, lien) => sum.plus(lien), new Decimal(loanAmount));
  return ratio(totalLien.div(propertyValue).toNumber());
};

export const ltvToLoanAmount = (ltv: Ratio, propertyValue: Money): Money => {
  requirePositivePropertyValue(propertyValue);
  const result = new Decimal(propertyValue).mul(ltv);
  return money(result.toNumber());
};

export const loanPaydownForTargetLTV = (
  currentLoan: Money,
  propertyValue: Money,
  targetLTV: Ratio,
): Money => {
  requireNonNegativeMoney(currentLoan, "currentLoan");
  requirePositivePropertyValue(propertyValue);
  const targetLoan = new Decimal(propertyValue).mul(targetLTV);
  const paydown = new Decimal(currentLoan).minus(targetLoan);
  return money(Decimal.max(0, paydown).toNumber());
};

export const downPaymentFromLTV = (propertyValue: Money, ltv: Ratio): Money => {
  requirePositivePropertyValue(propertyValue);
  const loan = new Decimal(propertyValue).mul(ltv);
  const down = new Decimal(propertyValue).minus(loan);
  return money(down.toNumber());
};
