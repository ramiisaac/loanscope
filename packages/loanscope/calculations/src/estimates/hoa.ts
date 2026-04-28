import type { EdgeDefinition } from "@loanscope/graph";
import { estimateHoa } from "@loanscope/math";
import { PropertyType } from "@loanscope/domain";
import { toOptionalString } from "../coercions";

export const estimateHoaEdge: EdgeDefinition = {
  id: "estimate-hoa",
  kind: "estimate",
  inputs: ["propertyType", "stateCode"],
  outputs: ["hoa"],
  confidence: "estimated",
  compute: (inputs) => ({
    hoa: estimateHoa(
      (toOptionalString(inputs.propertyType) as PropertyType) ?? PropertyType.SFR,
      toOptionalString(inputs.stateCode),
    ),
  }),
};
