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
import { HIGH_BALANCE_LIMIT_2024 } from "../../limits";

// Explicit reserves-policy refinement — explicit reserves policy on every agency leaf product.
// Set to `AUSDetermined` so the engine receives an explicit "AUS" signal
// from this product rather than implicitly inheriting the program base's
// AUSDetermined via merge fallthrough. Industry-standard floors (e.g. 6
// months on investment) are deferred until the policy union supports
// composing AUS-determination with hard floors; see `additionalToAus` on
// `ReservesTier` in `@loanscope/domain`.

export const FreddieHighBalance: ProductDefinition = {
  id: "freddie_high_balance",
  name: "Freddie High Balance",
  channel: Channel.Agency,
  loanType: LoanType.HighBalance,
  extends: "freddie_base",
  family: "High Balance",
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
};
