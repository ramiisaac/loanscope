import {
  AmortizationTerm,
  ArmFixedPeriod,
  Channel,
  LoanType,
  Occupancy,
  ProductDefinition,
  ProgramKind,
  ratio,
} from "@loanscope/domain";
import { createARMAmortization } from "../../amortization/arm";
import { HIGH_BALANCE_LIMIT_2024 } from "../../limits";

// Explicit AUSDetermined floor on agency leaf products so resolution does not
// silently fall through to the program base. Mixed AUS+investment-floor
// composition is not yet expressible in the domain `ReservesPolicy` union; when
// that lands, investment occupancy on these products will pin to a 6-month
// industry floor.

export const FreddieConformingARM: ProductDefinition = {
  id: "freddie_conforming_arm",
  name: "Freddie Conforming ARM",
  channel: Channel.Agency,
  loanType: LoanType.Conventional,
  extends: "freddie_base",
  family: "Conforming",
  variants: [
    {
      programKind: ProgramKind.ARM,
      amortization: createARMAmortization(60),
      terms: [AmortizationTerm.M360],
      armDetails: { initialFixedMonths: ArmFixedPeriod.M60 },
      constraints: {
        [Occupancy.Primary]: {
          maxLTVRatio: ratio(0.95),
          minFico: 640,
          maxDTIRatio: ratio(0.5),
        },
        [Occupancy.Secondary]: {
          maxLTVRatio: ratio(0.85),
          minFico: 660,
          maxDTIRatio: ratio(0.45),
        },
        [Occupancy.Investment]: {
          maxLTVRatio: ratio(0.75),
          minFico: 700,
          maxDTIRatio: ratio(0.43),
        },
      },
    },
    {
      programKind: ProgramKind.ARM,
      amortization: createARMAmortization(84),
      terms: [AmortizationTerm.M360],
      armDetails: { initialFixedMonths: ArmFixedPeriod.M84 },
      constraints: {
        [Occupancy.Primary]: {
          maxLTVRatio: ratio(0.95),
          minFico: 640,
          maxDTIRatio: ratio(0.5),
        },
        [Occupancy.Secondary]: {
          maxLTVRatio: ratio(0.85),
          minFico: 660,
          maxDTIRatio: ratio(0.45),
        },
        [Occupancy.Investment]: {
          maxLTVRatio: ratio(0.75),
          minFico: 700,
          maxDTIRatio: ratio(0.43),
        },
      },
    },
    {
      programKind: ProgramKind.ARM,
      amortization: createARMAmortization(120),
      terms: [AmortizationTerm.M360],
      armDetails: { initialFixedMonths: ArmFixedPeriod.M120 },
      constraints: {
        [Occupancy.Primary]: {
          maxLTVRatio: ratio(0.95),
          minFico: 640,
          maxDTIRatio: ratio(0.5),
        },
        [Occupancy.Secondary]: {
          maxLTVRatio: ratio(0.85),
          minFico: 660,
          maxDTIRatio: ratio(0.45),
        },
        [Occupancy.Investment]: {
          maxLTVRatio: ratio(0.75),
          minFico: 700,
          maxDTIRatio: ratio(0.43),
        },
      },
    },
  ],
  baseConstraints: {
    allowedTerms: [360],
    reservesPolicy: { kind: "AUSDetermined" },
  },
};

export const FreddieHighBalanceARM: ProductDefinition = {
  id: "freddie_high_balance_arm",
  name: "Freddie High Balance ARM",
  channel: Channel.Agency,
  loanType: LoanType.HighBalance,
  extends: "freddie_base",
  family: "High Balance",
  variants: [
    {
      programKind: ProgramKind.ARM,
      amortization: createARMAmortization(60),
      terms: [AmortizationTerm.M360],
      armDetails: { initialFixedMonths: ArmFixedPeriod.M60 },
      constraints: {
        [Occupancy.Primary]: {
          maxLTVRatio: ratio(0.85),
          minFico: 680,
          maxDTIRatio: ratio(0.45),
        },
        [Occupancy.Secondary]: {
          maxLTVRatio: ratio(0.75),
          minFico: 700,
          maxDTIRatio: ratio(0.45),
        },
        [Occupancy.Investment]: {
          maxLTVRatio: ratio(0.7),
          minFico: 720,
          maxDTIRatio: ratio(0.43),
        },
      },
    },
    {
      programKind: ProgramKind.ARM,
      amortization: createARMAmortization(84),
      terms: [AmortizationTerm.M360],
      armDetails: { initialFixedMonths: ArmFixedPeriod.M84 },
      constraints: {
        [Occupancy.Primary]: {
          maxLTVRatio: ratio(0.85),
          minFico: 680,
          maxDTIRatio: ratio(0.45),
        },
        [Occupancy.Secondary]: {
          maxLTVRatio: ratio(0.75),
          minFico: 700,
          maxDTIRatio: ratio(0.45),
        },
        [Occupancy.Investment]: {
          maxLTVRatio: ratio(0.7),
          minFico: 720,
          maxDTIRatio: ratio(0.43),
        },
      },
    },
    {
      programKind: ProgramKind.ARM,
      amortization: createARMAmortization(120),
      terms: [AmortizationTerm.M360],
      armDetails: { initialFixedMonths: ArmFixedPeriod.M120 },
      constraints: {
        [Occupancy.Primary]: {
          maxLTVRatio: ratio(0.85),
          minFico: 680,
          maxDTIRatio: ratio(0.45),
        },
        [Occupancy.Secondary]: {
          maxLTVRatio: ratio(0.75),
          minFico: 700,
          maxDTIRatio: ratio(0.45),
        },
        [Occupancy.Investment]: {
          maxLTVRatio: ratio(0.7),
          minFico: 720,
          maxDTIRatio: ratio(0.43),
        },
      },
    },
  ],
  baseConstraints: {
    maxLoanAmount: HIGH_BALANCE_LIMIT_2024,
    allowedTerms: [360],
    reservesPolicy: { kind: "AUSDetermined" },
  },
};
