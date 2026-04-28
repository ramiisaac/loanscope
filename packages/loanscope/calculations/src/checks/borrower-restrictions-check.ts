import type { EdgeDefinition } from "@loanscope/graph";
import type { Money } from "@loanscope/domain";
import { CheckSeverity } from "@loanscope/domain";
import { toArray } from "../coercions";
import { fail, pass } from "./build-check";

/* ---- Borrower Restrictions ---- */

export const borrowerRestrictionsCheckEdge: EdgeDefinition = {
  id: "borrower-restrictions-check",
  kind: "check",
  inputs: ["borrowers", "borrowerRestrictions"],
  outputs: ["borrowerRestrictionsCheck"],
  confidence: "derived",
  metadata: { category: "check", severity: "blocker" },
  compute: (inputs) => {
    const restrictions = inputs.borrowerRestrictions as
      | {
          nonOccupantAllowed?: boolean;
          fthbAllowed?: boolean;
          fthbPrimaryOnly?: boolean;
          fthbMaxLoan?: Money;
          fthbMinFico?: number;
        }
      | undefined;
    if (restrictions === undefined) {
      return {
        borrowerRestrictionsCheck: pass(
          "BorrowerRestrictions",
          CheckSeverity.Blocker,
          "OK",
          "",
          "No borrower restrictions defined",
        ),
      };
    }
    const borrowers = toArray<{
      isNonOccupantCoBorrower?: boolean;
      isFirstTimeHomebuyer?: boolean;
      fico: number;
    }>(inputs.borrowers, "borrowers");

    if (restrictions.nonOccupantAllowed === false) {
      const nonOcc = borrowers.some((b) => b.isNonOccupantCoBorrower);
      if (nonOcc) {
        return {
          borrowerRestrictionsCheck: fail(
            "BorrowerRestrictions",
            CheckSeverity.Blocker,
            "Non-occupant",
            "",
            "Non-occupant not allowed",
          ),
        };
      }
    }
    if (restrictions.fthbAllowed === false) {
      const fthb = borrowers.some((b) => b.isFirstTimeHomebuyer);
      if (fthb) {
        return {
          borrowerRestrictionsCheck: fail(
            "BorrowerRestrictions",
            CheckSeverity.Blocker,
            "FTHB",
            "",
            "FTHB not allowed",
          ),
        };
      }
    }
    if (restrictions.fthbMinFico) {
      const min = restrictions.fthbMinFico;
      const borrower = borrowers.find((b) => b.isFirstTimeHomebuyer);
      if (borrower && borrower.fico < min) {
        return {
          borrowerRestrictionsCheck: fail(
            "BorrowerRestrictions",
            CheckSeverity.Blocker,
            `${borrower.fico}`,
            `${min}`,
            "FTHB FICO below minimum",
          ),
        };
      }
    }
    return {
      borrowerRestrictionsCheck: pass(
        "BorrowerRestrictions",
        CheckSeverity.Blocker,
        "OK",
        "",
        "Borrower restrictions satisfied",
      ),
    };
  },
};
