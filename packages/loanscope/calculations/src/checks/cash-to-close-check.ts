import type { EdgeDefinition } from "@loanscope/graph";
import type { Money } from "@loanscope/domain";
import { CheckSeverity, CheckStatus } from "@loanscope/domain";
import { fail, pass } from "./build-check";

/* ---- Cash To Close ---- */

export const cashToCloseCheckEdge: EdgeDefinition = {
  id: "cash-to-close-check",
  kind: "check",
  inputs: ["assetAllocation"],
  outputs: ["cashToCloseCheck"],
  confidence: "derived",
  metadata: { category: "check", severity: "blocker" },
  compute: (inputs) => {
    const allocation = inputs.assetAllocation as {
      shortfall?: Money;
    };
    const status = allocation.shortfall ? CheckStatus.FAIL : CheckStatus.PASS;
    return {
      cashToCloseCheck:
        status === CheckStatus.PASS
          ? pass("CashToClose", CheckSeverity.Blocker, "OK", "", "Sufficient funds to close")
          : fail(
              "CashToClose",
              CheckSeverity.Blocker,
              "Shortfall",
              "",
              "Insufficient funds to close",
            ),
    };
  },
};
