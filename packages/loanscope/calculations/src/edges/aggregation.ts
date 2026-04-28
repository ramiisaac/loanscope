import type { EdgeDefinition } from "@loanscope/graph";
import { CheckStatus } from "@loanscope/domain";
import type { UnderwritingCheck } from "@loanscope/domain";

/** All check node IDs that feed into the allChecks aggregation. */
const CHECK_KEYS = [
  "ltvCheck",
  "cltvCheck",
  "dtiCheck",
  "ficoCheck",
  "loanAmountMinCheck",
  "loanAmountMaxCheck",
  "reservesCheck",
  "cashToCloseCheck",
  "occupancyCheck",
  "purposeCheck",
  "propertyTypeCheck",
  "unitsCheck",
  "borrowerRestrictionsCheck",
  "stateRestrictionsCheck",
  "cashOutCheck",
  "buydownCheck",
  "miCheck",
  "ausCheck",
  "appraisalCheck",
] as const;

export const aggregationEdges: EdgeDefinition[] = [
  {
    id: "aggregate-all-checks",
    kind: "transform",
    inputs: [...CHECK_KEYS],
    outputs: ["allChecks"],
    confidence: "derived",
    compute: (inputs) => {
      const checks: UnderwritingCheck[] = [];
      for (const key of CHECK_KEYS) {
        const value = inputs[key] as UnderwritingCheck | undefined;
        if (value) {
          checks.push(value);
        }
      }
      return { allChecks: checks };
    },
  },
  {
    id: "derive-eligibility",
    kind: "transform",
    inputs: ["allChecks"],
    outputs: ["eligibility"],
    confidence: "derived",
    compute: (inputs) => {
      const checks = inputs.allChecks as UnderwritingCheck[] | undefined;
      if (!checks || checks.length === 0) {
        return { eligibility: false };
      }
      const eligible = checks.every(
        (c) => c.status === CheckStatus.PASS || c.status === CheckStatus.WARN,
      );
      return { eligibility: eligible };
    },
  },
];
