import type { EdgeDefinition } from "@loanscope/graph";
import { estimateClosingCosts } from "@loanscope/math";
import { toMoney, toOptionalString } from "../coercions";

export const estimateClosingCostsEdge: EdgeDefinition = {
  id: "estimate-closing-costs",
  kind: "estimate",
  inputs: ["loanAmount", "stateCode"],
  outputs: ["closingCosts"],
  confidence: "estimated",
  compute: (inputs) => ({
    closingCosts: estimateClosingCosts(
      toMoney(inputs.loanAmount, "loanAmount"),
      toOptionalString(inputs.stateCode),
    ),
  }),
};
