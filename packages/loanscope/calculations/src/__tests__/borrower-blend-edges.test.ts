import { describe, expect, it } from "vitest";
import {
  IncomeType,
  money,
  type Borrower,
  type BorrowerBlendPolicy,
  type IncomeStream,
} from "@loanscope/domain";
import { borrowerBlendEdges } from "../edges/borrower-blend";

const APPLY_BORROWER_BLEND_EDGE_ID = "apply-borrower-blend";

const borrowerBlendEdge = (() => {
  const edge = borrowerBlendEdges.find(
    (candidate) => candidate.id === APPLY_BORROWER_BLEND_EDGE_ID,
  );
  if (!edge) {
    throw new Error(
      `Expected edge with id '${APPLY_BORROWER_BLEND_EDGE_ID}' in borrowerBlendEdges`,
    );
  }
  return edge;
})();

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

describe("borrowerBlendEdges", () => {
  it("declares the expected edge metadata", () => {
    expect(borrowerBlendEdge.kind).toBe("transform");
    expect(borrowerBlendEdge.confidence).toBe("derived");
    expect(borrowerBlendEdge.inputs).toEqual([
      "borrowers",
      "includedBorrowerIds",
      "borrowerBlendPolicy",
    ]);
    expect(borrowerBlendEdge.outputs).toEqual(["blendedFico"]);
  });

  it("defaults to LowestMid when borrowerBlendPolicy is undefined", () => {
    const borrowers = [
      borrower("b1", 720, { ficoScores: [700, 720, 740] }),
      borrower("b2", 760, { ficoScores: [750, 760, 770] }),
    ];
    const result = borrowerBlendEdge.compute({
      borrowers,
      includedBorrowerIds: ["b1", "b2"],
      borrowerBlendPolicy: undefined,
    });
    expect(result.blendedFico).toBe(720);
  });

  it("defaults to LowestMid when borrowerBlendPolicy is null", () => {
    const borrowers = [borrower("b1", 715), borrower("b2", 690)];
    const result = borrowerBlendEdge.compute({
      borrowers,
      includedBorrowerIds: ["b1", "b2"],
      borrowerBlendPolicy: null,
    });
    expect(result.blendedFico).toBe(690);
  });

  it("dispatches LowestMid explicitly", () => {
    const policy: BorrowerBlendPolicy = { kind: "LowestMid" };
    const borrowers = [
      borrower("b1", 720, { ficoScores: [700, 720, 740] }),
      borrower("b2", 760, { ficoScores: [750, 760, 770] }),
    ];
    const result = borrowerBlendEdge.compute({
      borrowers,
      includedBorrowerIds: ["b1", "b2"],
      borrowerBlendPolicy: policy,
    });
    expect(result.blendedFico).toBe(720);
  });

  it("dispatches RepresentativeFico (alias of LowestMid)", () => {
    const policy: BorrowerBlendPolicy = { kind: "RepresentativeFico" };
    const borrowers = [
      borrower("b1", 0, { ficoScores: [700, 720, 740] }),
      borrower("b2", 0, { ficoScores: [680, 690, 740] }),
    ];
    const result = borrowerBlendEdge.compute({
      borrowers,
      includedBorrowerIds: ["b1", "b2"],
      borrowerBlendPolicy: policy,
    });
    expect(result.blendedFico).toBe(690);
  });

  it("dispatches WeightedAverage (income-weighted)", () => {
    const policy: BorrowerBlendPolicy = {
      kind: "WeightedAverage",
      incomeWeighted: true,
    };
    const borrowers = [
      borrower("b1", 720, { incomes: [stream("b1", 10000)] }),
      borrower("b2", 680, { incomes: [stream("b2", 2000)] }),
    ];
    const result = borrowerBlendEdge.compute({
      borrowers,
      includedBorrowerIds: ["b1", "b2"],
      borrowerBlendPolicy: policy,
    });
    // (720*10000 + 680*2000) / 12000 = 713.333... -> half-up -> 713
    expect(result.blendedFico).toBe(713);
  });

  it("dispatches WeightedAverage (unweighted mean)", () => {
    const policy: BorrowerBlendPolicy = {
      kind: "WeightedAverage",
      incomeWeighted: false,
    };
    const borrowers = [
      borrower("b1", 720, { incomes: [stream("b1", 10000)] }),
      borrower("b2", 680, { incomes: [stream("b2", 2000)] }),
    ];
    const result = borrowerBlendEdge.compute({
      borrowers,
      includedBorrowerIds: ["b1", "b2"],
      borrowerBlendPolicy: policy,
    });
    expect(result.blendedFico).toBe(700);
  });

  it("dispatches PrimaryOnly", () => {
    const policy: BorrowerBlendPolicy = {
      kind: "PrimaryOnly",
      primaryBorrowerId: "b2",
    };
    const borrowers = [borrower("b1", 720), borrower("b2", 680), borrower("b3", 800)];
    const result = borrowerBlendEdge.compute({
      borrowers,
      includedBorrowerIds: ["b1", "b2", "b3"],
      borrowerBlendPolicy: policy,
    });
    expect(result.blendedFico).toBe(680);
  });

  it("respects includedBorrowerIds when filtering", () => {
    const policy: BorrowerBlendPolicy = { kind: "LowestMid" };
    const borrowers = [
      borrower("b1", 640),
      borrower("b2", 720, { ficoScores: [710, 720, 740] }),
      borrower("b3", 780, { ficoScores: [770, 780, 790] }),
    ];
    const result = borrowerBlendEdge.compute({
      borrowers,
      includedBorrowerIds: ["b2", "b3"],
      borrowerBlendPolicy: policy,
    });
    expect(result.blendedFico).toBe(720);
  });

  it("throws when includedBorrowerIds is empty", () => {
    expect(() =>
      borrowerBlendEdge.compute({
        borrowers: [borrower("b1", 720)],
        includedBorrowerIds: [],
        borrowerBlendPolicy: { kind: "LowestMid" },
      }),
    ).toThrow(RangeError);
  });

  it("throws when PrimaryOnly references a borrower not in includedBorrowerIds", () => {
    const policy: BorrowerBlendPolicy = {
      kind: "PrimaryOnly",
      primaryBorrowerId: "b2",
    };
    expect(() =>
      borrowerBlendEdge.compute({
        borrowers: [borrower("b1", 720), borrower("b2", 680)],
        includedBorrowerIds: ["b1"],
        borrowerBlendPolicy: policy,
      }),
    ).toThrow(RangeError);
  });

  it("rejects a malformed policy object at the boundary", () => {
    expect(() =>
      borrowerBlendEdge.compute({
        borrowers: [borrower("b1", 720)],
        includedBorrowerIds: ["b1"],
        borrowerBlendPolicy: { kind: "NotARealKind" },
      }),
    ).toThrow();
  });

  it("rejects WeightedAverage missing incomeWeighted", () => {
    expect(() =>
      borrowerBlendEdge.compute({
        borrowers: [borrower("b1", 720), borrower("b2", 680)],
        includedBorrowerIds: ["b1", "b2"],
        borrowerBlendPolicy: { kind: "WeightedAverage" },
      }),
    ).toThrow(/incomeWeighted/);
  });

  it("rejects PrimaryOnly missing primaryBorrowerId", () => {
    expect(() =>
      borrowerBlendEdge.compute({
        borrowers: [borrower("b1", 720)],
        includedBorrowerIds: ["b1"],
        borrowerBlendPolicy: { kind: "PrimaryOnly" },
      }),
    ).toThrow(/primaryBorrowerId/);
  });
});
