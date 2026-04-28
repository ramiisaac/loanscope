import type { EdgeDefinition } from "@loanscope/graph";
import { estimateMI } from "@loanscope/math";
import { toMoney, toNumber, toRatio } from "../coercions";

export const estimateMiEdge: EdgeDefinition = {
  id: "estimate-mi",
  kind: "estimate",
  inputs: ["ltv", "blendedFico", "loanAmount"],
  outputs: ["mi"],
  confidence: "estimated",
  compute: (inputs) => ({
    mi: estimateMI(
      toRatio(inputs.ltv, "ltv"),
      toNumber(inputs.blendedFico, "blendedFico"),
      toMoney(inputs.loanAmount, "loanAmount"),
    ),
  }),
};
