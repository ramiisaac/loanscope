import { describe, expect, it } from "vitest";
import { money, ratio } from "@loanscope/domain";
import type { LoanAmountTier } from "@loanscope/domain";
import { findApplicableTier } from "../find-applicable-tier";

const tier = (
  min: number | undefined,
  max: number | undefined,
  maxLTVRatio = 0.8,
): LoanAmountTier => ({
  range: {
    ...(min !== undefined ? { min: money(min) } : {}),
    ...(max !== undefined ? { max: money(max) } : {}),
  },
  maxLTVRatio: ratio(maxLTVRatio),
});

describe("findApplicableTier", () => {
  it("returns undefined for undefined tiers", () => {
    expect(findApplicableTier(undefined, money(500_000))).toBeUndefined();
  });

  it("returns undefined for empty tiers", () => {
    expect(findApplicableTier([], money(500_000))).toBeUndefined();
  });

  it("matches any amount at or above min when upper bound is open", () => {
    const t = tier(1_000_000, undefined);
    expect(findApplicableTier([t], money(1_000_000))).toBe(t);
    expect(findApplicableTier([t], money(10_000_000))).toBe(t);
    expect(findApplicableTier([t], money(999_999))).toBeUndefined();
  });

  it("matches any amount at or below max when lower bound is open", () => {
    const t = tier(undefined, 500_000);
    expect(findApplicableTier([t], money(0))).toBe(t);
    expect(findApplicableTier([t], money(500_000))).toBe(t);
    expect(findApplicableTier([t], money(500_001))).toBeUndefined();
  });

  it("matches every amount when both bounds are open", () => {
    const t = tier(undefined, undefined);
    expect(findApplicableTier([t], money(0))).toBe(t);
    expect(findApplicableTier([t], money(Number.MAX_SAFE_INTEGER))).toBe(t);
  });

  it("returns the first tier that contains the amount on well-ordered non-overlapping tiers", () => {
    const t1 = tier(0, 500_000, 0.9);
    const t2 = tier(500_001, 1_000_000, 0.85);
    const t3 = tier(1_000_001, 2_000_000, 0.8);
    expect(findApplicableTier([t1, t2, t3], money(250_000))).toBe(t1);
    expect(findApplicableTier([t1, t2, t3], money(750_000))).toBe(t2);
    expect(findApplicableTier([t1, t2, t3], money(1_500_000))).toBe(t3);
  });

  it("returns undefined when the amount falls below or above every tier", () => {
    const t1 = tier(100_000, 500_000);
    const t2 = tier(500_001, 1_000_000);
    expect(findApplicableTier([t1, t2], money(50_000))).toBeUndefined();
    expect(findApplicableTier([t1, t2], money(2_000_000))).toBeUndefined();
  });

  it("treats min and max as inclusive boundaries", () => {
    const t = tier(100_000, 200_000);
    expect(findApplicableTier([t], money(100_000))).toBe(t);
    expect(findApplicableTier([t], money(200_000))).toBe(t);
    expect(findApplicableTier([t], money(99_999))).toBeUndefined();
    expect(findApplicableTier([t], money(200_001))).toBeUndefined();
  });

  it("permits adjacent tiers sharing an inclusive boundary; lower tier wins", () => {
    const lower = tier(0, 1_000_000, 0.9);
    const upper = tier(1_000_000, 2_000_000, 0.8);
    expect(findApplicableTier([lower, upper], money(1_000_000))).toBe(lower);
    expect(findApplicableTier([lower, upper], money(1_500_000))).toBe(upper);
  });

  it("accepts a single tier without running validation", () => {
    const t = tier(500_000, 100_000); // nonsensical single-tier range is not validated
    expect(findApplicableTier([t], money(250_000))).toBeUndefined();
  });

  it("throws when consecutive tiers overlap", () => {
    const t1 = tier(0, 1_000_000);
    const t2 = tier(500_000, 2_000_000);
    expect(() => findApplicableTier([t1, t2], money(250_000))).toThrow(/overlap/);
    expect(() => findApplicableTier([t1, t2], money(250_000))).toThrow(/1000000/);
    expect(() => findApplicableTier([t1, t2], money(250_000))).toThrow(/500000/);
  });

  it("throws when a later tier is nested inside an earlier tier", () => {
    const outer = tier(0, 2_000_000);
    const inner = tier(500_000, 1_000_000);
    expect(() => findApplicableTier([outer, inner], money(250_000))).toThrow(/overlap/);
  });

  it("throws when tiers are not ascending by min", () => {
    const t1 = tier(1_000_001, 2_000_000);
    const t2 = tier(0, 1_000_000);
    expect(() => findApplicableTier([t1, t2], money(250_000))).toThrow(/ascending/);
  });

  it("does not mutate the input array", () => {
    const t1 = tier(0, 500_000);
    const t2 = tier(500_001, 1_000_000);
    const input = [t1, t2];
    const snapshot = [...input];
    findApplicableTier(input, money(750_000));
    expect(input).toEqual(snapshot);
    expect(input[0]).toBe(t1);
    expect(input[1]).toBe(t2);
  });
});
