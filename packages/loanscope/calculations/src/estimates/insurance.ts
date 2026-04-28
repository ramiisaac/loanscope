import type { EdgeDefinition } from "@loanscope/graph";
import { estimateInsurance } from "@loanscope/math";
import { PropertyType } from "@loanscope/domain";
import { toMoney, toOptionalString } from "../coercions";

export const estimateInsuranceEdge: EdgeDefinition = {
  id: "estimate-insurance",
  kind: "estimate",
  inputs: ["propertyValue", "propertyType"],
  outputs: ["insurance"],
  confidence: "estimated",
  compute: (inputs) => ({
    insurance: estimateInsurance(
      toMoney(inputs.propertyValue, "propertyValue"),
      toOptionalString(inputs.propertyType) as PropertyType | undefined,
    ),
  }),
};
