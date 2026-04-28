import {
  AssetType,
  AusEngine,
  AusFinding,
  BuydownPayer,
  BuydownType,
  IncomeType,
  LoanPurpose,
  MiType,
  Occupancy,
  PropertyType,
} from "../enums";
import { Money, Months, Ratio, Units } from "../primitives";
import type { QualifyingIncomePolicy } from "./income-policy";
import { MoneyRange } from "./product";

/**
 * Per-program income policy overrides. Lets a product (e.g. FHA, VA, USDA,
 * portfolio jumbo) supply a default `QualifyingIncomePolicy` per
 * `IncomeType` and an absolute cap on the rental qualifying factor.
 *
 * `perIncomeType` overrides the math layer's built-in
 * `defaultPolicyForIncomeType` for streams that do not carry an explicit
 * `qualifyingPolicy`.
 *
 * `maxRentalFactor` is a hard ceiling applied to a rental stream's
 * effective qualifying factor (1 - vacancy for `RentalGross`, `factor` for
 * `PercentOfStated`). It does not apply to `AveragedMonths` or `AsStated`,
 * which lack a single multiplicative factor.
 */
export interface ProgramIncomePolicies {
  readonly perIncomeType?: Partial<Record<IncomeType, QualifyingIncomePolicy>>;
  readonly maxRentalFactor?: number;
  /**
   * Lookback window (in months) for averaging self-employed income.
   * When set, the engine resolves a stream's policy to
   * `AveragedMonths { monthsLookback: this, historicalAmounts: stream.historicalAmounts }`
   * for any `IncomeType.SelfEmployed` stream that supplies enough history.
   * When unset, SE streams continue to default to `PercentOfStated 1.0`.
   * Typical values: 24 (Fannie/Freddie/FHA), 12 (some non-QM programs).
   */
  readonly selfEmployedAveragingMonths?: number;
}

export type ReservesPolicy =
  | { kind: "None" }
  | { kind: "FixedMonths"; months: Months }
  | { kind: "AUSDetermined" }
  | { kind: "Tiered"; tiers: ReservesTier[] };

export interface ReservesTier {
  loanAmount: MoneyRange;
  occupancies?: Occupancy[];
  purposes?: LoanPurpose[];
  months: Months;
  additionalToAus?: boolean;
}

export type MinLoanAmountRule = "Absolute" | "OverConforming" | "OverMaxConformingHighCost";

export interface CashOutConstraints {
  maxAmountByTier?: Array<{ loanAmount: MoneyRange; maxCashOut: Money }>;
  seasoningMonths?: Months;
  listedForSaleRestriction?: boolean;
  cltvReductionForHighCashOut?: Ratio;
}

export interface AppraisalRules {
  waiverAllowed?: boolean;
  tiers?: AppraisalTier[];
}

export interface AppraisalTier {
  loanAmountThreshold: Money;
  appraisalsRequired: 1 | 2;
  separateAppraisers?: boolean;
}

export interface BuydownRules {
  allowed?: boolean;
  allowedTypes?: BuydownType[];
  allowedPayers?: BuydownPayer[];
  primaryOnly?: boolean;
  purchaseOnly?: boolean;
}

export interface MiRules {
  required?: boolean;
  waivedAboveLtvRatio?: Ratio;
  allowedTypes?: MiType[];
}

export interface BorrowerRestrictions {
  nonOccupantAllowed?: boolean;
  fthbAllowed?: boolean;
  fthbPrimaryOnly?: boolean;
  fthbMaxLoan?: Money;
  fthbMinFico?: number;
}

export interface PropertyRestrictions {
  maxAcreage?: number;
  acreageCltvReductionRatio?: Ratio;
  acreageThreshold?: number;
  agriculturalAllowed?: boolean;
  stateIneligibility?: string[];
}

export interface AusRules {
  engines?: AusEngine[];
  requiredFindings?: AusFinding[];
  notes?: string[];
}

export interface AssetEligibilityOverrides {
  reservesIneligibleTypes?: AssetType[];
}

export interface OccupancyConstraints {
  maxLTVRatio?: Ratio;
  maxCLTVRatio?: Ratio;
  minFico?: number;
  maxDTIRatio?: Ratio;
  reservesPolicy?: ReservesPolicy;
}

export interface ProgramRules {
  allowedPurposes: LoanPurpose[];
  allowedOccupancies: Occupancy[];
  allowedPropertyTypes?: PropertyType[];
  unitsAllowed?: Units[];
  allowedTerms?: number[];
  minLoanAmount?: Money;
  minLoanAmountRule?: MinLoanAmountRule;
  maxLoanAmount?: Money;
  minFico?: number;
  maxDTIRatio?: Ratio;
  maxLTVRatio?: Ratio;
  maxCLTVRatio?: Ratio;
  maxLtvByOccupancy?: Partial<Record<Occupancy, Ratio>>;
  maxLtvByPurpose?: Partial<Record<LoanPurpose, Ratio>>;
  reservesPolicy?: ReservesPolicy;
  borrowerRestrictions?: BorrowerRestrictions;
  appraisalRules?: AppraisalRules;
  cashOutConstraints?: CashOutConstraints;
  propertyRestrictions?: PropertyRestrictions;
  ausRules?: AusRules;
  assetEligibilityOverrides?: AssetEligibilityOverrides;
  buydownRules?: BuydownRules;
  miRules?: MiRules;
  incomePolicies?: ProgramIncomePolicies;
  notes?: string[];
}
