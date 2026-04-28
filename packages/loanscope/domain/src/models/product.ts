import {
  Agency,
  AmortizationTerm,
  AmortizationType,
  Channel,
  GovernmentProgram,
  LoanType,
  Occupancy,
  ProgramKind,
} from "../enums";
import { Money, Months, RatePct, Ratio } from "../primitives";
import { OccupancyConstraints, ProgramRules } from "./rules";
import { ArmDetails } from "./scenario";

export type QualifyingPaymentPolicy =
  | { kind: "NotePayment" }
  | { kind: "IOUsesFullyAmortizing"; amortMonths: Months }
  | { kind: "ARMQualifyMaxNotePlus"; addPctPoints: RatePct }
  | { kind: "ARMQualifyFullyIndexedOrNote" };

export interface RateAssumption {
  label: string;
  noteRatePct: RatePct;
}

export interface MoneyRange {
  min?: Money;
  max?: Money;
}

export interface AmortizationBehavior {
  type: AmortizationType;
  qualifyingPaymentPolicy: QualifyingPaymentPolicy;
  interestOnlyMonths?: Months;
}

export interface ProductVariant {
  programKind: ProgramKind;
  amortization: AmortizationBehavior;
  terms: AmortizationTerm[];
  armDetails?: ArmDetails;
  constraints: Record<Occupancy, OccupancyConstraints>;
}

export interface LoanAmountTier {
  range: MoneyRange;
  reservesMonths?: Months;
  maxLTVRatio?: Ratio;
  maxCLTVRatio?: Ratio;
  maxDTIRatio?: Ratio;
  minFico?: number;
  notes?: string;
}

export interface ProductDefinition {
  id: string;
  name: string;
  loanType: LoanType;
  channel: Channel;
  extends?: string;
  agency?: Agency;
  governmentProgram?: GovernmentProgram;
  lenderId?: string;
  variants: ProductVariant[];
  tiers?: LoanAmountTier[];
  baseConstraints?: Partial<ProgramRules>;
  family?: string;
  programKind?: ProgramKind;
  qualifyingPaymentPolicy?: QualifyingPaymentPolicy;
  rateAssumptions?: RateAssumption[];
  metadata?: Record<string, unknown>;
}
