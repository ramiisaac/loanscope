import Decimal from "decimal.js";
import { ClosingCosts, Money, money } from "@loanscope/domain";

/**
 * Funds to close = down payment + estimated closing costs.
 * Throws on non-finite or negative inputs.
 */
export const computeFundsToClose = (downPayment: Money, closingCosts: ClosingCosts): Money => {
  if (!Number.isFinite(downPayment) || !Number.isFinite(closingCosts.estimatedTotal)) {
    throw new RangeError("Funds-to-close inputs must be finite");
  }
  if (downPayment < 0) {
    throw new RangeError(`downPayment must be non-negative, got ${downPayment}`);
  }
  if (closingCosts.estimatedTotal < 0) {
    throw new RangeError(
      `closingCosts.estimatedTotal must be non-negative, got ${closingCosts.estimatedTotal}`,
    );
  }
  const total = new Decimal(downPayment).plus(closingCosts.estimatedTotal);
  return money(total.toNumber());
};

/**
 * Total cash required = funds to close + payoffs.
 * Throws on non-finite or negative inputs.
 */
export const computeTotalCashRequired = (fundsToClose: Money, payoffs: Money): Money => {
  if (!Number.isFinite(fundsToClose) || !Number.isFinite(payoffs)) {
    throw new RangeError("Total-cash-required inputs must be finite");
  }
  if (fundsToClose < 0) {
    throw new RangeError(`fundsToClose must be non-negative, got ${fundsToClose}`);
  }
  if (payoffs < 0) {
    throw new RangeError(`payoffs must be non-negative, got ${payoffs}`);
  }
  return money(new Decimal(fundsToClose).plus(payoffs).toNumber());
};
