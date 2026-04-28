import type { EdgeDefinition } from "@loanscope/graph";
import type { Money } from "@loanscope/domain";
import { CheckSeverity } from "@loanscope/domain";
import { toMoney } from "../coercions";
import { degraded, pass, warn } from "./build-check";

/* ---- Appraisal (warning severity -- degrades on missing context) ---- */

export const appraisalCheckEdge: EdgeDefinition = {
  id: "appraisal-check",
  kind: "check",
  inputs: ["loanAmount", "appraisalRules"],
  outputs: ["appraisalCheck"],
  confidence: "derived",
  metadata: { category: "check", severity: "warning" },
  compute: (inputs) => {
    const loanAmount = toMoney(inputs.loanAmount, "loanAmount");
    const rules = inputs.appraisalRules as
      | {
          waiverAllowed?: boolean;
          tiers?: Array<{
            loanAmountThreshold: Money;
            appraisalsRequired: 1 | 2;
            separateAppraisers?: boolean;
          }>;
        }
      | undefined;
    if (!rules) {
      return {
        appraisalCheck: degraded("Appraisal", CheckSeverity.Warning, "appraisalRules"),
      };
    }
    if (rules.waiverAllowed && (!rules.tiers || rules.tiers.length === 0)) {
      return {
        appraisalCheck: pass(
          "Appraisal",
          CheckSeverity.Warning,
          "Waiver allowed",
          "",
          "Appraisal waiver allowed",
        ),
      };
    }
    const tiers = rules.tiers ?? [];
    let required: 1 | 2 = 1;
    for (const tier of tiers) {
      if (loanAmount >= tier.loanAmountThreshold) {
        required = tier.appraisalsRequired;
      }
    }
    const separate = tiers.find(
      (tier) => loanAmount >= tier.loanAmountThreshold,
    )?.separateAppraisers;
    const detail = `${required} appraisal${required === 1 ? "" : "s"}${separate ? " (separate appraisers)" : ""}`;
    return {
      appraisalCheck: warn("Appraisal", CheckSeverity.Warning, detail, "", "Appraisal required"),
    };
  },
};
