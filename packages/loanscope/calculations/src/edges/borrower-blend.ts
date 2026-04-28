import type { EdgeDefinition } from "@loanscope/graph";
import type { Borrower } from "@loanscope/domain";
import { DEFAULT_BLEND_POLICY, computeRepresentativeFico } from "@loanscope/math";
import { toArray, toBorrowerBlendPolicy } from "../coercions";

/**
 * Canonical producer of `blendedFico` — a single representative FICO derived
 * from the included borrower set under a `BorrowerBlendPolicy`.
 *
 * Coexists with the raw `fico` input seed (currently fed by the engine via a
 * minimum-FICO aggregator) for backward compatibility. Downstream consumers
 * that want policy-aware blending should depend on `blendedFico`; the raw
 * `fico` input remains the unblended minimum until a future integration
 * decides to replace the seed.
 *
 * Defaults to `LowestMid` (Fannie/Freddie representative-FICO convention)
 * when no policy is provided.
 */
export const borrowerBlendEdges: EdgeDefinition[] = [
  {
    id: "apply-borrower-blend",
    kind: "transform",
    inputs: ["borrowers", "includedBorrowerIds", "borrowerBlendPolicy"],
    outputs: ["blendedFico"],
    confidence: "derived",
    compute: (inputs) => {
      const borrowers = toArray<Borrower>(inputs.borrowers, "borrowers");
      const includedBorrowerIds = toArray<string>(
        inputs.includedBorrowerIds,
        "includedBorrowerIds",
      );
      const rawPolicy = inputs.borrowerBlendPolicy;
      const policy =
        rawPolicy === null || rawPolicy === undefined
          ? DEFAULT_BLEND_POLICY
          : toBorrowerBlendPolicy(rawPolicy, "borrowerBlendPolicy");
      return {
        blendedFico: computeRepresentativeFico(borrowers, includedBorrowerIds, policy),
      };
    },
  },
];
