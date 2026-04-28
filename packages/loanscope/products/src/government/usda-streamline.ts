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
 * USDA Streamline Refinance.
 *
 * USDA Streamline (and Streamlined-Assist) waives new appraisal and
 * relaxes credit re-qualification requirements for existing USDA
 * Section 502 Guaranteed borrowers. Engine-level enforcement deferred;
 * this product encodes the LTV + purpose subset (rate-and-term refi
 * only, primary only, 30-year fixed) per USDA HB-1-3555 Chapter 6.
 *
 * No FICO floor is enforced at the product level; 640 is encoded to
 * stay consistent with the USDA base product so lender overlays remain
 * predictable. Borrowers must hold an existing USDA-guaranteed loan;
 * eligibility verification is an engine-level concern.
 */
export const UsdaStreamline: ProductDefinition = {
  id: "usda_streamline",
  name: "USDA Streamline Refinance",
  channel: Channel.Government,
  loanType: LoanType.USDA,
  governmentProgram: GovernmentProgram.USDA,
  extends: "government_base",
  variants: [
    {
      programKind: ProgramKind.Fixed,
      amortization: FixedAmortization,
      terms: [AmortizationTerm.M360],
      constraints: {
        [Occupancy.Primary]: {
          maxLTVRatio: ratio(1.0),
          maxCLTVRatio: ratio(1.0),
          minFico: 640,
          maxDTIRatio: ratio(0.5),
        },
        [Occupancy.Secondary]: { maxLTVRatio: ratio(0.0) },
        [Occupancy.Investment]: { maxLTVRatio: ratio(0.0) },
      },
    },
  ],
  baseConstraints: {
    allowedPurposes: [LoanPurpose.RateTermRefi],
    allowedOccupancies: [Occupancy.Primary],
    allowedTerms: [360],
    minFico: 640,
    maxDTIRatio: ratio(0.5),
    maxLtvByPurpose: {
      [LoanPurpose.Purchase]: ratio(0.0),
      [LoanPurpose.RateTermRefi]: ratio(1.0),
      [LoanPurpose.CashOutRefi]: ratio(0.0),
    },
  },
  family: "USDA",
};
