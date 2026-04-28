import type { CheckMargin } from "@loanscope/domain";
import type { Money } from "@loanscope/domain";
import { ActionKind } from "@loanscope/domain";
import Decimal from "decimal.js";

/** Compute the money delta a borrower must add to meet reserve requirements. */
export const calculateReservesMargin = (available: Money, required: Money): CheckMargin => {
  const delta = Decimal.max(0, new Decimal(required).minus(new Decimal(available)));
  const margin: CheckMargin = {
    kind: "Money",
    deltaToPass: delta.toNumber(),
  };
  if (delta.gt(0)) {
    margin.actionHint = ActionKind.AddReserves;
  }
  return margin;
};
