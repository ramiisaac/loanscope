import type { EdgeDefinition } from "@loanscope/graph";
import { CheckSeverity, CheckStatus } from "@loanscope/domain";
import { toArray, toString } from "../coercions";
import { blocked, fail, pass } from "./build-check";
/* ---- Occupancy ---- */

export const occupancyCheckEdge: EdgeDefinition = {
  id: "occupancy-check",
  kind: "check",
  inputs: ["occupancy", "allowedOccupancies"],
  outputs: ["occupancyCheck"],
  confidence: "derived",
  metadata: { category: "check", severity: "blocker" },
  compute: (inputs) => {
    if (inputs.allowedOccupancies === undefined) {
      return { occupancyCheck: blocked("Occupancy", "allowedOccupancies") };
    }
    const occupancy = toString(inputs.occupancy, "occupancy");
    const allowed = toArray<string>(inputs.allowedOccupancies, "allowedOccupancies");
    const status = allowed.includes(occupancy) ? CheckStatus.PASS : CheckStatus.FAIL;
    return {
      occupancyCheck:
        status === CheckStatus.PASS
          ? pass(
              "Occupancy",
              CheckSeverity.Blocker,
              occupancy,
              allowed.join(","),
              "Occupancy allowed",
            )
          : fail(
              "Occupancy",
              CheckSeverity.Blocker,
              occupancy,
              allowed.join(","),
              "Occupancy not allowed",
            ),
    };
  },
};
