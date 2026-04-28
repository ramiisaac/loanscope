import type { EdgeDefinition } from "@loanscope/graph";
import { CheckSeverity, CheckStatus } from "@loanscope/domain";
import { toArray, toString } from "../coercions";
import { fail, pass } from "./build-check";

/* ---- State Restrictions ---- */

export const stateRestrictionsCheckEdge: EdgeDefinition = {
  id: "state-restrictions-check",
  kind: "check",
  inputs: ["stateCode", "stateIneligibility"],
  outputs: ["stateRestrictionsCheck"],
  confidence: "derived",
  metadata: { category: "check", severity: "blocker" },
  compute: (inputs) => {
    if (inputs.stateIneligibility === undefined) {
      return {
        stateRestrictionsCheck: pass(
          "State",
          CheckSeverity.Blocker,
          toString(inputs.stateCode, "stateCode"),
          "",
          "No state restrictions defined",
        ),
      };
    }
    const state = toString(inputs.stateCode, "stateCode");
    const ineligible = toArray<string>(inputs.stateIneligibility, "stateIneligibility");
    const status = ineligible.includes(state) ? CheckStatus.FAIL : CheckStatus.PASS;
    return {
      stateRestrictionsCheck:
        status === CheckStatus.PASS
          ? pass("State", CheckSeverity.Blocker, state, "", "State eligible")
          : fail("State", CheckSeverity.Blocker, state, "", "State ineligible"),
    };
  },
};
