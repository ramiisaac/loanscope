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
 * Explicit reserves-policy refinement — explicit AUSDetermined reserves policy on the leaf product
 * so resolution does not implicitly fall through to `freddie_base`. LPA
 * controls reserves for conforming-balance Freddie originations.
 */

export const FreddieConforming: ProductDefinition = {
  id: "freddie_conforming",
  name: "Freddie Conforming",
  channel: Channel.Agency,
  loanType: LoanType.Conventional,
  extends: "freddie_base",
  family: "Conforming",
  variants: [
    {
      programKind: ProgramKind.Fixed,
      amortization: FixedAmortization,
      terms: [
        AmortizationTerm.M360,
        AmortizationTerm.M300,
        AmortizationTerm.M240,
        AmortizationTerm.M180,
      ],
      constraints: {
        [Occupancy.Primary]: {
          maxLTVRatio: ratio(0.97),
          minFico: 620,
          maxDTIRatio: ratio(0.5),
        },
        [Occupancy.Secondary]: {
          maxLTVRatio: ratio(0.9),
          minFico: 640,
          maxDTIRatio: ratio(0.45),
        },
        [Occupancy.Investment]: {
          maxLTVRatio: ratio(0.85),
          minFico: 680,
          maxDTIRatio: ratio(0.43),
        },
      },
    },
  ],
  baseConstraints: {
    allowedTerms: [360, 300, 240, 180],
    reservesPolicy: { kind: "AUSDetermined" },
  },
};
