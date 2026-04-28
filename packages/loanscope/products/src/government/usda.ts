import {
  AmortizationTerm,
  Channel,
  GovernmentProgram,
  IncomeType,
  LoanPurpose,
  LoanType,
  Occupancy,
  ProductDefinition,
  ProgramKind,
  ratio,
} from "@loanscope/domain";
import { FixedAmortization } from "../amortization";

/**
 * USDA Rural Development Section 502 Guaranteed loan.
 *
 * USDA supports only 30-year fixed financing for owner-occupied primary
 * residences in eligible rural areas. The program permits 100% LTV
 * (no down payment) but does not allow cash-out refinances; refi
 * activity is limited to rate-and-term scenarios (including the separate
 * USDA Streamline product).
 *
 * DTI ceiling is coded to 50% to reflect the default GUS (Guaranteed
 * Underwriting System) auto-approval path per USDA HB-1-3555 Chapter 11.
 * Manual underwriting tolerances are lender/scenario specific and are
 * expected to be encoded as overlays, not at the base product layer.
 *
 * Minimum FICO 640 matches the GUS auto-underwrite threshold; lower
 * scores require manual underwrite and are not expressed in this
 * variant.
 */
export const USDA: ProductDefinition = {
  id: "usda",
  name: "USDA",
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
    // USDA 502 Guaranteed does not permit cash-out refinances per
    // HB-1-3555 Chapter 6; refi is rate-and-term only.
    allowedPurposes: [LoanPurpose.Purchase, LoanPurpose.RateTermRefi],
    allowedOccupancies: [Occupancy.Primary],
    allowedTerms: [360],
    minFico: 640,
    maxDTIRatio: ratio(0.5),
    maxLtvByPurpose: {
      [LoanPurpose.Purchase]: ratio(1.0),
      [LoanPurpose.RateTermRefi]: ratio(1.0),
      [LoanPurpose.CashOutRefi]: ratio(0.0),
    },
    // USDA HB-1-3555 Chapter 9: rental income at 75% gross; full income
    // from all adult household members counted toward the program income
    // limit (separate check, not modeled here). Self-employed income is
    // averaged over 24 months when the stream supplies enough history;
    // shorter histories fall back to the perIncomeType default.
    incomePolicies: {
      perIncomeType: {
        [IncomeType.Rental]: { kind: "PercentOfStated", factor: ratio(0.75) },
      },
      maxRentalFactor: 0.75,
      selfEmployedAveragingMonths: 24,
    },
  },
  family: "USDA",
};
