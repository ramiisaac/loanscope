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

// Explicit reserves-policy refinement — explicit reserves policy. HomePossible defers reserves to
// LPA per Freddie's Single-Family Seller/Servicer Guide; pinning the policy
// here prevents an accidental fall-through if a future base-program change
// removes the inherited `AUSDetermined` value.

export const HomePossible: ProductDefinition = {
  id: "freddie_homepossible",
  name: "Home Possible",
  channel: Channel.Agency,
  loanType: LoanType.Conventional,
  extends: "freddie_base",
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
  family: "Home Possible",
};
