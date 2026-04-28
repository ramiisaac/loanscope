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
 * VA-guaranteed purchase / refinance loan.
 *
 * Encodes the VA's 100% LTV allowance for primary residences. VA has no
 * statutory minimum credit score; 620 is encoded as a typical lender
 * overlay and can be tightened by lender-specific variants.
 *
 * DTI ceiling is coded to 60% to reflect the VA's residual-income-based
 * underwriting, which tolerates higher DTI than conventional programs.
 * Residual-income enforcement itself is an engine-level concern and is
 * not expressed here.
 *
 * Cash-out refinances are allowed up to 100% LTV per 38 CFR 36.4306;
 * many lenders overlay to 90%. The 100% ceiling is encoded here so
 * lender-specific overlays can tighten rather than widen it.
 */
export const VA: ProductDefinition = {
  id: "va",
  name: "VA",
  channel: Channel.Government,
  loanType: LoanType.VA,
  governmentProgram: GovernmentProgram.VA,
  extends: "government_base",
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
          maxLTVRatio: ratio(1.0),
          maxCLTVRatio: ratio(1.0),
          minFico: 620,
          maxDTIRatio: ratio(0.6),
        },
        [Occupancy.Secondary]: { maxLTVRatio: ratio(0.0) },
        [Occupancy.Investment]: { maxLTVRatio: ratio(0.0) },
      },
    },
  ],
  baseConstraints: {
    allowedPurposes: [LoanPurpose.Purchase, LoanPurpose.RateTermRefi, LoanPurpose.CashOutRefi],
    allowedTerms: [360, 300, 240, 180],
    minFico: 620,
    maxDTIRatio: ratio(0.6),
    maxLtvByPurpose: {
      [LoanPurpose.Purchase]: ratio(1.0),
      [LoanPurpose.RateTermRefi]: ratio(1.0),
      [LoanPurpose.CashOutRefi]: ratio(1.0),
    },
    // VA Pamphlet 26-7 Chapter 4: 75% rental net; non-taxable income may
    // be grossed up 1.25x at lender discretion. Self-employed income is
    // averaged over 24 months when the stream supplies enough history;
    // shorter histories fall back to the perIncomeType default.
    incomePolicies: {
      perIncomeType: {
        [IncomeType.Rental]: { kind: "PercentOfStated", factor: ratio(0.75) },
        [IncomeType.SocialSecurity]: {
          kind: "PercentOfStated",
          factor: ratio(1.25),
        },
      },
      maxRentalFactor: 0.75,
      selfEmployedAveragingMonths: 24,
    },
  },
  family: "VA",
};
