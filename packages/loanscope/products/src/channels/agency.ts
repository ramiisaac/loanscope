import {
  Agency,
  AusEngine,
  AusFinding,
  BuydownPayer,
  BuydownType,
  Channel,
  LoanPurpose,
  LoanType,
  MiType,
  Occupancy,
  ProductDefinition,
  PropertyType,
  money,
  months,
  ratio,
} from "@loanscope/domain";

export const AgencyBase: ProductDefinition = {
  id: "agency_base",
  name: "Agency Base",
  channel: Channel.Agency,
  loanType: LoanType.Conventional,
  variants: [],
  baseConstraints: {
    allowedPurposes: [LoanPurpose.Purchase, LoanPurpose.RateTermRefi, LoanPurpose.CashOutRefi],
    allowedOccupancies: [Occupancy.Primary, Occupancy.Secondary, Occupancy.Investment],
    allowedPropertyTypes: [
      PropertyType.SFR,
      PropertyType.Condo,
      PropertyType.Townhome,
      PropertyType.PUD,
    ],
    unitsAllowed: [1, 2, 3, 4],
    allowedTerms: [360],
    minLoanAmount: money(50000),
    maxLoanAmount: money(766550),
    minFico: 620,
    maxDTIRatio: ratio(0.5),
    maxLTVRatio: ratio(0.97),
    maxCLTVRatio: ratio(0.97),
    reservesPolicy: { kind: "AUSDetermined" },
    miRules: {
      required: true,
      waivedAboveLtvRatio: ratio(0.8),
      allowedTypes: [MiType.BPMI, MiType.LPMI, MiType.SinglePremium, MiType.SplitPremium],
    },
    buydownRules: {
      allowed: true,
      allowedTypes: [BuydownType.OneZero, BuydownType.TwoOne, BuydownType.ThreeTwoOne],
      allowedPayers: [BuydownPayer.Seller, BuydownPayer.Lender, BuydownPayer.Borrower],
      primaryOnly: true,
      purchaseOnly: true,
    },
    cashOutConstraints: {
      seasoningMonths: months(12),
      listedForSaleRestriction: true,
    },
    appraisalRules: {
      waiverAllowed: true,
      tiers: [{ loanAmountThreshold: money(0), appraisalsRequired: 1 }],
    },
  },
  metadata: { base: true },
};

export const FannieBase: ProductDefinition = {
  ...AgencyBase,
  id: "fannie_base",
  name: "Fannie Mae Base",
  agency: Agency.Fannie,
  baseConstraints: {
    ...AgencyBase.baseConstraints,
    ausRules: {
      engines: [AusEngine.DU],
      requiredFindings: [AusFinding.Approve],
    },
  },
};

export const FreddieBase: ProductDefinition = {
  ...AgencyBase,
  id: "freddie_base",
  name: "Freddie Mac Base",
  agency: Agency.Freddie,
  baseConstraints: {
    ...AgencyBase.baseConstraints,
    ausRules: {
      engines: [AusEngine.LPA],
      requiredFindings: [AusFinding.Accept],
    },
  },
};
