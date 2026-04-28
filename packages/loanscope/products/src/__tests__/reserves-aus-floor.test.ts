import { describe, expect, it } from "vitest";
import {
  Channel,
  LoanPurpose,
  LoanType,
  Occupancy,
  money,
  months,
  type ProductDefinition,
  type ReservesPolicy,
} from "@loanscope/domain";
import { resolveReserveFloor, resolveReserveMonths } from "@loanscope/math";

import { Conforming } from "../agency/conforming";
import { HighBalance } from "../agency/high-balance";
import { HomeReady } from "../agency/fannie/home-ready";
import { ConformingARM, HighBalanceARM } from "../agency/fannie/arm";
import { HomePossible } from "../agency/freddie/home-possible";
import { FreddieConforming } from "../agency/freddie/conforming";
import { FreddieHighBalance } from "../agency/freddie/high-balance";
import { FreddieConformingARM, FreddieHighBalanceARM } from "../agency/freddie/arm";

/**
 * End-to-end pinning of the `ReserveTier.additionalToAus` consumer surface
 * exposed by `@loanscope/math` (`resolveReserveMonths` returns `"AUS"` for
 * the matching tier; `resolveReserveFloor` returns the tier's months as a
 * floor over the upstream AUS finding).
 *
 * No agency product currently uses `additionalToAus: true` — D2 explicitly
 * kept agency leaf products on `AUSDetermined` until the consumer shipped.
 * This test constructs a synthetic product whose `baseConstraints.reservesPolicy`
 * exercises the dual semantic, and verifies the contract through the same
 * `requireTieredPolicy` extraction path the per-product reserves tests use.
 *
 * Migrating real agency investment products to `Tiered + additionalToAus`
 * (e.g. "AUS-determined for owner-occupied + 6-month floor for investment")
 * is a separate enhancement; this test only pins the math + product seam so
 * any such migration can lean on a known-green contract.
 */

const requireTieredPolicy = (
  product: ProductDefinition,
): Extract<ReservesPolicy, { kind: "Tiered" }> => {
  const policy = product.baseConstraints?.reservesPolicy;
  if (!policy) {
    throw new Error(`${product.id} is missing baseConstraints.reservesPolicy`);
  }
  if (policy.kind !== "Tiered") {
    throw new Error(`${product.id} reservesPolicy is ${policy.kind}; expected Tiered`);
  }
  return policy;
};

/**
 * Synthetic agency-style product whose reserves policy mixes:
 *  - owner-occupied tiers that resolve to the `"AUS"` sentinel with no
 *    floor (no `additionalToAus`),
 *  - an investment tier that defers to AUS but publishes a 6-month floor
 *    via `additionalToAus: true`.
 *
 * The product's other fields are deliberately minimal — this fixture
 * exists only to prove the `additionalToAus` semantic round-trips through
 * `baseConstraints.reservesPolicy` into the math layer.
 */
const SYNTHETIC_PRODUCT: ProductDefinition = {
  id: "synthetic_aus_floor",
  name: "Synthetic AUS+Floor",
  loanType: LoanType.Conventional,
  channel: Channel.Agency,
  variants: [],
  baseConstraints: {
    reservesPolicy: {
      kind: "Tiered",
      tiers: [
        {
          loanAmount: { min: money(0), max: money(1_000_000) },
          occupancies: [Occupancy.Primary, Occupancy.Secondary],
          months: months(0),
        },
        {
          loanAmount: { min: money(0), max: money(1_000_000) },
          occupancies: [Occupancy.Investment],
          additionalToAus: true,
          months: months(6),
        },
      ],
    },
  },
};

describe("Tiered+additionalToAus end-to-end through a product's reservesPolicy", () => {
  const policy = requireTieredPolicy(SYNTHETIC_PRODUCT);

  it("declares both an AUS-passthrough tier and an AUS-with-floor tier", () => {
    expect(policy.tiers).toHaveLength(2);
    const investmentTier = policy.tiers.find((t) => t.occupancies?.includes(Occupancy.Investment));
    expect(investmentTier?.additionalToAus).toBe(true);
    expect(Number(investmentTier?.months ?? 0)).toBe(6);
  });

  it("owner-occupied lookup resolves to 0 months (no floor, no AUS deferral)", () => {
    // The Primary/Secondary tier carries `months: 0` and no `additionalToAus`;
    // resolveReserveMonths returns the literal 0 (NOT "AUS") and the floor is 0.
    const resolved = resolveReserveMonths(
      policy,
      money(500_000),
      Occupancy.Primary,
      LoanPurpose.Purchase,
    );
    expect(resolved).toBe(0);

    const floor = resolveReserveFloor(
      policy,
      money(500_000),
      Occupancy.Primary,
      LoanPurpose.Purchase,
    );
    expect(Number(floor)).toBe(0);
  });

  it("investment lookup defers to AUS for resolveReserveMonths and publishes a 6-month floor", () => {
    const resolved = resolveReserveMonths(
      policy,
      money(500_000),
      Occupancy.Investment,
      LoanPurpose.Purchase,
    );
    expect(resolved).toBe("AUS");

    const floor = resolveReserveFloor(
      policy,
      money(500_000),
      Occupancy.Investment,
      LoanPurpose.Purchase,
    );
    expect(Number(floor)).toBe(6);
  });

  it("investment lookup at a loan amount above the tier's max returns 0 from both functions", () => {
    const resolved = resolveReserveMonths(
      policy,
      money(2_000_000),
      Occupancy.Investment,
      LoanPurpose.Purchase,
    );
    const floor = resolveReserveFloor(
      policy,
      money(2_000_000),
      Occupancy.Investment,
      LoanPurpose.Purchase,
    );
    expect(Number(resolved as number)).toBe(0);
    expect(Number(floor)).toBe(0);
  });

  it("layering rule (consumer simulation): max(ausFinding, floor) selects the larger value", () => {
    // Mirrors the calculations/edges/reserves.ts edge: when
    // resolveReserveMonths returns "AUS" the consumer reads the AUS
    // finding and applies max(ausFinding, floor). Pinned here so the
    // semantic is verifiable from the products package without spinning
    // up the full edge harness.
    const floor = resolveReserveFloor(
      policy,
      money(500_000),
      Occupancy.Investment,
      LoanPurpose.Purchase,
    );

    const ausBelowFloor = 2;
    const ausAboveFloor = 9;
    expect(Math.max(ausBelowFloor, Number(floor))).toBe(6);
    expect(Math.max(ausAboveFloor, Number(floor))).toBe(9);
  });
});

describe("agency leaf products do NOT yet use additionalToAus (regression guard)", () => {
  // D2 chose to keep agency products on AUSDetermined until the consumer
  // shipped. With the consumer now in place, migrating them is a separate
  // enhancement. This guard documents the current state and will fail
  // (intentionally) when an agency product is migrated to Tiered, at
  // which point this assertion should be relaxed in lockstep with the
  // migration PR.
  const agencyProducts: ReadonlyArray<readonly [string, ProductDefinition]> = [
    ["Conforming", Conforming],
    ["HighBalance", HighBalance],
    ["HomeReady", HomeReady],
    ["ConformingARM", ConformingARM],
    ["HighBalanceARM", HighBalanceARM],
    ["HomePossible", HomePossible],
    ["FreddieConforming", FreddieConforming],
    ["FreddieHighBalance", FreddieHighBalance],
    ["FreddieConformingARM", FreddieConformingARM],
    ["FreddieHighBalanceARM", FreddieHighBalanceARM],
  ];

  it("no agency leaf product currently declares a Tiered+additionalToAus tier", () => {
    for (const [name, product] of agencyProducts) {
      const policy = product.baseConstraints?.reservesPolicy;
      if (!policy || policy.kind !== "Tiered") continue;
      const offending = policy.tiers.find((t) => t.additionalToAus === true);
      expect(
        offending,
        `${name} (${product.id}) now declares a Tiered+additionalToAus tier; relax this guard in lockstep with the migration PR.`,
      ).toBeUndefined();
    }
  });
});
