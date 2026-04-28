import type { EdgeDefinition } from "@loanscope/graph";
import { CheckSeverity, CheckStatus } from "@loanscope/domain";
import { calculateDTIMargin } from "../margins";
import { toMoney, toRatio } from "../coercions";
import { blocked, fail, fmtPct, pass } from "./build-check";

/* ---- DTI ---- */

export const dtiCheckEdge: EdgeDefinition = {
  id: "dti-check",
  kind: "check",
  inputs: ["dti", "maxDTIRatio", "qualifyingIncomeMonthly"],
  outputs: ["dtiCheck"],
  confidence: "derived",
  metadata: { category: "check", severity: "blocker" },
  compute: (inputs) => {
    if (inputs.maxDTIRatio === undefined) {
      return { dtiCheck: blocked("DTI", "maxDTIRatio") };
    }
    const actual = toRatio(inputs.dti, "dti");
    const limit = toRatio(inputs.maxDTIRatio, "maxDTIRatio");
    const margin = calculateDTIMargin(
      actual,
      limit,
      toMoney(inputs.qualifyingIncomeMonthly, "qualifyingIncomeMonthly"),
    );
    const status = actual <= limit ? CheckStatus.PASS : CheckStatus.FAIL;
    return {
      dtiCheck:
        status === CheckStatus.PASS
          ? pass(
              "DTI",
              CheckSeverity.Blocker,
              fmtPct(actual),
              fmtPct(limit),
              "DTI within limit",
              margin,
            )
          : fail(
              "DTI",
              CheckSeverity.Blocker,
              fmtPct(actual),
              fmtPct(limit),
              "DTI exceeds limit",
              margin,
            ),
    };
  },
};
