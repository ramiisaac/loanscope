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

export const ConformingARM: ProductDefinition = {
  id: "fannie_conforming_arm",
  name: "Conforming ARM",
  channel: Channel.Agency,
  loanType: LoanType.Conventional,
  extends: "fannie_base",
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
    // Explicit reserves-policy refinement — explicit AUSDetermined; conforming-balance ARMs defer
    // reserve months to DU findings rather than inheriting from the program
    // base via merge fallthrough.
    reservesPolicy: { kind: "AUSDetermined" },
  },
};

export const HighBalanceARM: ProductDefinition = {
  id: "fannie_high_balance_arm",
  name: "High Balance ARM",
  channel: Channel.Agency,
  loanType: LoanType.HighBalance,
  extends: "fannie_base",
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
    // Explicit reserves-policy refinement — explicit AUSDetermined; agency high-balance ARMs defer
    // reserve months to DU findings rather than inheriting from program base.
    reservesPolicy: { kind: "AUSDetermined" },
  },
};
