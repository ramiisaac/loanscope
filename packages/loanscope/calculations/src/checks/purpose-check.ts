import type { EdgeDefinition } from "@loanscope/graph";
import { CheckSeverity, CheckStatus } from "@loanscope/domain";
import { toArray, toString } from "../coercions";
import { blocked, fail, pass } from "./build-check";

/* ---- Purpose ---- */

export const purposeCheckEdge: EdgeDefinition = {
  id: "purpose-check",
  kind: "check",
  inputs: ["loanPurpose", "allowedPurposes"],
  outputs: ["purposeCheck"],
  confidence: "derived",
  metadata: { category: "check", severity: "blocker" },
  compute: (inputs) => {
    if (inputs.allowedPurposes === undefined) {
      return { purposeCheck: blocked("Purpose", "allowedPurposes") };
    }
    const purpose = toString(inputs.loanPurpose, "loanPurpose");
    const allowed = toArray<string>(inputs.allowedPurposes, "allowedPurposes");
    const status = allowed.includes(purpose) ? CheckStatus.PASS : CheckStatus.FAIL;
    return {
      purposeCheck:
        status === CheckStatus.PASS
          ? pass("Purpose", CheckSeverity.Blocker, purpose, allowed.join(","), "Purpose allowed")
          : fail(
              "Purpose",
              CheckSeverity.Blocker,
              purpose,
              allowed.join(","),
              "Purpose not allowed",
            ),
    };
  },
};
