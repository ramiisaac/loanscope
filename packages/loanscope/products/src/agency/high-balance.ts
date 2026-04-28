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
import { HIGH_BALANCE_LIMIT_2024 } from "../limits";

// Explicit reserves-policy refinement — set reservesPolicy explicitly on the leaf product so the
// engine does not implicitly fall through to the program base's
// AUSDetermined policy. Agency High Balance defers reserve floors to the
// AUS finding (DU/LPA); industry-standard investment-property floors are
// not surfaced here because the current ReservesPolicy union does not
// compose AUS deferral with a per-occupancy hard floor (see D2 notes).

export const HighBalance: ProductDefinition = {
  id: "agency_high_balance",
  name: "High Balance",
  channel: Channel.Agency,
  loanType: LoanType.HighBalance,
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
          maxLTVRatio: ratio(0.9),
          minFico: 680,
          maxDTIRatio: ratio(0.45),
        },
        [Occupancy.Secondary]: {
          maxLTVRatio: ratio(0.8),
          minFico: 700,
          maxDTIRatio: ratio(0.45),
        },
        [Occupancy.Investment]: {
          maxLTVRatio: ratio(0.75),
          minFico: 720,
          maxDTIRatio: ratio(0.43),
        },
      },
    },
  ],
  baseConstraints: {
    maxLoanAmount: HIGH_BALANCE_LIMIT_2024,
    allowedTerms: [360, 300, 240, 180],
    reservesPolicy: { kind: "AUSDetermined" },
  },
  family: "High Balance",
};
