import {
  ArmFixedPeriod,
  BuydownPayer,
  BuydownType,
  LoanPurpose,
  MiType,
  Occupancy,
  ProgramKind,
  PropertyType,
} from "../enums";
import { Money, Months, RatePct, Ratio, Units } from "../primitives";

export interface PropertyAttributes {
  acreage?: number;
  isAgriculturalZoning?: boolean;
  isDecliningMarket?: boolean;
  stateCode?: string;
}

export interface SubordinateLien {
  id: string;
  lienPosition: 2 | 3;
  amount: Money;
  monthlyPayment?: Money;
  includeInDTI?: boolean;
}

export interface ArmDetails {
  indexName?: string;
  fullyIndexedRatePct?: RatePct;
  marginPct?: RatePct;
  initialFixedMonths?: ArmFixedPeriod;
}

export interface RateNote {
  noteRatePct: RatePct;
  productKind?: ProgramKind;
  amortizationMonths?: number;
  interestOnlyMonths?: Months;
  arm?: ArmDetails;
}

export interface MonthlyHousing {
  propertyTax?: Money;
  insurance?: Money;
  hoa?: Money;
  mi?: Money;
  floodInsurance?: Money;
  governmentFee?: Money;
}

export interface ClosingCosts {
  estimatedTotal: Money;
  prepaidItems?: Money;
}

export interface CashOutDetails {
  requestedAmount?: Money;
  seasoningMonths?: Months;
  listedForSaleRecently?: boolean;
}

/**
 * VA service / borrower context that affects funding-fee determination.
 * `priorUse` indicates a subsequent VA loan; `disabilityExempt` waives the
 * funding fee entirely; `reserveOrGuard` is reserved for future tier
 * differentiation (currently unified with the regular tier).
 */
export interface VaServiceContext {
  readonly priorUse: boolean;
  readonly disabilityExempt: boolean;
  readonly reserveOrGuard: boolean;
}

export interface Location {
  zipCode?: string;
  countyFips?: string;
  stateCode?: string;
  isHighCostArea?: boolean;
  conformingLimitOverride?: Money;
  highBalanceLimitOverride?: Money;
}

export interface MiSelection {
  type?: MiType;
  ratePct?: RatePct;
  upfrontPremium?: Money;
  monthlyPremium?: Money;
}

export interface BuydownSelection {
  type?: BuydownType;
  payer?: BuydownPayer;
  cost?: Money;
}

/**
 * Subject-property rental income for 2-4 unit purchases / refis where the
 * borrower will occupy one unit and rent the others. The qualifying-income
 * uplift is `grossMonthlyRent * (1 - vacancyFactor)`; vacancy defaults to
 * 25% (industry-standard 75% net haircut).
 *
 * Only valid when `units >= 2`. The engine emits no uplift when units is
 * 1 even if this field is set; the per-unit assumption is that the
 * borrower-occupied unit is the only non-rented unit.
 */
export interface SubjectPropertyRental {
  grossMonthlyRent: Money;
  vacancyFactor?: Ratio;
}

export interface Scenario {
  loanPurpose: LoanPurpose;
  occupancy: Occupancy;
  propertyType: PropertyType;
  requestedLoanAmount: Money;
  rateNote: RateNote;
  purchasePrice?: Money;
  downPayment?: Money;
  monthlyHousing: MonthlyHousing;
  closingCosts: ClosingCosts;
  units?: Units;
  appraisedValue?: Money;
  subordinateFinancing?: SubordinateLien[];
  cashOut?: CashOutDetails;
  vaServiceContext?: VaServiceContext;
  location?: Location;
  propertyAttributes?: PropertyAttributes;
  miSelection?: MiSelection;
  buydown?: BuydownSelection;
  /** Subject-property rental income for 2-4 unit purchases / refis. */
  subjectPropertyRental?: SubjectPropertyRental;
}
