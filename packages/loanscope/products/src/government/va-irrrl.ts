import {
  AmortizationTerm,
  Channel,
  GovernmentProgram,
  LoanPurpose,
  LoanType,
  Occupancy,
  ProductDefinition,
  ProgramKind,
  ratio,
} from "@loanscope/domain";
import { FixedAmortization } from "../amortization";

/**
 * VA IRRRL (Interest Rate Reduction Refinance Loan).
 *
 * VA IRRRL fee is 0.50% regardless of LTV/purpose; signalled to
 * calculate-government-fees via priorUse=true + RateTermRefi per
 * IRRRL eligibility contract contract. Borrowers must have an existing VA loan;
 * engine-level enforcement deferred.
 *
 * VA IRRRL has no appraisal-based LTV cap (38 CFR 36.4307); the
 * variant constraints intentionally omit a maxLTVRatio for primary
 * occupancy. Secondary/investment remain disallowed because IRRRL is
 * available only to refinance an existing VA-guaranteed primary
 * residence loan (occupancy at original closing satisfies the rule).
 *
 * No FICO floor is enforced at the product level; 620 is encoded to
 * stay consistent with the VA base product so lender overlays remain
 * predictable.
 */
export const VaIrrrl: ProductDefinition = {
  id: "va_irrrl",
  name: "VA IRRRL (Interest Rate Reduction Refinance Loan)",
  channel: Channel.Government,
  loanType: LoanType.VA,
  governmentProgram: GovernmentProgram.VA,
  extends: "government_base",
  variants: [
    {
      programKind: ProgramKind.Fixed,
      amortization: FixedAmortization,
      terms: [AmortizationTerm.M360, AmortizationTerm.M180],
      constraints: {
        [Occupancy.Primary]: {
          minFico: 620,
          maxDTIRatio: ratio(0.6),
        },
        [Occupancy.Secondary]: { maxLTVRatio: ratio(0.0) },
        [Occupancy.Investment]: { maxLTVRatio: ratio(0.0) },
      },
    },
  ],
  baseConstraints: {
    // Accept both the explicit IrrrlRefi purpose (preferred) and the legacy
    // RateTermRefi signal (preserved for scenarios authored before the
    // IrrrlRefi enum existed). Both paths produce IRRRL pricing in the
    // government-fees edge.
    allowedPurposes: [LoanPurpose.IrrrlRefi, LoanPurpose.RateTermRefi],
    allowedOccupancies: [Occupancy.Primary],
    allowedTerms: [360, 180],
    minFico: 620,
    maxDTIRatio: ratio(0.6),
  },
  family: "VA",
};
