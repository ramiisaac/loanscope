import type { EdgeDefinition } from "@loanscope/graph";
import { CheckSeverity, CheckStatus } from "@loanscope/domain";
import { toArray, toNumber } from "../coercions";
import { blocked, fail, pass } from "./build-check";

/* ---- Units ---- */

export const unitsCheckEdge: EdgeDefinition = {
  id: "units-check",
  kind: "check",
  inputs: ["units", "unitsAllowed"],
  outputs: ["unitsCheck"],
  confidence: "derived",
  metadata: { category: "check", severity: "blocker" },
  compute: (inputs) => {
    if (inputs.unitsAllowed === undefined) {
      return { unitsCheck: blocked("Units", "unitsAllowed") };
    }
    const units = toNumber(inputs.units, "units");
    const allowed = toArray<number>(inputs.unitsAllowed, "unitsAllowed");
    const status = allowed.includes(units) ? CheckStatus.PASS : CheckStatus.FAIL;
    return {
      unitsCheck:
        status === CheckStatus.PASS
          ? pass("Units", CheckSeverity.Blocker, `${units}`, allowed.join(","), "Units allowed")
          : fail(
              "Units",
              CheckSeverity.Blocker,
              `${units}`,
              allowed.join(","),
              "Units not allowed",
            ),
    };
  },
};
