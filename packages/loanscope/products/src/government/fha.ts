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
 * FHA forward mortgage (Section 203(b)).
 *
 * Encodes the standard 96.5% primary LTV cap (FICO >= 580, 3.5% down).
 * FHA also permits 90% LTV for FICO 500-579; that lower-FICO tier is
 * intentionally not expressed as a second variant because
 * `resolveVariant` keys on (term, amortization, programKind) and would
 * treat duplicate variants as ambiguous. Lower-FICO eligibility is
 * expected to be surfaced via lender overlays or a dedicated variant
 * axis in a future enhancement.
 *
 * Cash-out refinances are separately capped at 80% LTV per HUD
 * Mortgagee Letter 2019-11, encoded on `baseConstraints.maxLtvByPurpose`
 * so engine-level purpose checks can enforce it without conflating it
 * with the purchase/rate-term LTV ceiling.
 */
export const FHA: ProductDefinition = {
  id: "fha",
  name: "FHA",
  channel: Channel.Government,
  loanType: LoanType.FHA,
  governmentProgram: GovernmentProgram.FHA,
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
          maxLTVRatio: ratio(0.965),
          maxCLTVRatio: ratio(0.965),
          minFico: 580,
          maxDTIRatio: ratio(0.57),
        },
        [Occupancy.Secondary]: { maxLTVRatio: ratio(0.0) },
        [Occupancy.Investment]: { maxLTVRatio: ratio(0.0) },
      },
    },
  ],
  baseConstraints: {
    allowedPurposes: [LoanPurpose.Purchase, LoanPurpose.RateTermRefi, LoanPurpose.CashOutRefi],
    allowedTerms: [360, 300, 240, 180],
    maxLtvByPurpose: {
      [LoanPurpose.Purchase]: ratio(0.965),
      [LoanPurpose.RateTermRefi]: ratio(0.965),
      [LoanPurpose.CashOutRefi]: ratio(0.8),
    },
    // FHA HB 4000.1 Section II.A.4: rental income capped at 75% gross.
    // Section II.A.4.c.iv: self-employed income averaged over the lesser
    // of 24 months or the documented history. The 24-month default below
    // is applied by the engine only when the stream supplies enough
    // historicalAmounts; shorter histories fall back to the perIncomeType
    // PercentOfStated 1.0 default.
    incomePolicies: {
      perIncomeType: {
        [IncomeType.Rental]: { kind: "PercentOfStated", factor: ratio(0.75) },
        [IncomeType.SelfEmployed]: {
          kind: "PercentOfStated",
          factor: ratio(1.0),
        },
        [IncomeType.Bonus]: { kind: "PercentOfStated", factor: ratio(1.0) },
      },
      maxRentalFactor: 0.75,
      selfEmployedAveragingMonths: 24,
    },
  },
  family: "FHA",
};
