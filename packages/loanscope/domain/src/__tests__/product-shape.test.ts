import { describe, expect, it } from "vitest";
import * as DomainExports from "../index";
import {
  AmortizationType,
  Channel,
  LoanPurpose,
  LoanType,
  Occupancy,
  ProgramKind,
  PropertyType,
  money,
  ratio,
} from "../index";
import type {
  LoanAmountTier,
  OccupancyConstraints,
  ProductDefinition,
  ProductVariant,
  ProgramRules,
} from "../index";

/**
 * Sanity coverage for the deprecated-symbol removal sweep that landed
 * alongside the engine `incomePolicies` / `borrowerBlendPolicy` wiring
 * fix.
 *
 * The TypeScript type system is the real guarantee that the removed
 * shapes are gone (a regression that re-adds `baseRules` or
 * `baseProductId` to `ProductDefinition`, or that re-introduces an
 * `OccupancyRuleOverride` / `ProductTierOverride` interface, would be
 * caught at compile time by every consumer that switched to the
 * canonical replacements). These tests pin the migration in two
 * complementary ways:
 *
 *   1. They construct a minimal `ProductDefinition` using only the
 *      canonical replacement shapes (`OccupancyConstraints`,
 *      `LoanAmountTier`, `baseConstraints`, `extends`) and assert that
 *      the resulting object carries no residual keys named after the
 *      removed fields. A future revert that re-adds `baseRules` or
 *      `baseProductId` would force this fixture (and every product in
 *      the catalog) to grow a new field; this test makes that drift
 *      visible at the domain layer.
 *
 *   2. They snapshot the names exported from `@loanscope/domain` and
 *      assert that the four removed interface names
 *      (`OccupancyRuleOverride`, `OccupancyRuleOverrideResolved`,
 *      `ProductTierOverride`, `ProductTierOverrideResolved`) do not
 *      reappear at runtime. Type-only exports are erased by the
 *      compiler so this check is a defensive companion to the
 *      compile-time guarantee, not a substitute for it.
 *
 * The intent is that a maintainer reading these tests sees the
 * canonical replacement names without having to search the diff:
 * `OccupancyConstraints` replaces `OccupancyRuleOverride[Resolved]`,
 * `LoanAmountTier` replaces `ProductTierOverride[Resolved]`,
 * `baseConstraints: Partial<ProgramRules>` replaces
 * `baseRules: ProgramRules`, and `extends: string` replaces
 * `baseProductId: string`.
 */

const REMOVED_PRODUCT_DEFINITION_FIELDS: readonly string[] = ["baseRules", "baseProductId"];

const REMOVED_DOMAIN_EXPORT_NAMES: readonly string[] = [
  "OccupancyRuleOverride",
  "OccupancyRuleOverrideResolved",
  "ProductTierOverride",
  "ProductTierOverrideResolved",
];

/**
 * Build a minimal `ProductDefinition` using only the canonical
 * replacement shapes. Any future re-introduction of `baseRules` or
 * `baseProductId` would either force this fixture to grow new fields
 * (failing the field-presence assertions below) or would diverge from
 * the production catalog (caught by the per-product test sweep).
 */
const buildMinimalProduct = (): ProductDefinition => {
  const occupancyConstraints: OccupancyConstraints = {
    maxLTVRatio: ratio(0.8),
    minFico: 700,
  };

  const variant: ProductVariant = {
    programKind: ProgramKind.Fixed,
    amortization: {
      type: AmortizationType.FullyAmortizing,
      qualifyingPaymentPolicy: { kind: "NotePayment" },
    },
    terms: [360],
    constraints: {
      [Occupancy.Primary]: occupancyConstraints,
      [Occupancy.Secondary]: occupancyConstraints,
      [Occupancy.Investment]: occupancyConstraints,
    },
  };

  const tier: LoanAmountTier = {
    range: { min: money(0), max: money(766550) },
    maxLTVRatio: ratio(0.95),
  };

  const baseConstraints: Partial<ProgramRules> = {
    allowedPurposes: [LoanPurpose.Purchase],
    allowedOccupancies: [Occupancy.Primary],
    allowedPropertyTypes: [PropertyType.SFR],
    maxDTIRatio: ratio(0.5),
  };

  return {
    id: "shape_fixture_child",
    name: "Shape Fixture Child",
    loanType: LoanType.Conventional,
    channel: Channel.Agency,
    extends: "shape_fixture_base",
    variants: [variant],
    tiers: [tier],
    baseConstraints,
  };
};

describe("ProductDefinition shape after deprecated-symbol removal", () => {
  it("the canonical fixture carries no residual baseRules / baseProductId keys", () => {
    const product = buildMinimalProduct();
    const keys = Object.keys(product);
    for (const removed of REMOVED_PRODUCT_DEFINITION_FIELDS) {
      expect(keys).not.toContain(removed);
    }
  });

  it("uses `extends` (string) as the inheritance pointer, not `baseProductId`", () => {
    const product = buildMinimalProduct();
    expect(product.extends).toBe("shape_fixture_base");
    expect("baseProductId" in product).toBe(false);
  });

  it("uses `baseConstraints` (Partial<ProgramRules>) for declared rules, not `baseRules`", () => {
    const product = buildMinimalProduct();
    expect(product.baseConstraints).toBeDefined();
    expect(product.baseConstraints?.allowedPurposes).toEqual([LoanPurpose.Purchase]);
    expect("baseRules" in product).toBe(false);
  });

  it("variants carry per-occupancy `constraints: Record<Occupancy, OccupancyConstraints>` (replaces OccupancyRuleOverride)", () => {
    const product = buildMinimalProduct();
    const variant = product.variants[0];
    expect(variant).toBeDefined();
    if (!variant) throw new Error("Expected at least one variant");

    expect(variant.constraints).toBeDefined();
    const occupancyKeys = Object.keys(variant.constraints).sort();
    expect(occupancyKeys).toEqual(
      [Occupancy.Investment, Occupancy.Primary, Occupancy.Secondary].sort(),
    );

    const primary = variant.constraints[Occupancy.Primary];
    expect(primary).toBeDefined();
    expect(Number(primary.maxLTVRatio)).toBe(0.8);
    expect(primary.minFico).toBe(700);
  });

  it("loan-amount tiers are `LoanAmountTier` records (replaces ProductTierOverride)", () => {
    const product = buildMinimalProduct();
    const tier = product.tiers?.[0];
    expect(tier).toBeDefined();
    if (!tier) throw new Error("Expected at least one tier");

    expect(tier.range.min).toBeDefined();
    expect(tier.range.max).toBeDefined();
    expect(Number(tier.maxLTVRatio)).toBe(0.95);
  });
});

describe("@loanscope/domain runtime exports after deprecated-symbol removal", () => {
  it("does not re-introduce removed type names as runtime exports", () => {
    // Type-only exports are erased by the compiler, so this assertion
    // catches the narrower regression of someone re-adding the names as
    // runtime values (an enum, a const, etc.). The compile-time guarantee
    // — that no consumer can `import type { OccupancyRuleOverride }` —
    // remains the primary contract.
    const exportedNames = Object.keys(DomainExports);
    for (const removed of REMOVED_DOMAIN_EXPORT_NAMES) {
      expect(exportedNames).not.toContain(removed);
    }
  });
});
