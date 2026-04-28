import { describe, expect, it } from "vitest";
import { LoanPurpose, Occupancy } from "@loanscope/domain";
import type { ProgramRules } from "@loanscope/domain";
import { mergeRules } from "../merge-rules";
import { toProgramRules } from "../to-program-rules";
import { mergeOptional, mergeRecord, setIfDefined } from "../merge-primitives";

const baseRules = (): ProgramRules => ({
  allowedPurposes: [LoanPurpose.Purchase, LoanPurpose.RateTermRefi],
  allowedOccupancies: [Occupancy.Primary],
});

describe("mergeRules", () => {
  it("override fields take precedence when defined", () => {
    const base = baseRules();
    const merged = mergeRules(base, {
      allowedPurposes: [LoanPurpose.Purchase],
    });
    expect(merged.allowedPurposes).toEqual([LoanPurpose.Purchase]);
    // Base field preserved when override does not declare it.
    expect(merged.allowedOccupancies).toEqual([Occupancy.Primary]);
  });

  it("merges maxLtvByOccupancy key-by-key", () => {
    const base: ProgramRules = {
      ...baseRules(),
      maxLtvByOccupancy: { [Occupancy.Primary]: 0.95 as never },
    };
    const merged = mergeRules(base, {
      maxLtvByOccupancy: { [Occupancy.Investment]: 0.75 as never },
    });
    expect(merged.maxLtvByOccupancy).toEqual({
      [Occupancy.Primary]: 0.95,
      [Occupancy.Investment]: 0.75,
    });
  });

  it("does not introduce undefined fields for unset optionals", () => {
    const merged = mergeRules(baseRules(), {});
    expect("minFico" in merged).toBe(false);
    expect("maxLoanAmount" in merged).toBe(false);
  });
});

describe("toProgramRules", () => {
  it("throws on missing required fields", () => {
    expect(() => toProgramRules({}, "test")).toThrow(/missing required fields/);
  });

  it("copies optional fields through only when defined", () => {
    const normalized = toProgramRules(baseRules(), "test");
    expect(normalized.allowedPurposes).toEqual([LoanPurpose.Purchase, LoanPurpose.RateTermRefi]);
    expect("minFico" in normalized).toBe(false);
  });
});

describe("merge primitives", () => {
  it("mergeRecord returns undefined when both sides are absent", () => {
    expect(mergeRecord(undefined, undefined)).toBeUndefined();
  });

  it("mergeRecord prefers override keys", () => {
    expect(mergeRecord({ a: 1 }, { a: 2, b: 3 })).toEqual({ a: 2, b: 3 });
  });

  it("mergeOptional preserves reference identity when one side is undefined", () => {
    const base = { x: 1 };
    expect(mergeOptional(base, undefined)).toBe(base);
    expect(mergeOptional(undefined, base)).toBe(base);
  });

  it("setIfDefined is a no-op for undefined", () => {
    let called = false;
    setIfDefined(undefined, () => {
      called = true;
    });
    expect(called).toBe(false);
  });

  it("setIfDefined invokes the setter for defined values", () => {
    let captured: number | null = null;
    setIfDefined(42, (v) => {
      captured = v;
    });
    expect(captured).toBe(42);
  });
});
