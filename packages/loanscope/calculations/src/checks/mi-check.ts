import type { EdgeDefinition } from "@loanscope/graph";
import type { Ratio } from "@loanscope/domain";
import { CheckSeverity, MiType } from "@loanscope/domain";
import { toRatio } from "../coercions";
import { fail, pass } from "./build-check";

/* ---- MI ---- */

export const miCheckEdge: EdgeDefinition = {
  id: "mi-check",
  kind: "check",
  inputs: ["ltv", "miSelection", "miRules"],
  outputs: ["miCheck"],
  confidence: "derived",
  metadata: { category: "check", severity: "blocker" },
  compute: (inputs) => {
    const ltv = toRatio(inputs.ltv, "ltv");
    const selection = inputs.miSelection as { type?: MiType } | undefined;
    const rules = inputs.miRules as
      | {
          required?: boolean;
          waivedAboveLtvRatio?: Ratio;
          allowedTypes?: MiType[];
        }
      | undefined;
    if (rules?.required && selection?.type === MiType.None) {
      return {
        miCheck: fail("MI", CheckSeverity.Blocker, "None", "", "MI required"),
      };
    }
    if (rules?.allowedTypes && selection?.type && !rules.allowedTypes.includes(selection.type)) {
      return {
        miCheck: fail("MI", CheckSeverity.Blocker, selection.type, "", "MI type not allowed"),
      };
    }
    if (rules?.waivedAboveLtvRatio && ltv <= rules.waivedAboveLtvRatio) {
      return {
        miCheck: pass("MI", CheckSeverity.Blocker, "Waived", "", "MI waived"),
      };
    }
    return {
      miCheck: pass(
        "MI",
        CheckSeverity.Blocker,
        selection?.type ?? MiType.None,
        "",
        "MI acceptable",
      ),
    };
  },
};
