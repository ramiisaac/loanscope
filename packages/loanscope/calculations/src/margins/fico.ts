import type { CheckMargin } from "@loanscope/domain";
import { ActionKind } from "@loanscope/domain";

/** Compute the FICO point delta between actual score and the required minimum. */
export const calculateFicoMargin = (actual: number, min: number): CheckMargin => {
  const delta = Math.max(0, min - actual);
  const margin: CheckMargin = {
    kind: "Ratio",
    deltaToPass: delta,
  };
  if (delta > 0) {
    margin.actionHint = ActionKind.IncludeBorrowers;
  }
  return margin;
};
