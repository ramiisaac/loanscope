export enum Occupancy {
  Primary = "Primary",
  Secondary = "Secondary",
  Investment = "Investment",
}

export enum LoanPurpose {
  Purchase = "Purchase",
  RateTermRefi = "RateTermRefi",
  CashOutRefi = "CashOutRefi",
  IrrrlRefi = "IrrrlRefi",
}

export enum PropertyType {
  SFR = "SFR",
  Condo = "Condo",
  Townhome = "Townhome",
  MultiUnit = "MultiUnit",
  Manufactured = "Manufactured",
  CoOp = "CoOp",
  Leasehold = "Leasehold",
  PUD = "PUD",
}

export enum LoanType {
  Conventional = "Conventional",
  FHA = "FHA",
  VA = "VA",
  USDA = "USDA",
  HighBalance = "HighBalance",
  Jumbo = "Jumbo",
}

export enum GovernmentProgram {
  FHA = "FHA",
  VA = "VA",
  USDA = "USDA",
}

export enum CheckSeverity {
  Blocker = "blocker",
  Warning = "warning",
  Info = "info",
}

export enum ProductTier {
  Standard = "Standard",
  Elite = "Elite",
}

export enum AssetType {
  Checking = "Checking",
  Savings = "Savings",
  Brokerage = "Brokerage",
  Retirement401k = "Retirement401k",
  RetirementIRA = "RetirementIRA",
  Business = "Business",
  Gift = "Gift",
  Crypto = "Crypto",
}

export enum LiabilityType {
  Mortgage = "Mortgage",
  HELOC = "HELOC",
  Auto = "Auto",
  StudentLoan = "StudentLoan",
  CreditCard = "CreditCard",
  PersonalLoan = "PersonalLoan",
  Alimony = "Alimony",
  ChildSupport = "ChildSupport",
}

export enum IncomeType {
  W2 = "W2",
  SelfEmployed = "SelfEmployed",
  Bonus = "Bonus",
  RSU = "RSU",
  Rental = "Rental",
  RentalDeparting = "RentalDeparting",
  SocialSecurity = "SocialSecurity",
  Pension = "Pension",
  Alimony = "Alimony",
  ChildSupport = "ChildSupport",
}

export enum ProgramKind {
  Fixed = "Fixed",
  ARM = "ARM",
  InterestOnly = "InterestOnly",
}

export enum AmortizationTerm {
  M120 = 120,
  M180 = 180,
  M240 = 240,
  M300 = 300,
  M360 = 360,
  M480 = 480,
}

export enum ArmFixedPeriod {
  M60 = 60,
  M84 = 84,
  M120 = 120,
}

export enum CheckStatus {
  PASS = "PASS",
  FAIL = "FAIL",
  WARN = "WARN",
}

export enum AusEngine {
  DU = "DU",
  LPA = "LPA",
}

export enum AusFinding {
  Approve = "Approve",
  ApproveIneligible = "ApproveIneligible",
  Accept = "Accept",
  AcceptIneligible = "AcceptIneligible",
  Refer = "Refer",
  Caution = "Caution",
}

export enum MiType {
  None = "None",
  BPMI = "BPMI",
  LPMI = "LPMI",
  SinglePremium = "SinglePremium",
  SplitPremium = "SplitPremium",
}

export enum BuydownType {
  None = "None",
  OneZero = "OneZero",
  TwoOne = "TwoOne",
  ThreeTwoOne = "ThreeTwoOne",
}

export enum BuydownPayer {
  Seller = "Seller",
  Lender = "Lender",
  Borrower = "Borrower",
}

export enum Confidence {
  Provided = "provided",
  Defaulted = "defaulted",
  Derived = "derived",
  Estimated = "estimated",
}

export enum Channel {
  Agency = "Agency",
  Government = "Government",
  Portfolio = "Portfolio",
}

export enum Agency {
  Fannie = "Fannie",
  Freddie = "Freddie",
}

export enum AmortizationType {
  FullyAmortizing = "FullyAmortizing",
  InterestOnly = "InterestOnly",
  ARM = "ARM",
}

export enum ActionKind {
  PayoffLiability = "PayoffLiability",
  PayDownLoan = "PayDownLoan",
  ExcludeAsset = "ExcludeAsset",
  IncludeBorrowers = "IncludeBorrowers",
  AdjustDownPayment = "AdjustDownPayment",
  AddReserves = "AddReserves",
  ChangeTerm = "ChangeTerm",
}
