import { describe, expect, it } from "vitest";
import { JumboPink } from "../uwm/jumbo";
import { PrimeJumbo } from "../uwm/prime-jumbo";
import { PortfolioBase } from "../channels/portfolio";

/**
 * Jumbo tier refinement — Jumbo tier refinement.
 *
 * These tests pin the per-band loan-amount envelopes for UWM Jumbo Pink and
 * Prime Jumbo, and the tightened PortfolioBase defaults. Per-occupancy detail
 * for each tier is documented in `notes` because `LoanAmountTier` only carries
 * a single envelope per band; variant-level constraints continue to enforce
 * occupancy-specific narrowing.
 */

describe("UWM Jumbo Pink tiers", () => {
  const tiers = JumboPink.tiers ?? [];

  it("defines exactly 4 loan-amount tiers", () => {
    expect(tiers.length).toBe(4);
  });

  it("Tier A spans $766,550-$1.0M with primary 90% LTV / 700 FICO", () => {
    const tierA = tiers[0];
    expect(tierA).toBeDefined();
    expect(Number(tierA!.range.min)).toBe(766550);
    expect(Number(tierA!.range.max)).toBe(1000000);
    expect(tierA!.minFico).toBe(700);
    expect(Number(tierA!.maxLTVRatio)).toBeCloseTo(0.9, 10);
    expect(tierA!.notes).toMatch(/secondary 80% \/ 720/);
    expect(tierA!.notes).toMatch(/investment 75% \/ 740/);
  });

  it("Tier B spans $1.0M-$1.5M with tightened 85% LTV / 720 FICO envelope", () => {
    const tierB = tiers[1];
    expect(tierB).toBeDefined();
    expect(Number(tierB!.range.min)).toBe(1000000);
    expect(Number(tierB!.range.max)).toBe(1500000);
    expect(tierB!.minFico).toBe(720);
    expect(Number(tierB!.maxLTVRatio)).toBeCloseTo(0.85, 10);
    expect(tierB!.notes).toMatch(/secondary 75% \/ 740/);
    expect(tierB!.notes).toMatch(/investment 70% \/ 760/);
  });

  it("Tier C spans $1.5M-$2.0M with 80% LTV / 740 FICO and tighter occupancy floors", () => {
    const tierC = tiers[2];
    expect(tierC).toBeDefined();
    expect(Number(tierC!.range.min)).toBe(1500000);
    expect(Number(tierC!.range.max)).toBe(2000000);
    expect(tierC!.minFico).toBe(740);
    expect(Number(tierC!.maxLTVRatio)).toBeCloseTo(0.8, 10);
    expect(tierC!.notes).toMatch(/secondary 70% \/ 760/);
    expect(tierC!.notes).toMatch(/investment 65% \/ 760/);
  });

  it("Tier D spans $2.0M-$3.0M and excludes investment occupancy", () => {
    const tierD = tiers[3];
    expect(tierD).toBeDefined();
    expect(Number(tierD!.range.min)).toBe(2000000);
    expect(Number(tierD!.range.max)).toBe(3000000);
    expect(tierD!.minFico).toBe(760);
    expect(Number(tierD!.maxLTVRatio)).toBeCloseTo(0.75, 10);
    expect(tierD!.notes).toMatch(/investment ineligible/);
  });

  it("FICO floors progress monotonically tighter from Tier A to Tier D", () => {
    const ficoFloors = tiers.map((t) => t.minFico ?? 0);
    for (let i = 1; i < ficoFloors.length; i += 1) {
      const prev = ficoFloors[i - 1] ?? 0;
      const cur = ficoFloors[i] ?? 0;
      expect(cur).toBeGreaterThanOrEqual(prev);
    }
    const ltvCeilings = tiers.map((t) => Number(t.maxLTVRatio ?? 0));
    for (let i = 1; i < ltvCeilings.length; i += 1) {
      const prev = ltvCeilings[i - 1] ?? 0;
      const cur = ltvCeilings[i] ?? 0;
      expect(cur).toBeLessThanOrEqual(prev);
    }
  });

  it("tier ordering is monotonic by loanAmount.min", () => {
    const mins = tiers.map((t) => Number(t.range.min ?? 0));
    for (let i = 1; i < mins.length; i += 1) {
      const prev = mins[i - 1] ?? 0;
      const cur = mins[i] ?? 0;
      expect(cur).toBeGreaterThan(prev);
    }
  });
});

describe("Prime Jumbo tiers", () => {
  const tiers = PrimeJumbo.tiers ?? [];

  it("defines exactly 3 loan-amount tiers", () => {
    expect(tiers.length).toBe(3);
  });

  it("Tier A spans $766,550-$1.5M with primary 89% LTV / 740 FICO", () => {
    const tierA = tiers[0];
    expect(tierA).toBeDefined();
    expect(Number(tierA!.range.min)).toBe(766550);
    expect(Number(tierA!.range.max)).toBe(1500000);
    expect(tierA!.minFico).toBe(740);
    expect(Number(tierA!.maxLTVRatio)).toBeCloseTo(0.89, 10);
    expect(tierA!.notes).toMatch(/secondary 80% \/ 760/);
    expect(tierA!.notes).toMatch(/investment 75% \/ 760/);
  });

  it("Tier B spans $1.5M-$2.5M with 80% LTV / 760 FICO and tighter occupancy floors", () => {
    const tierB = tiers[1];
    expect(tierB).toBeDefined();
    expect(Number(tierB!.range.min)).toBe(1500000);
    expect(Number(tierB!.range.max)).toBe(2500000);
    expect(tierB!.minFico).toBe(760);
    expect(Number(tierB!.maxLTVRatio)).toBeCloseTo(0.8, 10);
    expect(tierB!.notes).toMatch(/secondary 70% \/ 760/);
    expect(tierB!.notes).toMatch(/investment 65% \/ 760/);
  });

  it("Tier C spans $2.5M-$3.0M, 70% primary LTV, and excludes investment", () => {
    const tierC = tiers[2];
    expect(tierC).toBeDefined();
    expect(Number(tierC!.range.min)).toBe(2500000);
    expect(Number(tierC!.range.max)).toBe(3000000);
    expect(tierC!.minFico).toBe(760);
    expect(Number(tierC!.maxLTVRatio)).toBeCloseTo(0.7, 10);
    expect(tierC!.notes).toMatch(/investment ineligible/);
  });

  it("tier ordering is monotonic and LTV ceilings tighten across bands", () => {
    const mins = tiers.map((t) => Number(t.range.min ?? 0));
    for (let i = 1; i < mins.length; i += 1) {
      const prev = mins[i - 1] ?? 0;
      const cur = mins[i] ?? 0;
      expect(cur).toBeGreaterThan(prev);
    }
    const ltvCeilings = tiers.map((t) => Number(t.maxLTVRatio ?? 0));
    for (let i = 1; i < ltvCeilings.length; i += 1) {
      const prev = ltvCeilings[i - 1] ?? 0;
      const cur = ltvCeilings[i] ?? 0;
      expect(cur).toBeLessThanOrEqual(prev);
    }
  });
});

describe("PortfolioBase defaults", () => {
  const base = PortfolioBase.baseConstraints;

  it("enforces minFico of 700 as the absolute portfolio/jumbo floor", () => {
    expect(base).toBeDefined();
    expect(base!.minFico).toBe(700);
  });

  it("tightens maxDTIRatio to 0.43 and maxLoanAmount to $3M (Jumbo tier refinement)", () => {
    expect(base).toBeDefined();
    expect(Number(base!.maxDTIRatio)).toBeCloseTo(0.43, 10);
    expect(Number(base!.maxLoanAmount)).toBe(3000000);
  });
});
