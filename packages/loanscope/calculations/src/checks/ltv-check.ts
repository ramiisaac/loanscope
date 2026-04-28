import type { EdgeDefinition } from "@loanscope/graph";
import type { Ratio } from "@loanscope/domain";
import { CheckSeverity, CheckStatus, LoanPurpose, Occupancy } from "@loanscope/domain";
import { calculateLTVMargin } from "../margins";
import { toMoney, toRatio, toString } from "../coercions";
import { blocked, fail, fmtPct, pass } from "./build-check";

/* ---- LTV ---- */

export const ltvCheckEdge: EdgeDefinition = {
  id: "ltv-check",
  kind: "check",
  inputs: [
    "ltv",
    "maxLTVRatio",
    "occupancy",
    "loanPurpose",
    "maxLtvByOccupancy",
    "maxLtvByPurpose",
    "loanAmount",
    "propertyValue",
  ],
  outputs: ["ltvCheck"],
  confidence: "derived",
  metadata: { category: "check", severity: "blocker" },
  compute: (inputs) => {
    const actual = toRatio(inputs.ltv, "ltv");
    const maxByOcc = inputs.maxLtvByOccupancy as Record<string, Ratio> | undefined;
    const maxByPurpose = inputs.maxLtvByPurpose as Record<string, Ratio> | undefined;
    const occupancy = toString(inputs.occupancy, "occupancy");
    const purpose = toString(inputs.loanPurpose, "loanPurpose");

    const resolvedLimit =
      maxByOcc?.[occupancy as Occupancy] ?? maxByPurpose?.[purpose as LoanPurpose] ?? undefined;

    if (resolvedLimit === undefined && inputs.maxLTVRatio === undefined) {
      return { ltvCheck: blocked("LTV", "maxLTVRatio") };
    }

    const limit = resolvedLimit ?? toRatio(inputs.maxLTVRatio, "maxLTVRatio");
    const margin = calculateLTVMargin(
      actual,
      limit,
      toMoney(inputs.loanAmount, "loanAmount"),
      toMoney(inputs.propertyValue, "propertyValue"),
    );
    const status = actual <= limit ? CheckStatus.PASS : CheckStatus.FAIL;
    return {
      ltvCheck:
        status === CheckStatus.PASS
          ? pass(
              "LTV",
              CheckSeverity.Blocker,
              fmtPct(actual),
              fmtPct(limit),
              "LTV within limit",
              margin,
            )
          : fail(
              "LTV",
              CheckSeverity.Blocker,
              fmtPct(actual),
              fmtPct(limit),
              "LTV exceeds limit",
              margin,
            ),
    };
  },
};
