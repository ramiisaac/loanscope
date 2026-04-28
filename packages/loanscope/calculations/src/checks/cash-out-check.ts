import type { EdgeDefinition } from "@loanscope/graph";
import type { Money } from "@loanscope/domain";
import { CheckSeverity } from "@loanscope/domain";
import { fail, pass } from "./build-check";

/* ---- Cash Out (removed stale cltv from inputs) ---- */

export const cashOutCheckEdge: EdgeDefinition = {
  id: "cashout-check",
  kind: "check",
  inputs: ["cashOut", "cashOutConstraints"],
  outputs: ["cashOutCheck"],
  confidence: "derived",
  metadata: { category: "check", severity: "blocker" },
  compute: (inputs) => {
    const cashOut = inputs.cashOut as
      | {
          requestedAmount?: Money;
          seasoningMonths?: number;
          listedForSaleRecently?: boolean;
        }
      | undefined;
    const constraints = inputs.cashOutConstraints as
      | {
          seasoningMonths?: number;
          listedForSaleRestriction?: boolean;
        }
      | undefined;
    if (!cashOut) {
      return {
        cashOutCheck: pass("CashOut", CheckSeverity.Blocker, "N/A", "", "Not a cash-out loan"),
      };
    }
    if (constraints?.listedForSaleRestriction && cashOut.listedForSaleRecently) {
      return {
        cashOutCheck: fail(
          "CashOut",
          CheckSeverity.Blocker,
          "Listed",
          "",
          "Recently listed for sale",
        ),
      };
    }
    if (
      constraints?.seasoningMonths !== undefined &&
      cashOut.seasoningMonths !== undefined &&
      cashOut.seasoningMonths < constraints.seasoningMonths
    ) {
      return {
        cashOutCheck: fail(
          "CashOut",
          CheckSeverity.Blocker,
          `${cashOut.seasoningMonths} months`,
          `${constraints.seasoningMonths} months`,
          `Seasoning ${cashOut.seasoningMonths} months is below required ${constraints.seasoningMonths} months`,
        ),
      };
    }
    return {
      cashOutCheck: pass("CashOut", CheckSeverity.Blocker, "OK", "", "Cash-out conditions met"),
    };
  },
};
