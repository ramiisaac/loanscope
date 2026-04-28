import type { EdgeDefinition } from "@loanscope/graph";
import {
  BuydownPayer,
  BuydownType,
  CheckSeverity,
  LoanPurpose,
  Occupancy,
} from "@loanscope/domain";
import { toString } from "../coercions";
import { fail, pass } from "./build-check";

/* ---- Buydown ---- */

export const buydownCheckEdge: EdgeDefinition = {
  id: "buydown-check",
  kind: "check",
  inputs: ["buydown", "buydownRules", "occupancy", "loanPurpose"],
  outputs: ["buydownCheck"],
  confidence: "derived",
  metadata: { category: "check", severity: "blocker" },
  compute: (inputs) => {
    const buydown = inputs.buydown as { type?: BuydownType; payer?: BuydownPayer } | undefined;
    const rules = inputs.buydownRules as
      | {
          allowed?: boolean;
          allowedTypes?: BuydownType[];
          allowedPayers?: BuydownPayer[];
          primaryOnly?: boolean;
          purchaseOnly?: boolean;
        }
      | undefined;
    if (!buydown || buydown.type === BuydownType.None) {
      return {
        buydownCheck: pass("Buydown", CheckSeverity.Blocker, "None", "", "No buydown"),
      };
    }
    if (rules?.allowed === false) {
      return {
        buydownCheck: fail(
          "Buydown",
          CheckSeverity.Blocker,
          "Disallowed",
          "",
          "Buydown not allowed",
        ),
      };
    }
    if (rules?.allowedTypes && !rules.allowedTypes.includes(buydown.type ?? BuydownType.None)) {
      return {
        buydownCheck: fail(
          "Buydown",
          CheckSeverity.Blocker,
          "Type",
          "",
          "Buydown type not allowed",
        ),
      };
    }
    if (rules?.allowedPayers && buydown.payer && !rules.allowedPayers.includes(buydown.payer)) {
      return {
        buydownCheck: fail(
          "Buydown",
          CheckSeverity.Blocker,
          "Payer",
          "",
          "Buydown payer not allowed",
        ),
      };
    }
    if (rules?.primaryOnly === true) {
      const occupancy = toString(inputs.occupancy, "occupancy");
      if (occupancy !== Occupancy.Primary) {
        return {
          buydownCheck: fail(
            "Buydown",
            CheckSeverity.Blocker,
            occupancy,
            Occupancy.Primary,
            "Buydown only available for primary occupancy",
          ),
        };
      }
    }
    if (rules?.purchaseOnly === true) {
      const loanPurpose = toString(inputs.loanPurpose, "loanPurpose");
      if (loanPurpose !== LoanPurpose.Purchase) {
        return {
          buydownCheck: fail(
            "Buydown",
            CheckSeverity.Blocker,
            loanPurpose,
            LoanPurpose.Purchase,
            "Buydown only available for purchase transactions",
          ),
        };
      }
    }
    return {
      buydownCheck: pass("Buydown", CheckSeverity.Blocker, "OK", "", "Buydown allowed"),
    };
  },
};
