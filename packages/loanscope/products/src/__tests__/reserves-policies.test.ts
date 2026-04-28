import { describe, expect, it } from "vitest";
import {
  LoanPurpose,
  Occupancy,
  money,
  type ProductDefinition,
  type ReservesPolicy,
} from "@loanscope/domain";
import { resolveReserveMonths } from "@loanscope/math";

import { JumboPink } from "../uwm/jumbo";
import { PrimeJumbo, PrimeJumboMax } from "../uwm/prime-jumbo";
import { PortfolioBase } from "../channels/portfolio";
import { Conforming } from "../agency/conforming";
import { HighBalance } from "../agency/high-balance";
import { HomeReady } from "../agency/fannie/home-ready";
import { ConformingARM, HighBalanceARM } from "../agency/fannie/arm";
import { HomePossible } from "../agency/freddie/home-possible";
import { FreddieConforming } from "../agency/freddie/conforming";
import { FreddieHighBalance } from "../agency/freddie/high-balance";
import { FreddieConformingARM, FreddieHighBalanceARM } from "../agency/freddie/arm";

/**
 * Explicit reserves-policy refinement — Per-product reserves tables.
 *
 * Pins the reserves policy surface for jumbo color/Prime Jumbo, the
 * portfolio backstop default, and explicit AUSDetermined floors on agency
 * leaf products. Each tier is verified end-to-end through
 * `resolveReserveMonths` so the data and the math layer agree.
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

describe("UWM Jumbo Pink reserves", () => {
  const policy = requireTieredPolicy(JumboPink);

  it("declares 11 occupancy-aware tiers (4 bands x 3 occupancies, minus investment in tier D)", () => {
    expect(policy.tiers.length).toBe(11);
  });

  it("Tier A primary at $900K resolves to 6 months reserves", () => {
    const resolved = resolveReserveMonths(
      policy,
      money(900_000),
      Occupancy.Primary,
      LoanPurpose.Purchase,
    );
    expect(resolved).toBe(6);
  });

  it("Tier A investment at $900K resolves to 12 months reserves", () => {
    const resolved = resolveReserveMonths(
      policy,
      money(900_000),
      Occupancy.Investment,
      LoanPurpose.Purchase,
    );
    expect(resolved).toBe(12);
  });

  it("primary reserves progress 6 -> 9 -> 12 -> 18 across tiers A/B/C/D", () => {
    const sample = (loanAmount: number): number | "AUS" =>
      resolveReserveMonths(policy, money(loanAmount), Occupancy.Primary, LoanPurpose.Purchase);
    expect(sample(900_000)).toBe(6);
    expect(sample(1_250_000)).toBe(9);
    expect(sample(1_750_000)).toBe(12);
    expect(sample(2_500_000)).toBe(18);
  });

  it("second-home reserves progress 9 -> 12 -> 15 -> 24 across tiers A/B/C/D", () => {
    const sample = (loanAmount: number): number | "AUS" =>
      resolveReserveMonths(policy, money(loanAmount), Occupancy.Secondary, LoanPurpose.Purchase);
    expect(sample(900_000)).toBe(9);
    expect(sample(1_250_000)).toBe(12);
    expect(sample(1_750_000)).toBe(15);
    expect(sample(2_500_000)).toBe(24);
  });

  it("excludes investment occupancy above $2M (tier D — falls through to 0)", () => {
    const resolved = resolveReserveMonths(
      policy,
      money(2_500_000),
      Occupancy.Investment,
      LoanPurpose.Purchase,
    );
    expect(resolved).toBe(0);
  });

  it("does not declare any investment tier with min above $2M", () => {
    const investmentTiers = policy.tiers.filter((t) =>
      t.occupancies?.includes(Occupancy.Investment),
    );
    for (const tier of investmentTiers) {
      const min = tier.loanAmount.min ?? 0;
      expect(min).toBeLessThanOrEqual(1_500_000);
    }
  });
});

describe("Prime Jumbo reserves", () => {
  const primeJumboPolicy = requireTieredPolicy(PrimeJumbo);
  const primeJumboMaxPolicy = requireTieredPolicy(PrimeJumboMax);

  it("PrimeJumbo and PrimeJumboMax share the same tier shape (8 tiers each)", () => {
    expect(primeJumboPolicy.tiers.length).toBe(8);
    expect(primeJumboMaxPolicy.tiers.length).toBe(8);
  });

  it("Tier A: $1M primary=9, secondary=12, investment=15", () => {
    const at = (occ: Occupancy): number | "AUS" =>
      resolveReserveMonths(primeJumboPolicy, money(1_000_000), occ, LoanPurpose.Purchase);
    expect(at(Occupancy.Primary)).toBe(9);
    expect(at(Occupancy.Secondary)).toBe(12);
    expect(at(Occupancy.Investment)).toBe(15);
  });

  it("Tier B: $2M primary=12, secondary=18, investment=24", () => {
    const at = (occ: Occupancy): number | "AUS" =>
      resolveReserveMonths(primeJumboPolicy, money(2_000_000), occ, LoanPurpose.Purchase);
    expect(at(Occupancy.Primary)).toBe(12);
    expect(at(Occupancy.Secondary)).toBe(18);
    expect(at(Occupancy.Investment)).toBe(24);
  });

  it("Tier C: $2.75M primary=18, secondary=24, investment excluded (0)", () => {
    const at = (occ: Occupancy): number | "AUS" =>
      resolveReserveMonths(primeJumboPolicy, money(2_750_000), occ, LoanPurpose.Purchase);
    expect(at(Occupancy.Primary)).toBe(18);
    expect(at(Occupancy.Secondary)).toBe(24);
    expect(at(Occupancy.Investment)).toBe(0);
  });

  it("PrimeJumboMax resolves identically to PrimeJumbo at the Tier B boundary", () => {
    const at = (
      policy: Extract<ReservesPolicy, { kind: "Tiered" }>,
      occ: Occupancy,
    ): number | "AUS" => resolveReserveMonths(policy, money(1_750_000), occ, LoanPurpose.Purchase);
    for (const occ of [Occupancy.Primary, Occupancy.Secondary, Occupancy.Investment]) {
      expect(at(primeJumboMaxPolicy, occ)).toBe(at(primeJumboPolicy, occ));
    }
  });

  it("declares no investment tier whose min is at or above $2.5M", () => {
    const investmentTiers = primeJumboPolicy.tiers.filter((t) =>
      t.occupancies?.includes(Occupancy.Investment),
    );
    for (const tier of investmentTiers) {
      const min = tier.loanAmount.min ?? 0;
      expect(min).toBeLessThan(2_500_000);
    }
  });
});

describe("PortfolioBase reserves backstop", () => {
  it("declares a FixedMonths backstop default", () => {
    const policy = PortfolioBase.baseConstraints?.reservesPolicy;
    expect(policy).toBeDefined();
    expect(policy?.kind).toBe("FixedMonths");
  });

  it("backstop floor is exactly 6 months", () => {
    const policy = PortfolioBase.baseConstraints?.reservesPolicy;
    if (!policy || policy.kind !== "FixedMonths") {
      throw new Error("PortfolioBase reservesPolicy must be FixedMonths");
    }
    expect(Number(policy.months)).toBe(6);
  });

  it("resolves to 6 months for any loan amount / occupancy / purpose", () => {
    const policy = PortfolioBase.baseConstraints?.reservesPolicy;
    if (!policy) throw new Error("PortfolioBase reservesPolicy missing");
    const resolved = resolveReserveMonths(
      policy,
      money(1_500_000),
      Occupancy.Investment,
      LoanPurpose.CashOutRefi,
    );
    expect(resolved).toBe(6);
  });
});

describe("Agency products reserves", () => {
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

  it("every agency leaf product declares an explicit reservesPolicy", () => {
    for (const [name, product] of agencyProducts) {
      expect(
        product.baseConstraints?.reservesPolicy,
        `${name} (${product.id}) is missing baseConstraints.reservesPolicy`,
      ).toBeDefined();
    }
  });

  it("every agency leaf product carries AUSDetermined at the leaf surface", () => {
    for (const [name, product] of agencyProducts) {
      const policy = product.baseConstraints?.reservesPolicy;
      expect(policy, `${name} reservesPolicy must be defined`).toBeDefined();
      expect(policy?.kind, `${name} (${product.id}) must declare AUSDetermined explicitly`).toBe(
        "AUSDetermined",
      );
    }
  });

  it("AUSDetermined products resolve to the 'AUS' sentinel for any inputs", () => {
    for (const [, product] of agencyProducts) {
      const policy = product.baseConstraints?.reservesPolicy;
      if (!policy) continue;
      const resolved = resolveReserveMonths(
        policy,
        money(500_000),
        Occupancy.Primary,
        LoanPurpose.Purchase,
      );
      expect(resolved).toBe("AUS");
    }
  });
});
