import {
  AmortizationTerm,
  ArmFixedPeriod,
  Channel,
  LoanType,
  Occupancy,
  ProductDefinition,
  ProgramKind,
  money,
  months,
  ratio,
  type ReservesPolicy,
} from "@loanscope/domain";
import { InterestOnlyAmortization } from "../amortization";
import { createARMAmortization } from "../amortization/arm";

/**
 * Explicit reserves-policy refinement — Prime Jumbo per-product reserves table.
 *
 * Higher credit-bar program than the color-coded Jumbo suite, so reserve
 * floors are tighter at every band. Bands mirror `primeJumboTiers`. Tier C
 * excludes investment occupancy (no tier — falls through to 0; the product
 * tier-C LTV envelope already disqualifies investment).
 */
const primeJumboReservesPolicy: ReservesPolicy = {
  kind: "Tiered",
  tiers: [
    // Tier A: $766,550-$1.5M
    {
      loanAmount: { min: money(766550), max: money(1500000) },
      occupancies: [Occupancy.Primary],
      months: months(9),
    },
    {
      loanAmount: { min: money(766550), max: money(1500000) },
      occupancies: [Occupancy.Secondary],
      months: months(12),
    },
    {
      loanAmount: { min: money(766550), max: money(1500000) },
      occupancies: [Occupancy.Investment],
      months: months(15),
    },
    // Tier B: $1.5M-$2.5M
    {
      loanAmount: { min: money(1500000), max: money(2500000) },
      occupancies: [Occupancy.Primary],
      months: months(12),
    },
    {
      loanAmount: { min: money(1500000), max: money(2500000) },
      occupancies: [Occupancy.Secondary],
      months: months(18),
    },
    {
      loanAmount: { min: money(1500000), max: money(2500000) },
      occupancies: [Occupancy.Investment],
      months: months(24),
    },
    // Tier C: $2.5M-$3.0M (investment excluded)
    {
      loanAmount: { min: money(2500000), max: money(3000000) },
      occupancies: [Occupancy.Primary],
      months: months(18),
    },
    {
      loanAmount: { min: money(2500000), max: money(3000000) },
      occupancies: [Occupancy.Secondary],
      months: months(24),
    },
    // Investment excluded above $2.5M (product tier-C LTV envelope disqualifies).
  ],
};

/**
 * UWM Prime Jumbo loan-amount-banded eligibility grid (Jumbo tier refinement).
 *
 * Prime Jumbo is a higher-credit-band program than the color-coded Jumbo
 * suite. The tier-level envelope encodes the most permissive (primary)
 * FICO/LTV per band; the full per-occupancy grid is documented in `notes`.
 * Variant constraints continue to enforce per-occupancy narrowing.
 */
const primeJumboTiers = [
  // Tier A: $766,550-$1.5M, 89% primary / 740 FICO; 80% secondary / 760; 75% investment / 760.
  {
    range: { min: money(766550), max: money(1500000) },
    minFico: 740,
    maxLTVRatio: ratio(0.89),
    notes:
      "Tier A ($766,550-$1.5M): primary 89% LTV / 740 FICO; secondary 80% / 760; investment 75% / 760",
  },
  // Tier B: $1.5M-$2.5M, 80% primary / 760 FICO; 70% secondary / 760; 65% investment / 760.
  {
    range: { min: money(1500000), max: money(2500000) },
    minFico: 760,
    maxLTVRatio: ratio(0.8),
    notes:
      "Tier B ($1.5M-$2.5M): primary 80% LTV / 760 FICO; secondary 70% / 760; investment 65% / 760",
  },
  // Tier C: $2.5M-$3.0M, 70% primary / 760 FICO; 65% secondary / 760; investment ineligible.
  {
    range: { min: money(2500000), max: money(3000000) },
    minFico: 760,
    maxLTVRatio: ratio(0.7),
    notes:
      "Tier C ($2.5M-$3.0M): primary 70% LTV / 760 FICO; secondary 65% / 760; investment ineligible (max LTV 0)",
  },
];

export const PrimeJumbo: ProductDefinition = {
  id: "uwm_prime_jumbo",
  name: "Prime Jumbo",
  family: "Prime Jumbo",
  channel: Channel.Portfolio,
  loanType: LoanType.Jumbo,
  extends: "portfolio_base",
  lenderId: "uwm",
  variants: [
    {
      programKind: ProgramKind.ARM,
      amortization: createARMAmortization(60),
      terms: [AmortizationTerm.M360],
      armDetails: { initialFixedMonths: ArmFixedPeriod.M60 },
      constraints: {
        [Occupancy.Primary]: {
          maxLTVRatio: ratio(0.8),
          minFico: 700,
          maxDTIRatio: ratio(0.45),
        },
        [Occupancy.Secondary]: {
          maxLTVRatio: ratio(0.75),
          minFico: 720,
          maxDTIRatio: ratio(0.43),
        },
        [Occupancy.Investment]: {
          maxLTVRatio: ratio(0.7),
          minFico: 740,
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
          maxLTVRatio: ratio(0.8),
          minFico: 700,
          maxDTIRatio: ratio(0.45),
        },
        [Occupancy.Secondary]: {
          maxLTVRatio: ratio(0.75),
          minFico: 720,
          maxDTIRatio: ratio(0.43),
        },
        [Occupancy.Investment]: {
          maxLTVRatio: ratio(0.7),
          minFico: 740,
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
          maxLTVRatio: ratio(0.8),
          minFico: 700,
          maxDTIRatio: ratio(0.45),
        },
        [Occupancy.Secondary]: {
          maxLTVRatio: ratio(0.75),
          minFico: 720,
          maxDTIRatio: ratio(0.43),
        },
        [Occupancy.Investment]: {
          maxLTVRatio: ratio(0.7),
          minFico: 740,
          maxDTIRatio: ratio(0.43),
        },
      },
    },
    {
      programKind: ProgramKind.Fixed,
      amortization: InterestOnlyAmortization,
      terms: [AmortizationTerm.M360, AmortizationTerm.M480],
      constraints: {
        [Occupancy.Primary]: {
          maxLTVRatio: ratio(0.75),
          minFico: 720,
          maxDTIRatio: ratio(0.43),
        },
        [Occupancy.Secondary]: {
          maxLTVRatio: ratio(0.7),
          minFico: 740,
          maxDTIRatio: ratio(0.43),
        },
        [Occupancy.Investment]: {
          maxLTVRatio: ratio(0.65),
          minFico: 760,
          maxDTIRatio: ratio(0.4),
        },
      },
    },
  ],
  tiers: primeJumboTiers,
  baseConstraints: {
    reservesPolicy: primeJumboReservesPolicy,
  },
};

export const PrimeJumboMax: ProductDefinition = {
  id: "uwm_prime_jumbo_max",
  name: "Prime Jumbo Max",
  family: "Prime Jumbo Max",
  channel: Channel.Portfolio,
  loanType: LoanType.Jumbo,
  extends: "portfolio_base",
  lenderId: "uwm",
  variants: [
    {
      programKind: ProgramKind.ARM,
      amortization: createARMAmortization(84),
      terms: [AmortizationTerm.M360],
      armDetails: { initialFixedMonths: ArmFixedPeriod.M84 },
      constraints: {
        [Occupancy.Primary]: {
          maxLTVRatio: ratio(0.85),
          minFico: 740,
          maxDTIRatio: ratio(0.45),
        },
        [Occupancy.Secondary]: {
          maxLTVRatio: ratio(0.8),
          minFico: 740,
          maxDTIRatio: ratio(0.43),
        },
        [Occupancy.Investment]: {
          maxLTVRatio: ratio(0.75),
          minFico: 760,
          maxDTIRatio: ratio(0.4),
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
          minFico: 740,
          maxDTIRatio: ratio(0.45),
        },
        [Occupancy.Secondary]: {
          maxLTVRatio: ratio(0.8),
          minFico: 740,
          maxDTIRatio: ratio(0.43),
        },
        [Occupancy.Investment]: {
          maxLTVRatio: ratio(0.75),
          minFico: 760,
          maxDTIRatio: ratio(0.4),
        },
      },
    },
  ],
  tiers: primeJumboTiers,
  baseConstraints: {
    reservesPolicy: primeJumboReservesPolicy,
  },
};

export const UWMPrimeJumboProducts: ProductDefinition[] = [PrimeJumbo, PrimeJumboMax];
