import type { EdgeDefinition } from "@loanscope/graph";
import type { Money } from "@loanscope/domain";
import { CheckSeverity, CheckStatus } from "@loanscope/domain";
import { calculateReservesMargin } from "../margins";
import { toMoney } from "../coercions";
import { fail, pass } from "./build-check";

/* ---- Reserves ---- */

export const reservesCheckEdge: EdgeDefinition = {
  id: "reserves-check",
  kind: "check",
  inputs: ["assetAllocation", "requiredReservesDollars"],
  outputs: ["reservesCheck"],
  confidence: "derived",
  metadata: { category: "check", severity: "blocker" },
  compute: (inputs) => {
    const allocation = inputs.assetAllocation as {
      remainingReservesDollars: Money;
    };
    const required = toMoney(inputs.requiredReservesDollars, "requiredReservesDollars");
    const available = allocation.remainingReservesDollars;
    const margin = calculateReservesMargin(available, required);
    const status = available >= required ? CheckStatus.PASS : CheckStatus.FAIL;
    return {
      reservesCheck:
        status === CheckStatus.PASS
          ? pass(
              "Reserves",
              CheckSeverity.Blocker,
              `${available}`,
              `${required}`,
              "Reserves sufficient",
              margin,
            )
          : fail(
              "Reserves",
              CheckSeverity.Blocker,
              `${available}`,
              `${required}`,
              "Reserves insufficient",
              margin,
            ),
    };
  },
};
