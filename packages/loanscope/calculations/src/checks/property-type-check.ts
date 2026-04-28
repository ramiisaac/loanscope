import type { EdgeDefinition } from "@loanscope/graph";
import { CheckSeverity, CheckStatus } from "@loanscope/domain";
import { toArray, toString } from "../coercions";
import { blocked, fail, pass } from "./build-check";

/* ---- Property Type ---- */

export const propertyTypeCheckEdge: EdgeDefinition = {
  id: "property-type-check",
  kind: "check",
  inputs: ["propertyType", "allowedPropertyTypes"],
  outputs: ["propertyTypeCheck"],
  confidence: "derived",
  metadata: { category: "check", severity: "blocker" },
  compute: (inputs) => {
    if (inputs.allowedPropertyTypes === undefined) {
      return {
        propertyTypeCheck: blocked("PropertyType", "allowedPropertyTypes"),
      };
    }
    const propertyType = toString(inputs.propertyType, "propertyType");
    const allowed = toArray<string>(inputs.allowedPropertyTypes, "allowedPropertyTypes");
    const status = allowed.includes(propertyType) ? CheckStatus.PASS : CheckStatus.FAIL;
    return {
      propertyTypeCheck:
        status === CheckStatus.PASS
          ? pass(
              "PropertyType",
              CheckSeverity.Blocker,
              propertyType,
              allowed.join(","),
              "Property type allowed",
            )
          : fail(
              "PropertyType",
              CheckSeverity.Blocker,
              propertyType,
              allowed.join(","),
              "Property type not allowed",
            ),
    };
  },
};
