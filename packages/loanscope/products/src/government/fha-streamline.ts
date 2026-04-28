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
 * FHA Streamline Refinance.
 *
 * FHA Streamline waives new appraisal + new full credit qualifying.
 * Engine-level enforcement deferred; this product encodes the LTV +
 * purpose subset (rate-and-term refi only, primary only, 97.75% LTV
 * cap per HUD Handbook 4000.1 III.A.8.d).
 *
 * No FICO minimum is enforced at the product level (FHA Streamline
 * permits credit-qualifying and non-credit-qualifying paths); minFico
 * is set to 580 to remain consistent with the FHA base product so
 * lender overlays continue to behave predictably.
 */
export const FhaStreamline: ProductDefinition = {
  id: "fha_streamline",
  name: "FHA Streamline Refinance",
  channel: Channel.Government,
  loanType: LoanType.FHA,
  governmentProgram: GovernmentProgram.FHA,
  extends: "government_base",
  variants: [
    {
      programKind: ProgramKind.Fixed,
      amortization: FixedAmortization,
      terms: [AmortizationTerm.M360, AmortizationTerm.M180],
      constraints: {
        [Occupancy.Primary]: {
          maxLTVRatio: ratio(0.9775),
          maxCLTVRatio: ratio(0.9775),
          minFico: 580,
          maxDTIRatio: ratio(0.57),
        },
        [Occupancy.Secondary]: { maxLTVRatio: ratio(0.0) },
        [Occupancy.Investment]: { maxLTVRatio: ratio(0.0) },
      },
    },
  ],
  baseConstraints: {
    allowedPurposes: [LoanPurpose.RateTermRefi],
    allowedOccupancies: [Occupancy.Primary],
    allowedTerms: [360, 180],
    minFico: 580,
    maxDTIRatio: ratio(0.57),
    maxLtvByPurpose: {
      [LoanPurpose.Purchase]: ratio(0.0),
      [LoanPurpose.RateTermRefi]: ratio(0.9775),
      [LoanPurpose.CashOutRefi]: ratio(0.0),
    },
  },
  family: "FHA",
};
