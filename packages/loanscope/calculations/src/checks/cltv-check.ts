import type { EdgeDefinition } from "@loanscope/graph";
import { CheckSeverity, CheckStatus } from "@loanscope/domain";
import { calculateLTVMargin } from "../margins";
import { toMoney, toRatio } from "../coercions";
import { blocked, fail, fmtPct, pass } from "./build-check";

/* ---- CLTV (fixed: loanAmount + propertyValue now declared) ---- */

export const cltvCheckEdge: EdgeDefinition = {
  id: "cltv-check",
  kind: "check",
  inputs: ["cltv", "maxCLTVRatio", "loanAmount", "propertyValue"],
  outputs: ["cltvCheck"],
  confidence: "derived",
  metadata: { category: "check", severity: "blocker" },
  compute: (inputs) => {
    if (inputs.maxCLTVRatio === undefined) {
      return { cltvCheck: blocked("CLTV", "maxCLTVRatio") };
    }
    const actual = toRatio(inputs.cltv, "cltv");
    const limit = toRatio(inputs.maxCLTVRatio, "maxCLTVRatio");
    const margin = calculateLTVMargin(
      actual,
      limit,
      toMoney(inputs.loanAmount, "loanAmount"),
      toMoney(inputs.propertyValue, "propertyValue"),
    );
    const status = actual <= limit ? CheckStatus.PASS : CheckStatus.FAIL;
    return {
      cltvCheck:
        status === CheckStatus.PASS
          ? pass(
              "CLTV",
              CheckSeverity.Blocker,
              fmtPct(actual),
              fmtPct(limit),
              "CLTV within limit",
              margin,
            )
          : fail(
              "CLTV",
              CheckSeverity.Blocker,
              fmtPct(actual),
              fmtPct(limit),
              "CLTV exceeds limit",
              margin,
            ),
    };
  },
};
