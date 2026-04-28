import type { EdgeDefinition } from "@loanscope/graph";
import { CheckSeverity, CheckStatus } from "@loanscope/domain";
import { calculateFicoMargin } from "../margins";
import { toNumber } from "../coercions";
import { blocked, fail, pass } from "./build-check";

/* ---- FICO ---- */

export const ficoCheckEdge: EdgeDefinition = {
  id: "fico-check",
  kind: "check",
  inputs: ["blendedFico", "minFico"],
  outputs: ["ficoCheck"],
  confidence: "derived",
  metadata: { category: "check", severity: "blocker" },
  compute: (inputs) => {
    if (inputs.minFico === undefined) {
      return { ficoCheck: blocked("FICO", "minFico") };
    }
    const actual = toNumber(inputs.blendedFico, "blendedFico");
    const min = toNumber(inputs.minFico, "minFico");
    const margin = calculateFicoMargin(actual, min);
    const status = actual >= min ? CheckStatus.PASS : CheckStatus.FAIL;
    return {
      ficoCheck:
        status === CheckStatus.PASS
          ? pass("FICO", CheckSeverity.Blocker, `${actual}`, `${min}`, "FICO meets minimum", margin)
          : fail(
              "FICO",
              CheckSeverity.Blocker,
              `${actual}`,
              `${min}`,
              "FICO below minimum",
              margin,
            ),
    };
  },
};
