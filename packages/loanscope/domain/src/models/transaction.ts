import {
  ArmFixedPeriod,
  AusEngine,
  AusFinding,
  LoanPurpose,
  LoanType,
  Occupancy,
  ProgramKind,
  PropertyType,
} from "../enums";
import { Money, RatePct, Units } from "../primitives";
import { Asset } from "./asset";
import { Borrower } from "./borrower";
import { BorrowerBlendPolicy } from "./blend-policy";
import { Liability } from "./liability";
import { Scenario } from "./scenario";
import { TransactionVariant } from "./variant";

export interface AusFindings {
  engine?: AusEngine;
  finding?: AusFinding;
  reservesMonths?: number;
  notes?: string;
}

export interface Transaction {
  id: string;
  scenario: Scenario;
  borrowers: Borrower[];
  variants: TransactionVariant[];
  assets?: Asset[];
  liabilities?: Liability[];
  ausFindings?: AusFindings;
  /**
   * Optional policy controlling how a single representative FICO is derived
   * from the included borrower set. When absent, downstream consumers default
   * to `LowestMid` (Fannie/Freddie representative-FICO convention).
   */
  borrowerBlendPolicy?: BorrowerBlendPolicy;
  /**
   * When true, the upfront government fee (FHA UFMIP, VA funding fee) is
   * rolled into the loan amount: downstream `loanAmount` becomes
   * `baseLoanAmount + upfrontGovernmentFee`. When false (default), the
   * upfront fee is paid at closing and `loanAmount === baseLoanAmount`.
   */
  financedUpfrontFees?: boolean;
}

export interface QuickQuoteInput {
  loanAmount: Money;
  loanPurpose: LoanPurpose;
  occupancy: Occupancy;
  propertyType: PropertyType;
  fico: number;
  purchasePrice?: Money;
  appraisedValue?: Money;
  monthlyIncome?: Money;
  monthlyDebts?: Money;
  annualTaxes?: Money;
  annualInsurance?: Money;
  monthlyHoa?: Money;
  closingCosts?: Money;
  totalLiquidAssets?: Money;
  totalRetirementAssets?: Money;
  noteRatePct?: RatePct;
  amortizationMonths?: number;
  programKind?: ProgramKind;
  armInitialFixedMonths?: ArmFixedPeriod;
  loanType?: LoanType;
  units?: Units;
  stateCode?: string;
  isFirstTimeHomebuyer?: boolean;
  isSelfEmployed?: boolean;
  numberOfBorrowers?: 1 | 2;
}
