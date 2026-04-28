import {
  BuydownPayer,
  BuydownType,
  Channel,
  IncomeType,
  LoanPurpose,
  LoanType,
  Occupancy,
  ProductDefinition,
  PropertyType,
  money,
  months,
  ratio,
} from "@loanscope/domain";

export const PortfolioBase: ProductDefinition = {
  id: "portfolio_base",
  name: "Portfolio Base",
  channel: Channel.Portfolio,
  loanType: LoanType.Jumbo,
  variants: [],
  baseConstraints: {
    allowedPurposes: [LoanPurpose.Purchase, LoanPurpose.RateTermRefi, LoanPurpose.CashOutRefi],
    allowedOccupancies: [Occupancy.Primary, Occupancy.Secondary, Occupancy.Investment],
    allowedPropertyTypes: [PropertyType.SFR, PropertyType.Condo, PropertyType.Townhome],
    unitsAllowed: [1, 2, 3, 4],
    allowedTerms: [360, 480],
    minLoanAmount: money(766551),
    // Tightened from 5,000,000 to 3,000,000 (Jumbo tier refinement): no portfolio/jumbo
    // product in the UWM suite underwrites above the program cap of $3M.
    maxLoanAmount: money(3000000),
    minFico: 700,
    // Tightened from 0.45 to 0.43 (Jumbo tier refinement): UWM's portfolio/jumbo
    // quality bar does not underwrite to a >43% DTI at the base envelope.
    maxDTIRatio: ratio(0.43),
    maxLTVRatio: ratio(0.8),
    maxCLTVRatio: ratio(0.8),
    // Explicit reserves-policy refinement — backstop default. Product-specific Tiered policies on
    // child products (e.g. Jumbo Pink, Prime Jumbo, Prime Jumbo Max) override
    // this per loan amount and occupancy via `mergeRules` (override wins).
    // Children that do not specify a `reservesPolicy` inherit this 6-month
    // floor as a deterministic baseline rather than falling through to AUS.
    reservesPolicy: { kind: "FixedMonths", months: months(6) },
    buydownRules: {
      allowed: true,
      allowedTypes: [BuydownType.OneZero, BuydownType.TwoOne],
      allowedPayers: [BuydownPayer.Seller, BuydownPayer.Lender, BuydownPayer.Borrower],
      primaryOnly: true,
      purchaseOnly: true,
    },
    cashOutConstraints: {
      seasoningMonths: months(12),
      listedForSaleRestriction: true,
    },
    appraisalRules: {
      waiverAllowed: false,
      tiers: [
        { loanAmountThreshold: money(0), appraisalsRequired: 1 },
        {
          loanAmountThreshold: money(2000000),
          appraisalsRequired: 2,
          separateAppraisers: true,
        },
      ],
    },
    // Portfolio jumbo defaults: 75% rental, full SE income with optional
    // 24-month averaging when the stream supplies enough history. Some
    // lenders allow rental up to 85% of gross. Shorter SE histories fall
    // back to the perIncomeType PercentOfStated 1.0 default.
    incomePolicies: {
      perIncomeType: {
        [IncomeType.Rental]: { kind: "PercentOfStated", factor: ratio(0.75) },
        [IncomeType.SelfEmployed]: {
          kind: "PercentOfStated",
          factor: ratio(1.0),
        },
      },
      maxRentalFactor: 0.85,
      selfEmployedAveragingMonths: 24,
    },
  },
  metadata: { base: true },
};
