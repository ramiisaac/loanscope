import type { CheckMargin } from "@loanscope/domain";
import type { Money } from "@loanscope/domain";
import { ActionKind } from "@loanscope/domain";
import Decimal from "decimal.js";

/** Compute the money delta between actual loan amount and the violated bound. */
export const calculateLoanAmountMargin = (actual: Money, min?: Money, max?: Money): CheckMargin => {
  let delta = new Decimal(0);
  if (min !== undefined && actual < min) {
    delta = new Decimal(min).minus(new Decimal(actual));
  } else if (max !== undefined && actual > max) {
    delta = new Decimal(actual).minus(new Decimal(max));
  }
  const margin: CheckMargin = {
    kind: "Money",
    deltaToPass: delta.toNumber(),
  };
  if (delta.gt(0)) {
    margin.actionHint = ActionKind.PayDownLoan;
  }
  return margin;
};
