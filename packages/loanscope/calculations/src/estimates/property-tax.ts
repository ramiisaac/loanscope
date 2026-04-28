import type { EdgeDefinition } from "@loanscope/graph";
import { estimatePropertyTax } from "@loanscope/math";
import { toMoney, toOptionalString } from "../coercions";

export const estimatePropertyTaxEdge: EdgeDefinition = {
  id: "estimate-property-tax",
  kind: "estimate",
  inputs: ["propertyValue", "stateCode"],
  outputs: ["propertyTax"],
  confidence: "estimated",
  compute: (inputs) => ({
    propertyTax: estimatePropertyTax(
      toMoney(inputs.propertyValue, "propertyValue"),
      toOptionalString(inputs.stateCode),
    ),
  }),
};
