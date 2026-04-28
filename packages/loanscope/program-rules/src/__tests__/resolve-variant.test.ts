import { describe, expect, it } from "vitest";
import {
  AmortizationTerm,
  AmortizationType,
  ArmFixedPeriod,
  Channel,
  LoanPurpose,
  LoanType,
  Occupancy,
  ProgramKind,
  months,
  ratePct,
  ratio,
} from "@loanscope/domain";
import type {
  OccupancyConstraints,
  ProductDefinition,
  ProductVariant,
} from "@loanscope/domain";
import { resolveVariant } from "../resolve-variant";

const fullOccupancy = (): Record<Occupancy, OccupancyConstraints> => ({
  [Occupancy.Primary]: { maxLTVRatio: ratio(0.9), minFico: 620 },
  [Occupancy.Secondary]: { maxLTVRatio: ratio(0.8), minFico: 680 },
  [Occupancy.Investment]: { maxLTVRatio: ratio(0.75), minFico: 700 },
});

const fixedVariant = (): ProductVariant => ({
  programKind: ProgramKind.Fixed,
  amortization: {
    type: AmortizationType.FullyAmortizing,
    qualifyingPaymentPolicy: { kind: "NotePayment" },
  },
  terms: [AmortizationTerm.M360],
  constraints: fullOccupancy(),
});

const armVariant = (fixedPeriod: ArmFixedPeriod): ProductVariant => ({
  programKind: ProgramKind.ARM,
  amortization: {
    type: AmortizationType.ARM,
    qualifyingPaymentPolicy: { kind: "ARMQualifyFullyIndexedOrNote" },
  },
  terms: [AmortizationTerm.M360],
  armDetails: {
    initialFixedMonths: fixedPeriod,
    marginPct: ratePct(2.75),
  },
  constraints: fullOccupancy(),
});

const interestOnlyVariant = (): ProductVariant => ({
  programKind: ProgramKind.InterestOnly,
  amortization: {
    type: AmortizationType.InterestOnly,
    qualifyingPaymentPolicy: { kind: "IOUsesFullyAmortizing", amortMonths: months(360) },
    interestOnlyMonths: months(120),
  },
  terms: [AmortizationTerm.M360],
  constraints: fullOccupancy(),
});

const product = (id: string, variants: ProductVariant[]): ProductDefinition => ({
  id,
  name: id,
  loanType: LoanType.Conventional,
  channel: Channel.Agency,
  variants,
  baseConstraints: {
    allowedPurposes: [LoanPurpose.Purchase],
    allowedOccupancies: [Occupancy.Primary, Occupancy.Secondary, Occupancy.Investment],
  },
});

describe("resolveVariant", () => {
  it("returns the single matching variant on (term, amortization, occupancy)", () => {
    const variant = fixedVariant();
    const p = product("p_happy", [variant]);
    const resolved = resolveVariant(
      p,
      AmortizationTerm.M360,
      Occupancy.Primary,
      AmortizationType.FullyAmortizing,
    );
    expect(resolved).toBe(variant);
  });

  it("narrows ambiguous candidates by programKind", () => {
    const fixed = fixedVariant();
    const io: ProductVariant = {
      ...interestOnlyVariant(),
      amortization: {
        ...interestOnlyVariant().amortization,
        type: AmortizationType.FullyAmortizing,
      },
    };
    const p = product("p_kind", [fixed, io]);
    const resolved = resolveVariant(
      p,
      AmortizationTerm.M360,
      Occupancy.Primary,
      AmortizationType.FullyAmortizing,
      ProgramKind.InterestOnly,
    );
    expect(resolved).toBe(io);
  });

  it("narrows ambiguous candidates by armFixedPeriod", () => {
    const arm60 = armVariant(ArmFixedPeriod.M60);
    const arm84 = armVariant(ArmFixedPeriod.M84);
    const p = product("p_arm", [arm60, arm84]);
    const resolved = resolveVariant(
      p,
      AmortizationTerm.M360,
      Occupancy.Primary,
      AmortizationType.ARM,
      undefined,
      ArmFixedPeriod.M84,
    );
    expect(resolved).toBe(arm84);
  });

  it("throws with product/term/amortization on zero matches", () => {
    const p = product("p_zero", [fixedVariant()]);
    expect(() =>
      resolveVariant(
        p,
        AmortizationTerm.M240,
        Occupancy.Primary,
        AmortizationType.FullyAmortizing,
      ),
    ).toThrow(/No variant for p_zero term 240 amortization FullyAmortizing/);
  });

  it("throws 'Ambiguous variants' with product/term/amortization on multiple matches", () => {
    const p = product("p_ambig", [fixedVariant(), fixedVariant()]);
    expect(() =>
      resolveVariant(
        p,
        AmortizationTerm.M360,
        Occupancy.Primary,
        AmortizationType.FullyAmortizing,
      ),
    ).toThrow(/Ambiguous variants for p_ambig term 360 amortization FullyAmortizing/);
  });

  it("throws occupancy-specific error (not zero-match) when occupancy is missing on the resolved variant", () => {
    // `ProductVariant.constraints` is typed as a total `Record<Occupancy, ...>`,
    // but `resolveVariant` carries a defensive runtime guard for catalogs whose
    // runtime data does not satisfy that contract (e.g. YAML-loaded data that
    // bypassed the type system at the parse boundary). Exercising that guard
    // inherently requires constructing a value the type system forbids; the
    // narrow cast below is the tightly-scoped, test-only boundary.
    const partialConstraints: Partial<Record<Occupancy, OccupancyConstraints>> = {
      [Occupancy.Primary]: { maxLTVRatio: ratio(0.9) },
    };
    const variant: ProductVariant = {
      ...fixedVariant(),
      constraints: partialConstraints as Record<Occupancy, OccupancyConstraints>,
    };
    const p = product("p_occ", [variant]);
    expect(() =>
      resolveVariant(
        p,
        AmortizationTerm.M360,
        Occupancy.Investment,
        AmortizationType.FullyAmortizing,
      ),
    ).toThrow(/No occupancy constraints for p_occ Investment/);
    expect(() =>
      resolveVariant(
        p,
        AmortizationTerm.M360,
        Occupancy.Investment,
        AmortizationType.FullyAmortizing,
      ),
    ).not.toThrow(/No variant for/);
  });

  it("does not filter out matches when programKind and armFixedPeriod are omitted", () => {
    const variant = armVariant(ArmFixedPeriod.M60);
    const p = product("p_opt", [variant]);
    const resolved = resolveVariant(
      p,
      AmortizationTerm.M360,
      Occupancy.Primary,
      AmortizationType.ARM,
    );
    expect(resolved).toBe(variant);
  });
});
