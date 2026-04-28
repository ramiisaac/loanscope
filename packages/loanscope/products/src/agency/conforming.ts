import {
  AmortizationTerm,
  Channel,
  LoanType,
  Occupancy,
  ProductDefinition,
  ProgramKind,
  ratio,
} from "@loanscope/domain";
import { FixedAmortization } from "../amortization";

// Explicit reserves-policy refinement — explicit AUS-determined reserves on the leaf product so
// merge resolution does not silently fall through to the program base. Agency
// conforming reserves remain DU/LPA-driven; this product carries no fixed
// floor independent of AUS findings.

export const Conforming: ProductDefinition = {
  id: "agency_conforming",
  name: "Conforming",
  channel: Channel.Agency,
  loanType: LoanType.Conventional,
  extends: "fannie_base",
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
  family: "Conforming",
};
