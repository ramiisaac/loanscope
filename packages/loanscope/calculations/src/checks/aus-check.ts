import type { EdgeDefinition } from "@loanscope/graph";
import { AusFinding, CheckSeverity, CheckStatus } from "@loanscope/domain";
import { fail, pass } from "./build-check";

/* ---- AUS ---- */

export const ausCheckEdge: EdgeDefinition = {
  id: "aus-check",
  kind: "check",
  inputs: ["ausFindings", "ausRules"],
  outputs: ["ausCheck"],
  confidence: "derived",
  metadata: { category: "check", severity: "blocker" },
  compute: (inputs) => {
    const findings = inputs.ausFindings as { finding?: AusFinding } | undefined;
    const rules = inputs.ausRules as { requiredFindings?: AusFinding[] } | undefined;
    if (!rules?.requiredFindings || rules.requiredFindings.length === 0) {
      return {
        ausCheck: pass("AUS", CheckSeverity.Blocker, "N/A", "", "AUS not required"),
      };
    }
    const status =
      findings?.finding && rules.requiredFindings.includes(findings.finding)
        ? CheckStatus.PASS
        : CheckStatus.FAIL;
    return {
      ausCheck:
        status === CheckStatus.PASS
          ? pass(
              "AUS",
              CheckSeverity.Blocker,
              findings?.finding,
              rules.requiredFindings.join(","),
              "AUS acceptable",
            )
          : fail(
              "AUS",
              CheckSeverity.Blocker,
              findings?.finding ?? "None",
              rules.requiredFindings.join(","),
              "AUS finding not acceptable",
            ),
    };
  },
};
