import type { CheckMargin } from "@loanscope/domain";
import type { Ratio, Money } from "@loanscope/domain";
import { ActionKind } from "@loanscope/domain";
import Decimal from "decimal.js";

/** Compute the money delta a borrower must eliminate to bring DTI within limit. */
export const calculateDTIMargin = (actual: Ratio, limit: Ratio, income: Money): CheckMargin => {
  const deltaRatio = Decimal.max(0, new Decimal(actual).minus(new Decimal(limit)));
  const deltaMoney = deltaRatio.times(new Decimal(income));
  const margin: CheckMargin = {
    kind: "Money",
    deltaToPass: deltaMoney.toNumber(),
  };
  if (deltaMoney.gt(0)) {
    margin.actionHint = ActionKind.PayoffLiability;
  }
  return margin;
};
