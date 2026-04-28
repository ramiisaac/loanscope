import { describe, expect, it } from "vitest";
import {
  IncomeType,
  money,
  type Borrower,
  type BorrowerBlendPolicy,
  type IncomeStream,
} from "@loanscope/domain";
import { DEFAULT_BLEND_POLICY, computeRepresentativeFico } from "../borrower-blend";

const stream = (
  borrowerId: string,
  monthlyAmount: number,
  id = `${borrowerId}-w2`,
): IncomeStream => ({
  id,
  borrowerId,
  type: IncomeType.W2,
  monthlyAmount: money(monthlyAmount),
});

const borrower = (
  id: string,
  fico: number,
  options: {
    ficoScores?: number[];
    incomes?: IncomeStream[];
  } = {},
): Borrower => ({
  id,
  fico,
  incomes: options.incomes ?? [],
  ...(options.ficoScores !== undefined ? { ficoScores: options.ficoScores } : {}),
});

describe("DEFAULT_BLEND_POLICY", () => {
  it("is LowestMid", () => {
    expect(DEFAULT_BLEND_POLICY).toEqual({ kind: "LowestMid" });
  });
});

describe("computeRepresentativeFico — LowestMid", () => {
  const policy: BorrowerBlendPolicy = { kind: "LowestMid" };

  it("returns the borrower's fico when there is only one included borrower and no ficoScores", () => {
    const result = computeRepresentativeFico([borrower("b1", 742)], ["b1"], policy);
    expect(result).toBe(742);
  });

  it("uses the per-borrower mid of three bureau scores then takes the minimum across borrowers", () => {
    const borrowers = [
      borrower("b1", 720, { ficoScores: [700, 720, 740] }), // mid = 720
      borrower("b2", 760, { ficoScores: [740, 760, 780] }), // mid = 760
    ];
    const result = computeRepresentativeFico(borrowers, ["b1", "b2"], policy);
    expect(result).toBe(720);
  });

  it("falls back to borrower.fico when ficoScores has fewer than three entries", () => {
    const borrowers = [
      borrower("b1", 700, { ficoScores: [680, 720] }), // <3 -> use 700
      borrower("b2", 760, { ficoScores: [740, 760, 780] }), // mid = 760
    ];
    const result = computeRepresentativeFico(borrowers, ["b1", "b2"], policy);
    expect(result).toBe(700);
  });

  it("respects includedBorrowerIds when computing the minimum mid", () => {
    const borrowers = [
      borrower("b1", 640), // would be the min if included
      borrower("b2", 720, { ficoScores: [710, 720, 740] }),
      borrower("b3", 780, { ficoScores: [770, 780, 790] }),
    ];
    const result = computeRepresentativeFico(borrowers, ["b2", "b3"], policy);
    expect(result).toBe(720);
  });
});

describe("computeRepresentativeFico — RepresentativeFico", () => {
  const policy: BorrowerBlendPolicy = { kind: "RepresentativeFico" };

  it("aliases LowestMid for a single borrower", () => {
    const result = computeRepresentativeFico([borrower("b1", 715)], ["b1"], policy);
    expect(result).toBe(715);
  });

  it("returns the minimum mid across borrowers", () => {
    const borrowers = [
      borrower("b1", 0, { ficoScores: [700, 720, 760] }), // mid 720
      borrower("b2", 0, { ficoScores: [680, 690, 740] }), // mid 690
    ];
    const result = computeRepresentativeFico(borrowers, ["b1", "b2"], policy);
    expect(result).toBe(690);
  });

  it("matches LowestMid result for the same input", () => {
    const borrowers = [
      borrower("b1", 720, { ficoScores: [700, 720, 740] }),
      borrower("b2", 760, { ficoScores: [740, 760, 780] }),
      borrower("b3", 690),
    ];
    const ids = ["b1", "b2", "b3"];
    const repFico = computeRepresentativeFico(borrowers, ids, policy);
    const lowestMid = computeRepresentativeFico(borrowers, ids, {
      kind: "LowestMid",
    });
    expect(repFico).toBe(lowestMid);
    expect(repFico).toBe(690);
  });
});

describe("computeRepresentativeFico — WeightedAverage", () => {
  it("returns the borrower's fico for a single included borrower (income-weighted)", () => {
    const policy: BorrowerBlendPolicy = {
      kind: "WeightedAverage",
      incomeWeighted: true,
    };
    const result = computeRepresentativeFico(
      [borrower("b1", 730, { incomes: [stream("b1", 5000)] })],
      ["b1"],
      policy,
    );
    expect(result).toBe(730);
  });

  it("computes the unweighted arithmetic mean when incomeWeighted is false", () => {
    const policy: BorrowerBlendPolicy = {
      kind: "WeightedAverage",
      incomeWeighted: false,
    };
    const borrowers = [
      borrower("b1", 720, { incomes: [stream("b1", 10000)] }),
      borrower("b2", 680, { incomes: [stream("b2", 2000)] }),
    ];
    const result = computeRepresentativeFico(borrowers, ["b1", "b2"], policy);
    // (720 + 680) / 2 = 700
    expect(result).toBe(700);
  });

  it("weights by total monthly income across each borrower's streams when incomeWeighted is true", () => {
    const policy: BorrowerBlendPolicy = {
      kind: "WeightedAverage",
      incomeWeighted: true,
    };
    const borrowers = [
      borrower("b1", 720, { incomes: [stream("b1", 10000)] }),
      borrower("b2", 680, { incomes: [stream("b2", 2000)] }),
    ];
    const result = computeRepresentativeFico(borrowers, ["b1", "b2"], policy);
    // (720*10000 + 680*2000) / 12000 = (7,200,000 + 1,360,000) / 12,000
    //   = 8,560,000 / 12,000 = 713.333... -> half-up -> 713
    expect(result).toBe(713);
  });

  it("ignores ficoScores entirely (uses borrower.fico)", () => {
    const policy: BorrowerBlendPolicy = {
      kind: "WeightedAverage",
      incomeWeighted: false,
    };
    const borrowers = [
      borrower("b1", 700, { ficoScores: [600, 600, 600] }),
      borrower("b2", 800, { ficoScores: [900, 900, 900] }),
    ];
    const result = computeRepresentativeFico(borrowers, ["b1", "b2"], policy);
    // (700 + 800) / 2 = 750 (would be 750 from ficoScores too, but proves no use of fall-through)
    expect(result).toBe(750);
  });

  it("falls back to unweighted mean when total income across the included set is zero", () => {
    const policy: BorrowerBlendPolicy = {
      kind: "WeightedAverage",
      incomeWeighted: true,
    };
    const borrowers = [borrower("b1", 720), borrower("b2", 680)];
    const result = computeRepresentativeFico(borrowers, ["b1", "b2"], policy);
    expect(result).toBe(700);
  });

  it("aggregates multiple income streams per borrower for weighting", () => {
    const policy: BorrowerBlendPolicy = {
      kind: "WeightedAverage",
      incomeWeighted: true,
    };
    const borrowers = [
      borrower("b1", 720, {
        incomes: [stream("b1", 6000, "b1-w2"), stream("b1", 4000, "b1-bonus")],
      }),
      borrower("b2", 680, { incomes: [stream("b2", 2000)] }),
    ];
    const result = computeRepresentativeFico(borrowers, ["b1", "b2"], policy);
    // weights: b1=10000, b2=2000 -> same as the asymmetric case -> 713
    expect(result).toBe(713);
  });
});

describe("computeRepresentativeFico — PrimaryOnly", () => {
  it("returns the FICO of the named primary borrower", () => {
    const policy: BorrowerBlendPolicy = {
      kind: "PrimaryOnly",
      primaryBorrowerId: "b2",
    };
    const borrowers = [borrower("b1", 720), borrower("b2", 680), borrower("b3", 800)];
    const result = computeRepresentativeFico(borrowers, ["b1", "b2", "b3"], policy);
    expect(result).toBe(680);
  });

  it("ignores ficoScores and other borrowers' incomes", () => {
    const policy: BorrowerBlendPolicy = {
      kind: "PrimaryOnly",
      primaryBorrowerId: "b1",
    };
    const borrowers = [
      borrower("b1", 715, {
        ficoScores: [600, 700, 800],
        incomes: [stream("b1", 1)],
      }),
      borrower("b2", 800, { incomes: [stream("b2", 100000)] }),
    ];
    const result = computeRepresentativeFico(borrowers, ["b1", "b2"], policy);
    expect(result).toBe(715);
  });

  it("throws when the primary borrower is not in includedBorrowerIds", () => {
    const policy: BorrowerBlendPolicy = {
      kind: "PrimaryOnly",
      primaryBorrowerId: "b2",
    };
    const borrowers = [borrower("b1", 720), borrower("b2", 680)];
    expect(() => computeRepresentativeFico(borrowers, ["b1"], policy)).toThrow(RangeError);
  });

  it("throws when the primary borrower id does not exist at all", () => {
    const policy: BorrowerBlendPolicy = {
      kind: "PrimaryOnly",
      primaryBorrowerId: "ghost",
    };
    const borrowers = [borrower("b1", 720)];
    expect(() => computeRepresentativeFico(borrowers, ["b1"], policy)).toThrow(/ghost/);
  });
});

describe("computeRepresentativeFico — invariants", () => {
  it("throws RangeError when no borrowers are included", () => {
    expect(() =>
      computeRepresentativeFico([borrower("b1", 720)], [], { kind: "LowestMid" }),
    ).toThrow(RangeError);
  });

  it("throws RangeError when borrowers list is empty", () => {
    expect(() => computeRepresentativeFico([], ["b1"], { kind: "LowestMid" })).toThrow(RangeError);
  });

  it("rounds half-up to the nearest integer for fractional weighted averages", () => {
    const policy: BorrowerBlendPolicy = {
      kind: "WeightedAverage",
      incomeWeighted: false,
    };
    // (700 + 701) / 2 = 700.5 -> half-up -> 701
    const borrowers = [borrower("b1", 700), borrower("b2", 701)];
    const result = computeRepresentativeFico(borrowers, ["b1", "b2"], policy);
    expect(result).toBe(701);
  });

  it("clamps a sub-300 input up to the floor", () => {
    const result = computeRepresentativeFico([borrower("b1", 250)], ["b1"], { kind: "LowestMid" });
    expect(result).toBe(300);
  });

  it("clamps an above-850 input down to the ceiling", () => {
    const result = computeRepresentativeFico([borrower("b1", 900)], ["b1"], { kind: "LowestMid" });
    expect(result).toBe(850);
  });
});
