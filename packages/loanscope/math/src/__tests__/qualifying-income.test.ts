import { describe, expect, it } from "vitest";
import {
  IncomeType,
  money,
  ratio,
  type IncomeStream,
  type ProgramIncomePolicies,
  type QualifyingIncomePolicy,
} from "@loanscope/domain";
import {
  applyQualifyingIncomePolicy,
  calculateSubjectRentalIncome,
  defaultPolicyForIncomeType,
  resolveQualifyingPolicy,
  sumQualifyingIncomeWithPolicies,
} from "../qualifying-income";

const stream = (
  overrides: Partial<IncomeStream> & Pick<IncomeStream, "type" | "monthlyAmount">,
): IncomeStream => ({
  id: overrides.id ?? "i1",
  borrowerId: overrides.borrowerId ?? "b1",
  type: overrides.type,
  monthlyAmount: overrides.monthlyAmount,
  ...(overrides.qualifying !== undefined ? { qualifying: overrides.qualifying } : {}),
  ...(overrides.qualifyingPolicy !== undefined
    ? { qualifyingPolicy: overrides.qualifyingPolicy }
    : {}),
  ...(overrides.historicalAmounts !== undefined
    ? { historicalAmounts: [...overrides.historicalAmounts] }
    : {}),
});

describe("applyQualifyingIncomePolicy", () => {
  describe("AsStated", () => {
    it("returns the stream's monthly amount unchanged", () => {
      const s = stream({ type: IncomeType.W2, monthlyAmount: money(7321.45) });
      const result = applyQualifyingIncomePolicy(s, { kind: "AsStated" });
      expect(Number(result)).toBeCloseTo(7321.45, 2);
    });
  });

  describe("AveragedMonths", () => {
    it("averages historical amounts over the lookback window", () => {
      const s = stream({
        type: IncomeType.SelfEmployed,
        monthlyAmount: money(0),
      });
      const policy: QualifyingIncomePolicy = {
        kind: "AveragedMonths",
        monthsLookback: 24,
        historicalAmounts: Array.from({ length: 24 }, (_, i) => 6000 + i * 100),
      };
      // sum = 24*6000 + 100*(0+1+...+23) = 144000 + 27600 = 171600; /24 = 7150
      const result = applyQualifyingIncomePolicy(s, policy);
      expect(Number(result)).toBeCloseTo(7150, 2);
    });

    it("rounds to whole cents", () => {
      const s = stream({
        type: IncomeType.SelfEmployed,
        monthlyAmount: money(0),
      });
      const result = applyQualifyingIncomePolicy(s, {
        kind: "AveragedMonths",
        monthsLookback: 3,
        historicalAmounts: [100, 100, 101], // 301/3 = 100.3333...
      });
      expect(Number(result)).toBeCloseTo(100.33, 2);
    });

    it("throws RangeError when monthsLookback <= 0", () => {
      const s = stream({
        type: IncomeType.SelfEmployed,
        monthlyAmount: money(0),
      });
      expect(() =>
        applyQualifyingIncomePolicy(s, {
          kind: "AveragedMonths",
          monthsLookback: 0,
          historicalAmounts: [1000],
        }),
      ).toThrow(RangeError);
      expect(() =>
        applyQualifyingIncomePolicy(s, {
          kind: "AveragedMonths",
          monthsLookback: -3,
          historicalAmounts: [1000],
        }),
      ).toThrow(RangeError);
    });

    it("throws RangeError when historicalAmounts is empty", () => {
      const s = stream({
        type: IncomeType.SelfEmployed,
        monthlyAmount: money(0),
      });
      expect(() =>
        applyQualifyingIncomePolicy(s, {
          kind: "AveragedMonths",
          monthsLookback: 24,
          historicalAmounts: [],
        }),
      ).toThrow(RangeError);
    });
  });

  describe("RentalGross", () => {
    it("applies the default 25% vacancy factor when none supplied", () => {
      const s = stream({ type: IncomeType.Rental, monthlyAmount: money(0) });
      const result = applyQualifyingIncomePolicy(s, {
        kind: "RentalGross",
        grossRent: money(4000),
      });
      expect(Number(result)).toBeCloseTo(3000, 2);
    });

    it("respects an explicit vacancy factor", () => {
      const s = stream({ type: IncomeType.Rental, monthlyAmount: money(0) });
      const result = applyQualifyingIncomePolicy(s, {
        kind: "RentalGross",
        grossRent: money(4000),
        vacancyFactor: ratio(0.1),
      });
      expect(Number(result)).toBeCloseTo(3600, 2);
    });

    it("supports a zero vacancy factor (full gross)", () => {
      const s = stream({ type: IncomeType.Rental, monthlyAmount: money(0) });
      const result = applyQualifyingIncomePolicy(s, {
        kind: "RentalGross",
        grossRent: money(2500),
        vacancyFactor: ratio(0),
      });
      expect(Number(result)).toBeCloseTo(2500, 2);
    });
  });

  describe("PercentOfStated", () => {
    it("multiplies monthlyAmount by the factor", () => {
      const s = stream({ type: IncomeType.Bonus, monthlyAmount: money(2000) });
      const result = applyQualifyingIncomePolicy(s, {
        kind: "PercentOfStated",
        factor: ratio(0.75),
      });
      expect(Number(result)).toBeCloseTo(1500, 2);
    });

    it("returns 0 when factor is 0", () => {
      const s = stream({ type: IncomeType.RSU, monthlyAmount: money(2000) });
      const result = applyQualifyingIncomePolicy(s, {
        kind: "PercentOfStated",
        factor: ratio(0),
      });
      expect(Number(result)).toBe(0);
    });

    it("returns face value when factor is 1", () => {
      const s = stream({ type: IncomeType.W2, monthlyAmount: money(8000) });
      const result = applyQualifyingIncomePolicy(s, {
        kind: "PercentOfStated",
        factor: ratio(1),
      });
      expect(Number(result)).toBeCloseTo(8000, 2);
    });
  });
});

describe("defaultPolicyForIncomeType", () => {
  it("uses AsStated for W2", () => {
    expect(defaultPolicyForIncomeType(IncomeType.W2)).toEqual({
      kind: "AsStated",
    });
  });

  it("uses AsStated for SocialSecurity", () => {
    expect(defaultPolicyForIncomeType(IncomeType.SocialSecurity)).toEqual({
      kind: "AsStated",
    });
  });

  it("uses AsStated for Pension", () => {
    expect(defaultPolicyForIncomeType(IncomeType.Pension)).toEqual({
      kind: "AsStated",
    });
  });

  it("uses AsStated for Alimony", () => {
    expect(defaultPolicyForIncomeType(IncomeType.Alimony)).toEqual({
      kind: "AsStated",
    });
  });

  it("uses AsStated for ChildSupport", () => {
    expect(defaultPolicyForIncomeType(IncomeType.ChildSupport)).toEqual({
      kind: "AsStated",
    });
  });

  it("uses PercentOfStated factor=1 for SelfEmployed (averaging deferred to product layer)", () => {
    const policy = defaultPolicyForIncomeType(IncomeType.SelfEmployed);
    expect(policy.kind).toBe("PercentOfStated");
    if (policy.kind === "PercentOfStated") {
      expect(Number(policy.factor)).toBe(1);
    }
  });

  it("uses PercentOfStated factor=1 for Bonus", () => {
    const policy = defaultPolicyForIncomeType(IncomeType.Bonus);
    expect(policy.kind).toBe("PercentOfStated");
    if (policy.kind === "PercentOfStated") {
      expect(Number(policy.factor)).toBe(1);
    }
  });

  it("uses PercentOfStated factor=1 for RSU", () => {
    const policy = defaultPolicyForIncomeType(IncomeType.RSU);
    expect(policy.kind).toBe("PercentOfStated");
    if (policy.kind === "PercentOfStated") {
      expect(Number(policy.factor)).toBe(1);
    }
  });

  it("uses PercentOfStated factor=0.75 for Rental", () => {
    const policy = defaultPolicyForIncomeType(IncomeType.Rental);
    expect(policy.kind).toBe("PercentOfStated");
    if (policy.kind === "PercentOfStated") {
      expect(Number(policy.factor)).toBeCloseTo(0.75, 6);
    }
  });
});

describe("defaultPolicyForIncomeType with programOverrides", () => {
  it("returns the program override when one is supplied for the requested type", () => {
    const overrides: ProgramIncomePolicies = {
      perIncomeType: {
        [IncomeType.SelfEmployed]: {
          kind: "AveragedMonths",
          monthsLookback: 24,
          historicalAmounts: Array.from({ length: 24 }, () => 5000),
        },
      },
    };
    const policy = defaultPolicyForIncomeType(IncomeType.SelfEmployed, overrides);
    expect(policy.kind).toBe("AveragedMonths");
    if (policy.kind === "AveragedMonths") {
      expect(policy.monthsLookback).toBe(24);
      expect(policy.historicalAmounts).toHaveLength(24);
    }
  });

  it("falls back to the built-in default when no overrides are supplied", () => {
    expect(defaultPolicyForIncomeType(IncomeType.W2)).toEqual({
      kind: "AsStated",
    });
  });

  it("returns the Rental override (factor 0.75) when supplied", () => {
    const overrides: ProgramIncomePolicies = {
      perIncomeType: {
        [IncomeType.Rental]: {
          kind: "PercentOfStated",
          factor: ratio(0.75),
        },
      },
    };
    const policy = defaultPolicyForIncomeType(IncomeType.Rental, overrides);
    expect(policy.kind).toBe("PercentOfStated");
    if (policy.kind === "PercentOfStated") {
      expect(Number(policy.factor)).toBeCloseTo(0.75, 6);
    }
  });

  it("falls back to the built-in default for an IncomeType not present in perIncomeType", () => {
    const overrides: ProgramIncomePolicies = {
      perIncomeType: {
        [IncomeType.Rental]: {
          kind: "PercentOfStated",
          factor: ratio(0.75),
        },
      },
    };
    // W2 is not overridden; should still resolve to AsStated.
    expect(defaultPolicyForIncomeType(IncomeType.W2, overrides)).toEqual({
      kind: "AsStated",
    });
    // Bonus is not overridden; should still resolve to PercentOfStated factor=1.
    const bonus = defaultPolicyForIncomeType(IncomeType.Bonus, overrides);
    expect(bonus.kind).toBe("PercentOfStated");
    if (bonus.kind === "PercentOfStated") {
      expect(Number(bonus.factor)).toBe(1);
    }
  });
});

describe("sumQualifyingIncomeWithPolicies", () => {
  it("returns 0 for an empty list", () => {
    expect(Number(sumQualifyingIncomeWithPolicies([]))).toBe(0);
  });

  it("sums all-W2 streams at face value", () => {
    const streams: IncomeStream[] = [
      stream({ id: "i1", type: IncomeType.W2, monthlyAmount: money(5000) }),
      stream({ id: "i2", type: IncomeType.W2, monthlyAmount: money(3250.5) }),
      stream({ id: "i3", type: IncomeType.W2, monthlyAmount: money(1200) }),
    ];
    expect(Number(sumQualifyingIncomeWithPolicies(streams))).toBeCloseTo(9450.5, 2);
  });

  it("applies the default 75% rental factor while leaving W2 untouched", () => {
    const streams: IncomeStream[] = [
      stream({ id: "i1", type: IncomeType.W2, monthlyAmount: money(8000) }),
      stream({ id: "i2", type: IncomeType.Rental, monthlyAmount: money(2000) }),
    ];
    // 8000 + 2000 * 0.75 = 9500
    expect(Number(sumQualifyingIncomeWithPolicies(streams))).toBeCloseTo(9500, 2);
  });

  it("excludes streams with qualifying === false", () => {
    const streams: IncomeStream[] = [
      stream({ id: "i1", type: IncomeType.W2, monthlyAmount: money(5000) }),
      stream({
        id: "i2",
        type: IncomeType.W2,
        monthlyAmount: money(3000),
        qualifying: false,
      }),
    ];
    expect(Number(sumQualifyingIncomeWithPolicies(streams))).toBeCloseTo(5000, 2);
  });

  it("respects an explicit qualifyingPolicy that overrides the type default", () => {
    // Rental defaults to 0.75; explicit AsStated should give full face value.
    const streams: IncomeStream[] = [
      stream({
        id: "i1",
        type: IncomeType.Rental,
        monthlyAmount: money(2000),
        qualifyingPolicy: { kind: "AsStated" },
      }),
    ];
    expect(Number(sumQualifyingIncomeWithPolicies(streams))).toBeCloseTo(2000, 2);
  });

  it("supports an explicit RentalGross policy alongside default-policy streams", () => {
    const streams: IncomeStream[] = [
      stream({ id: "i1", type: IncomeType.W2, monthlyAmount: money(6000) }),
      stream({
        id: "i2",
        type: IncomeType.Rental,
        monthlyAmount: money(0),
        qualifyingPolicy: {
          kind: "RentalGross",
          grossRent: money(4000),
          vacancyFactor: ratio(0.25),
        },
      }),
    ];
    // 6000 + 4000 * 0.75 = 9000
    expect(Number(sumQualifyingIncomeWithPolicies(streams))).toBeCloseTo(9000, 2);
  });

  it("applies AveragedMonths when explicitly attached to a SelfEmployed stream", () => {
    const streams: IncomeStream[] = [
      stream({
        id: "i1",
        type: IncomeType.SelfEmployed,
        monthlyAmount: money(12000), // ignored when AveragedMonths is set
        qualifyingPolicy: {
          kind: "AveragedMonths",
          monthsLookback: 24,
          historicalAmounts: Array.from({ length: 24 }, () => 7000),
        },
      }),
    ];
    expect(Number(sumQualifyingIncomeWithPolicies(streams))).toBeCloseTo(7000, 2);
  });
});

describe("sumQualifyingIncomeWithPolicies with maxRentalFactor", () => {
  it("caps an explicit RentalGross policy whose effective factor exceeds maxRentalFactor", () => {
    // vacancyFactor=0.10 -> effective 0.90, capped to 0.75 by overrides.
    const streams: IncomeStream[] = [
      stream({
        id: "i1",
        type: IncomeType.Rental,
        monthlyAmount: money(0),
        qualifyingPolicy: {
          kind: "RentalGross",
          grossRent: money(4000),
          vacancyFactor: ratio(0.1),
        },
      }),
    ];
    const overrides: ProgramIncomePolicies = { maxRentalFactor: 0.75 };
    // 4000 * 0.75 = 3000
    expect(Number(sumQualifyingIncomeWithPolicies(streams, overrides))).toBeCloseTo(3000, 2);
  });

  it("caps an explicit PercentOfStated factor 0.85 down to 0.75 for a Rental stream", () => {
    const streams: IncomeStream[] = [
      stream({
        id: "i1",
        type: IncomeType.Rental,
        monthlyAmount: money(2000),
        qualifyingPolicy: {
          kind: "PercentOfStated",
          factor: ratio(0.85),
        },
      }),
    ];
    const overrides: ProgramIncomePolicies = { maxRentalFactor: 0.75 };
    // 2000 * 0.75 = 1500
    expect(Number(sumQualifyingIncomeWithPolicies(streams, overrides))).toBeCloseTo(1500, 2);
  });

  it("does not affect non-Rental streams (W2 unchanged by maxRentalFactor)", () => {
    const streams: IncomeStream[] = [
      stream({ id: "i1", type: IncomeType.W2, monthlyAmount: money(8000) }),
      stream({
        id: "i2",
        type: IncomeType.Rental,
        monthlyAmount: money(2000),
        qualifyingPolicy: {
          kind: "PercentOfStated",
          factor: ratio(0.85),
        },
      }),
    ];
    const overrides: ProgramIncomePolicies = { maxRentalFactor: 0.75 };
    // 8000 (W2 untouched) + 2000 * 0.75 (rental capped) = 9500
    expect(Number(sumQualifyingIncomeWithPolicies(streams, overrides))).toBeCloseTo(9500, 2);
  });

  it("leaves an explicit factor at-or-below the cap unchanged", () => {
    const streams: IncomeStream[] = [
      stream({
        id: "i1",
        type: IncomeType.Rental,
        monthlyAmount: money(2000),
        qualifyingPolicy: {
          kind: "PercentOfStated",
          factor: ratio(0.5),
        },
      }),
    ];
    const overrides: ProgramIncomePolicies = { maxRentalFactor: 0.75 };
    // 2000 * 0.5 = 1000 (no cap applied because 0.5 <= 0.75)
    expect(Number(sumQualifyingIncomeWithPolicies(streams, overrides))).toBeCloseTo(1000, 2);
  });
});

// Feature 2: RentalDeparting (departure-residence rental income at the
// purchase of a new primary). Defaults to the same 75% gross-to-net factor
// as standard Rental, with per-program overrides via
// ProgramIncomePolicies.perIncomeType[RentalDeparting].
describe("RentalDeparting income type", () => {
  it("defaultPolicyForIncomeType(RentalDeparting) returns PercentOfStated 0.75", () => {
    const policy = defaultPolicyForIncomeType(IncomeType.RentalDeparting);
    expect(policy.kind).toBe("PercentOfStated");
    if (policy.kind === "PercentOfStated") {
      expect(Number(policy.factor)).toBeCloseTo(0.75, 6);
    }
  });

  it("a program override on RentalDeparting wins over the built-in default", () => {
    const overrides: ProgramIncomePolicies = {
      perIncomeType: {
        [IncomeType.RentalDeparting]: {
          kind: "PercentOfStated",
          factor: ratio(0.6),
        },
      },
    };
    const policy = defaultPolicyForIncomeType(IncomeType.RentalDeparting, overrides);
    expect(policy.kind).toBe("PercentOfStated");
    if (policy.kind === "PercentOfStated") {
      expect(Number(policy.factor)).toBeCloseTo(0.6, 6);
    }
  });

  it("a $1000/mo RentalDeparting stream with no explicit policy resolves to $750 qualifying", () => {
    const streams: IncomeStream[] = [
      stream({
        id: "i1",
        type: IncomeType.RentalDeparting,
        monthlyAmount: money(1000),
      }),
    ];
    expect(Number(sumQualifyingIncomeWithPolicies(streams))).toBeCloseTo(750, 2);
  });

  it("a Rental override does NOT bleed into RentalDeparting (independent enum keys)", () => {
    const overrides: ProgramIncomePolicies = {
      perIncomeType: {
        [IncomeType.Rental]: {
          kind: "PercentOfStated",
          factor: ratio(0.5),
        },
      },
    };
    // RentalDeparting has no override, so it falls back to the 0.75 default
    // even though Rental is overridden to 0.5.
    const policy = defaultPolicyForIncomeType(IncomeType.RentalDeparting, overrides);
    expect(policy.kind).toBe("PercentOfStated");
    if (policy.kind === "PercentOfStated") {
      expect(Number(policy.factor)).toBeCloseTo(0.75, 6);
    }
  });
});

// Feature 3: subject-property rental on 2-4 unit purchases / refis.
describe("calculateSubjectRentalIncome", () => {
  it("returns money(0) for a 1-unit property (borrower occupies the only unit)", () => {
    const result = calculateSubjectRentalIncome(money(2500), 1);
    expect(Number(result)).toBe(0);
  });

  it("2-unit at $1500 gross with default 25% vacancy -> $1125", () => {
    // 1500 * (1 - 0.25) = 1125
    const result = calculateSubjectRentalIncome(money(1500), 2);
    expect(Number(result)).toBeCloseTo(1125, 2);
  });

  it("3-unit at $4500 gross with default 25% vacancy -> $3375", () => {
    // 4500 * 0.75 = 3375
    const result = calculateSubjectRentalIncome(money(4500), 3);
    expect(Number(result)).toBeCloseTo(3375, 2);
  });

  it("4-unit at $9000 gross with default 25% vacancy -> $6750", () => {
    // 9000 * 0.75 = 6750
    const result = calculateSubjectRentalIncome(money(9000), 4);
    expect(Number(result)).toBeCloseTo(6750, 2);
  });

  it("honors an explicit vacancyFactor of 0.10 (effective 90% net)", () => {
    // 4000 * (1 - 0.10) = 3600
    const result = calculateSubjectRentalIncome(money(4000), 3, ratio(0.1));
    expect(Number(result)).toBeCloseTo(3600, 2);
  });

  it("honors a vacancyFactor of 0 (full gross passes through)", () => {
    const result = calculateSubjectRentalIncome(money(2500), 2, ratio(0));
    expect(Number(result)).toBeCloseTo(2500, 2);
  });

  it("throws RangeError on units outside [1, 4] (0)", () => {
    expect(() => calculateSubjectRentalIncome(money(1500), 0)).toThrow(RangeError);
  });

  it("throws RangeError on units outside [1, 4] (5)", () => {
    expect(() => calculateSubjectRentalIncome(money(1500), 5)).toThrow(RangeError);
  });

  it("throws RangeError on non-integer units (1.5)", () => {
    expect(() => calculateSubjectRentalIncome(money(1500), 1.5)).toThrow(RangeError);
  });

  it("throws RangeError on negative grossMonthlyRent", () => {
    // money() is a pure brand cast (no runtime guard) so a negative value
    // can reach calculateSubjectRentalIncome and trip its own RangeError.
    expect(() => calculateSubjectRentalIncome(money(-100), 2)).toThrow(RangeError);
  });

  it("throws RangeError on vacancyFactor < 0", () => {
    expect(() => calculateSubjectRentalIncome(money(1500), 2, ratio(-0.1))).toThrow(RangeError);
  });

  it("throws RangeError on vacancyFactor > 1", () => {
    expect(() => calculateSubjectRentalIncome(money(1500), 2, ratio(1.5))).toThrow(RangeError);
  });
});

// Feature 4: SE 24-month averaging via ProgramIncomePolicies.selfEmployedAveragingMonths.
describe("self-employed 24-month averaging via selfEmployedAveragingMonths", () => {
  const lookback24: ProgramIncomePolicies = {
    selfEmployedAveragingMonths: 24,
  };

  it("SE stream with no historicalAmounts falls back to PercentOfStated 1.0", () => {
    const s = stream({
      type: IncomeType.SelfEmployed,
      monthlyAmount: money(8000),
    });
    const policy = resolveQualifyingPolicy(s, lookback24);
    expect(policy.kind).toBe("PercentOfStated");
    if (policy.kind === "PercentOfStated") {
      expect(Number(policy.factor)).toBe(1);
    }
  });

  it("SE stream with shorter history than lookback falls back to default", () => {
    const s = stream({
      type: IncomeType.SelfEmployed,
      monthlyAmount: money(8000),
      historicalAmounts: Array.from({ length: 12 }, () => 7500),
    });
    const policy = resolveQualifyingPolicy(s, lookback24);
    expect(policy.kind).toBe("PercentOfStated");
    if (policy.kind === "PercentOfStated") {
      expect(Number(policy.factor)).toBe(1);
    }
  });

  it("SE stream with exactly 24 months resolves to AveragedMonths over those 24", () => {
    const history = Array.from({ length: 24 }, (_, i) => 5000 + i * 100);
    const s = stream({
      type: IncomeType.SelfEmployed,
      monthlyAmount: money(0),
      historicalAmounts: history,
    });
    const policy = resolveQualifyingPolicy(s, lookback24);
    expect(policy.kind).toBe("AveragedMonths");
    if (policy.kind === "AveragedMonths") {
      expect(policy.monthsLookback).toBe(24);
      expect(policy.historicalAmounts).toEqual(history);
    }
    // Average of 5000..7300 step 100 = (5000 + 7300) / 2 = 6150.
    expect(Number(sumQualifyingIncomeWithPolicies([s], lookback24))).toBeCloseTo(6150, 2);
  });

  it("SE stream with > lookback months only uses the last 24 (slice semantics)", () => {
    // 36 months: oldest 12 are 100/mo (would tank the average), newest 24
    // are all 9000. The averaging window must only see the last 24 → 9000.
    const history = [
      ...Array.from({ length: 12 }, () => 100),
      ...Array.from({ length: 24 }, () => 9000),
    ];
    const s = stream({
      type: IncomeType.SelfEmployed,
      monthlyAmount: money(0),
      historicalAmounts: history,
    });
    const policy = resolveQualifyingPolicy(s, lookback24);
    expect(policy.kind).toBe("AveragedMonths");
    if (policy.kind === "AveragedMonths") {
      expect(policy.historicalAmounts).toHaveLength(24);
      expect(policy.historicalAmounts.every((amount) => amount === 9000)).toBe(true);
    }
    expect(Number(sumQualifyingIncomeWithPolicies([s], lookback24))).toBeCloseTo(9000, 2);
  });

  it("an explicit qualifyingPolicy on the stream wins over averaging resolution", () => {
    const s = stream({
      type: IncomeType.SelfEmployed,
      monthlyAmount: money(0),
      qualifyingPolicy: { kind: "AsStated" },
      historicalAmounts: Array.from({ length: 24 }, () => 9000),
    });
    const policy = resolveQualifyingPolicy(s, lookback24);
    // AsStated wins; averaging is not invoked even though history is sufficient.
    expect(policy).toEqual({ kind: "AsStated" });
  });

  it("non-SE stream type with historicalAmounts is ignored by SE-averaging branch", () => {
    // Bonus carries 24 months of history, but selfEmployedAveragingMonths
    // applies only to IncomeType.SelfEmployed. Bonus must continue to
    // resolve to its default PercentOfStated 1.0.
    const s = stream({
      type: IncomeType.Bonus,
      monthlyAmount: money(2500),
      historicalAmounts: Array.from({ length: 24 }, () => 1000),
    });
    const policy = resolveQualifyingPolicy(s, lookback24);
    expect(policy.kind).toBe("PercentOfStated");
    if (policy.kind === "PercentOfStated") {
      expect(Number(policy.factor)).toBe(1);
    }
  });

  it("lookback unset -> SE stream with history still falls back to default", () => {
    const s = stream({
      type: IncomeType.SelfEmployed,
      monthlyAmount: money(8000),
      historicalAmounts: Array.from({ length: 24 }, () => 7500),
    });
    // No programOverrides at all; no averaging window declared.
    const policy = resolveQualifyingPolicy(s);
    expect(policy.kind).toBe("PercentOfStated");
    if (policy.kind === "PercentOfStated") {
      expect(Number(policy.factor)).toBe(1);
    }
  });
});
