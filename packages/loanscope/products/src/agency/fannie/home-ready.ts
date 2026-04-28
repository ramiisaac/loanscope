import {
  AmortizationTerm,
  Channel,
  LoanType,
  Occupancy,
  ProductDefinition,
  ProgramKind,
  ratio,
} from "@loanscope/domain";
import { FixedAmortization } from "../../amortization";

/**
 * Explicit reserves-policy refinement — explicit reservesPolicy.
 *
 * HomeReady inherits from `fannie_base`, which already specifies
 * `{ kind: "AUSDetermined" }`. We restate it on the leaf product so the
 * intent is explicit at the product surface and so future refactors of the
 * base do not silently change reserve semantics for this program.
 */

export const HomeReady: ProductDefinition = {
  id: "fannie_homeready",
  name: "HomeReady",
  channel: Channel.Agency,
  loanType: LoanType.Conventional,
  extends: "fannie_base",
  variants: [
    {
      programKind: ProgramKind.Fixed,
      amortization: FixedAmortization,
      terms: [AmortizationTerm.M360],
      constraints: {
        [Occupancy.Primary]: {
          maxLTVRatio: ratio(0.97),
          minFico: 620,
          maxDTIRatio: ratio(0.5),
        },
        [Occupancy.Secondary]: {
          maxLTVRatio: ratio(0.85),
          minFico: 680,
          maxDTIRatio: ratio(0.45),
        },
        [Occupancy.Investment]: {
          maxLTVRatio: ratio(0.8),
          minFico: 700,
          maxDTIRatio: ratio(0.43),
        },
      },
    },
  ],
  baseConstraints: {
    reservesPolicy: { kind: "AUSDetermined" },
  },
  family: "HomeReady",
};
