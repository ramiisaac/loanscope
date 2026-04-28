import type { CheckMargin } from "@loanscope/domain";
import type { Ratio, Money } from "@loanscope/domain";
import { ActionKind } from "@loanscope/domain";
import Decimal from "decimal.js";

/** Compute the money delta a borrower must pay down to bring LTV within limit. */
export const calculateLTVMargin = (
  actual: Ratio,
  limit: Ratio,
  loanAmount: Money,
  propertyValue: Money,
): CheckMargin => {
  const maxLoan = new Decimal(limit).times(new Decimal(propertyValue));
  const deltaMoney = Decimal.max(0, new Decimal(loanAmount).minus(maxLoan));
  const margin: CheckMargin = {
    kind: "Money",
    deltaToPass: deltaMoney.toNumber(),
  };
  if (deltaMoney.gt(0)) {
    margin.actionHint = ActionKind.PayDownLoan;
  }
  return margin;
};
