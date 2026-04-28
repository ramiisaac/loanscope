import {
  AmortizationTerm,
  AssetType,
  Channel,
  LoanPurpose,
  LoanType,
  Occupancy,
  ProductDefinition,
  ProgramKind,
  ratio,
  months,
  money,
} from "@loanscope/domain";
import { FixedAmortization, InterestOnlyAmortization } from "../amortization";

const jumboTiers = [
  {
    range: { min: money(766551), max: money(1000000) },
    reservesMonths: months(6),
  },
  {
    range: { min: money(1000001), max: money(2000000) },
    reservesMonths: months(9),
  },
  {
    // Aligned with PortfolioBase program cap of $3M (Jumbo tier refinement):
    // no UWM portfolio/jumbo color underwrites above $3M.
    range: { min: money(2000001), max: money(3000000) },
    reservesMonths: months(12),
  },
];

/**
 * UWM Jumbo Pink loan-amount-banded eligibility grid (Jumbo tier refinement).
 *
 * The `LoanAmountTier` shape carries a single envelope per band
 * (`minFico`, `maxLTVRatio`). To preserve per-occupancy detail without
 * mutating the domain model, each tier encodes the most permissive
 * (primary-occupancy) envelope at the tier level and documents the full
 * primary/secondary/investment grid in `notes`. Variant-level constraints
 * continue to enforce occupancy-specific narrowing; tier bounds enforce
 * loan-amount band membership and program-cap envelopes.
 */
const jumboPinkTiers = [
  // Tier A: $766,550-$1.0M, 90% primary / 700 FICO; 80% secondary / 720; 75% investment / 740.
  {
    range: { min: money(766550), max: money(1000000) },
    reservesMonths: months(6),
    minFico: 700,
    maxLTVRatio: ratio(0.9),
    notes:
      "Tier A ($766,550-$1.0M): primary 90% LTV / 700 FICO; secondary 80% / 720; investment 75% / 740",
  },
  // Tier B: $1.0M-$1.5M, 85% primary / 720 FICO; 75% secondary / 740; 70% investment / 760.
  {
    range: { min: money(1000000), max: money(1500000) },
    reservesMonths: months(9),
    minFico: 720,
    maxLTVRatio: ratio(0.85),
    notes:
      "Tier B ($1.0M-$1.5M): primary 85% LTV / 720 FICO; secondary 75% / 740; investment 70% / 760",
  },
  // Tier C: $1.5M-$2.0M, 80% primary / 740 FICO; 70% secondary / 760; 65% investment / 760.
  {
    range: { min: money(1500000), max: money(2000000) },
    reservesMonths: months(12),
    minFico: 740,
    maxLTVRatio: ratio(0.8),
    notes:
      "Tier C ($1.5M-$2.0M): primary 80% LTV / 740 FICO; secondary 70% / 760; investment 65% / 760",
  },
  // Tier D: $2.0M-$3.0M, 75% primary / 760 FICO; 65% secondary / 760; investment ineligible.
  {
    range: { min: money(2000000), max: money(3000000) },
    reservesMonths: months(12),
    minFico: 760,
    maxLTVRatio: ratio(0.75),
    notes:
      "Tier D ($2.0M-$3.0M): primary 75% LTV / 760 FICO; secondary 65% / 760; investment ineligible (max LTV 0)",
  },
];

export const JumboPink: ProductDefinition = {
  id: "uwm_jumbo_pink",
  name: "Jumbo Pink",
  family: "Jumbo Pink",
  channel: Channel.Portfolio,
  loanType: LoanType.Jumbo,
  extends: "portfolio_base",
  lenderId: "uwm",
  variants: [
    {
      programKind: ProgramKind.Fixed,
      amortization: FixedAmortization,
      terms: [AmortizationTerm.M360],
      constraints: {
        [Occupancy.Primary]: {
          maxLTVRatio: ratio(0.9),
          minFico: 700,
          maxDTIRatio: ratio(0.5),
        },
        [Occupancy.Secondary]: {
          maxLTVRatio: ratio(0.8),
          minFico: 700,
          maxDTIRatio: ratio(0.5),
        },
        [Occupancy.Investment]: {
          maxLTVRatio: ratio(0.75),
          minFico: 720,
          maxDTIRatio: ratio(0.45),
        },
      },
    },
    {
      programKind: ProgramKind.Fixed,
      amortization: FixedAmortization,
      terms: [AmortizationTerm.M480],
      constraints: {
        [Occupancy.Primary]: {
          maxLTVRatio: ratio(0.85),
          minFico: 700,
          maxDTIRatio: ratio(0.5),
        },
        [Occupancy.Secondary]: {
          maxLTVRatio: ratio(0.75),
          minFico: 700,
          maxDTIRatio: ratio(0.5),
        },
        [Occupancy.Investment]: {
          maxLTVRatio: ratio(0.7),
          minFico: 720,
          maxDTIRatio: ratio(0.45),
        },
      },
    },
    {
      programKind: ProgramKind.Fixed,
      amortization: InterestOnlyAmortization,
      terms: [AmortizationTerm.M480],
      constraints: {
        [Occupancy.Primary]: {
          maxLTVRatio: ratio(0.8),
          minFico: 720,
          maxDTIRatio: ratio(0.45),
        },
        [Occupancy.Secondary]: {
          maxLTVRatio: ratio(0.7),
          minFico: 720,
          maxDTIRatio: ratio(0.45),
        },
        [Occupancy.Investment]: {
          maxLTVRatio: ratio(0.65),
          minFico: 740,
          maxDTIRatio: ratio(0.43),
        },
      },
    },
  ],
  tiers: jumboPinkTiers,
  baseConstraints: {
    allowedPurposes: [LoanPurpose.Purchase, LoanPurpose.RateTermRefi],
    assetEligibilityOverrides: {
      reservesIneligibleTypes: [AssetType.Business],
    },
    // Explicit reserves-policy refinement — per-product reserves table for Jumbo Pink.
    // Tiers mirror the loan-amount bands in `jumboPinkTiers` and add an
    // explicit occupancy axis (Primary < Secondary < Investment). Investment
    // is intentionally excluded above $2M, matching the C2 tier exclusion in
    // Tier D. Bands use [min, max] inclusive on both ends; on shared
    // boundaries the lower-amount tier wins via deterministic tier ordering
    // in `resolveReserveMonths`.
    reservesPolicy: {
      kind: "Tiered",
      tiers: [
        // Tier A: $766,550-$1.0M
        {
          loanAmount: { min: money(766550), max: money(1000000) },
          occupancies: [Occupancy.Primary],
          months: months(6),
        },
        {
          loanAmount: { min: money(766550), max: money(1000000) },
          occupancies: [Occupancy.Secondary],
          months: months(9),
        },
        {
          loanAmount: { min: money(766550), max: money(1000000) },
          occupancies: [Occupancy.Investment],
          months: months(12),
        },
        // Tier B: $1.0M-$1.5M
        {
          loanAmount: { min: money(1000000), max: money(1500000) },
          occupancies: [Occupancy.Primary],
          months: months(9),
        },
        {
          loanAmount: { min: money(1000000), max: money(1500000) },
          occupancies: [Occupancy.Secondary],
          months: months(12),
        },
        {
          loanAmount: { min: money(1000000), max: money(1500000) },
          occupancies: [Occupancy.Investment],
          months: months(15),
        },
        // Tier C: $1.5M-$2.0M
        {
          loanAmount: { min: money(1500000), max: money(2000000) },
          occupancies: [Occupancy.Primary],
          months: months(12),
        },
        {
          loanAmount: { min: money(1500000), max: money(2000000) },
          occupancies: [Occupancy.Secondary],
          months: months(15),
        },
        {
          loanAmount: { min: money(1500000), max: money(2000000) },
          occupancies: [Occupancy.Investment],
          months: months(18),
        },
        // Tier D: $2.0M-$3.0M (investment excluded, mirroring C2 tier-D LTV=0)
        {
          loanAmount: { min: money(2000000), max: money(3000000) },
          occupancies: [Occupancy.Primary],
          months: months(18),
        },
        {
          loanAmount: { min: money(2000000), max: money(3000000) },
          occupancies: [Occupancy.Secondary],
          months: months(24),
        },
        // Investment excluded above $2M (no tier — falls through to 0; product
        // tier-D LTV envelope already disqualifies investment occupancy).
      ],
    },
  },
};

export const JumboPurple: ProductDefinition = {
  id: "uwm_jumbo_purple",
  name: "Jumbo Purple",
  family: "Jumbo Purple",
  channel: Channel.Portfolio,
  loanType: LoanType.Jumbo,
  extends: "portfolio_base",
  lenderId: "uwm",
  variants: [
    {
      programKind: ProgramKind.Fixed,
      amortization: FixedAmortization,
      terms: [AmortizationTerm.M360],
      constraints: {
        [Occupancy.Primary]: {
          maxLTVRatio: ratio(0.85),
          minFico: 700,
          maxDTIRatio: ratio(0.43),
        },
        [Occupancy.Secondary]: {
          maxLTVRatio: ratio(0.8),
          minFico: 700,
          maxDTIRatio: ratio(0.43),
        },
        [Occupancy.Investment]: {
          maxLTVRatio: ratio(0.7),
          minFico: 720,
          maxDTIRatio: ratio(0.43),
        },
      },
    },
    {
      programKind: ProgramKind.Fixed,
      amortization: FixedAmortization,
      terms: [AmortizationTerm.M480],
      constraints: {
        [Occupancy.Primary]: {
          maxLTVRatio: ratio(0.8),
          minFico: 720,
          maxDTIRatio: ratio(0.43),
        },
        [Occupancy.Secondary]: {
          maxLTVRatio: ratio(0.75),
          minFico: 720,
          maxDTIRatio: ratio(0.43),
        },
        [Occupancy.Investment]: {
          maxLTVRatio: ratio(0.65),
          minFico: 740,
          maxDTIRatio: ratio(0.4),
        },
      },
    },
    {
      programKind: ProgramKind.Fixed,
      amortization: InterestOnlyAmortization,
      terms: [AmortizationTerm.M480],
      constraints: {
        [Occupancy.Primary]: {
          maxLTVRatio: ratio(0.75),
          minFico: 740,
          maxDTIRatio: ratio(0.4),
        },
        [Occupancy.Secondary]: {
          maxLTVRatio: ratio(0.7),
          minFico: 740,
          maxDTIRatio: ratio(0.4),
        },
        [Occupancy.Investment]: {
          maxLTVRatio: ratio(0.6),
          minFico: 760,
          maxDTIRatio: ratio(0.38),
        },
      },
    },
  ],
  baseConstraints: {
    allowedPurposes: [LoanPurpose.Purchase, LoanPurpose.RateTermRefi],
  },
  tiers: jumboTiers,
};

export const JumboBlue: ProductDefinition = {
  id: "uwm_jumbo_blue",
  name: "Jumbo Blue",
  family: "Jumbo Blue",
  channel: Channel.Portfolio,
  loanType: LoanType.Jumbo,
  extends: "portfolio_base",
  lenderId: "uwm",
  variants: [
    {
      programKind: ProgramKind.Fixed,
      amortization: FixedAmortization,
      terms: [AmortizationTerm.M360],
      constraints: {
        [Occupancy.Primary]: {
          maxLTVRatio: ratio(0.8999),
          minFico: 680,
          maxDTIRatio: ratio(0.5),
        },
        [Occupancy.Secondary]: {
          maxLTVRatio: ratio(0.85),
          minFico: 680,
          maxDTIRatio: ratio(0.5),
        },
        [Occupancy.Investment]: {
          maxLTVRatio: ratio(0.7),
          minFico: 700,
          maxDTIRatio: ratio(0.45),
        },
      },
    },
  ],
  baseConstraints: {
    allowedPurposes: [LoanPurpose.Purchase, LoanPurpose.RateTermRefi],
  },
  tiers: jumboTiers,
};

export const JumboGreen: ProductDefinition = {
  id: "uwm_jumbo_green",
  name: "Jumbo Green",
  family: "Jumbo Green",
  channel: Channel.Portfolio,
  loanType: LoanType.Jumbo,
  extends: "portfolio_base",
  lenderId: "uwm",
  variants: [
    {
      programKind: ProgramKind.Fixed,
      amortization: FixedAmortization,
      terms: [AmortizationTerm.M360],
      constraints: {
        [Occupancy.Primary]: {
          maxLTVRatio: ratio(0.8),
          minFico: 720,
          maxDTIRatio: ratio(0.43),
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
  ],
  baseConstraints: {
    allowedPurposes: [LoanPurpose.Purchase, LoanPurpose.RateTermRefi],
  },
  tiers: jumboTiers,
};

export const JumboYellow: ProductDefinition = {
  id: "uwm_jumbo_yellow",
  name: "Jumbo Yellow",
  family: "Jumbo Yellow",
  channel: Channel.Portfolio,
  loanType: LoanType.Jumbo,
  extends: "portfolio_base",
  lenderId: "uwm",
  variants: [
    {
      programKind: ProgramKind.Fixed,
      amortization: FixedAmortization,
      terms: [AmortizationTerm.M360],
      constraints: {
        [Occupancy.Primary]: {
          maxLTVRatio: ratio(0.8),
          minFico: 720,
          maxDTIRatio: ratio(0.43),
        },
        [Occupancy.Secondary]: {
          maxLTVRatio: ratio(0.7),
          minFico: 720,
          maxDTIRatio: ratio(0.43),
        },
        [Occupancy.Investment]: {
          maxLTVRatio: ratio(0.65),
          minFico: 740,
          maxDTIRatio: ratio(0.43),
        },
      },
    },
  ],
  baseConstraints: {
    allowedPurposes: [LoanPurpose.Purchase, LoanPurpose.RateTermRefi],
  },
  tiers: jumboTiers,
};

export const JumboWhite: ProductDefinition = {
  id: "uwm_jumbo_white",
  name: "Jumbo White",
  family: "Jumbo White",
  channel: Channel.Portfolio,
  loanType: LoanType.Jumbo,
  extends: "portfolio_base",
  lenderId: "uwm",
  variants: [
    {
      programKind: ProgramKind.Fixed,
      amortization: FixedAmortization,
      terms: [AmortizationTerm.M180],
      constraints: {
        [Occupancy.Primary]: {
          maxLTVRatio: ratio(0.8),
          minFico: 740,
          maxDTIRatio: ratio(0.43),
        },
        [Occupancy.Secondary]: {
          maxLTVRatio: ratio(0.75),
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
  baseConstraints: {
    allowedPurposes: [LoanPurpose.Purchase, LoanPurpose.RateTermRefi],
    borrowerRestrictions: { nonOccupantAllowed: false },
  },
  tiers: jumboTiers,
};

export const UWMJumboProducts: ProductDefinition[] = [
  JumboPink,
  JumboPurple,
  JumboBlue,
  JumboGreen,
  JumboYellow,
  JumboWhite,
];
