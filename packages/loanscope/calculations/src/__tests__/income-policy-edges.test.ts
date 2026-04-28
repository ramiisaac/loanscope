import { describe, expect, it } from "vitest";
import { IncomeType, money, ratio, type Borrower, type IncomeStream } from "@loanscope/domain";
import { sumQualifyingIncomeWithPolicies } from "@loanscope/math";
import { incomePolicyEdges } from "../edges/income-policy";

const APPLY_INCOME_POLICIES_EDGE_ID = "apply-income-policies";

const incomePolicyEdge = (() => {
  const edge = incomePolicyEdges.find(
    (candidate) => candidate.id === APPLY_INCOME_POLICIES_EDGE_ID,
  );
  if (!edge) {
    throw new Error(
      `Expected edge with id '${APPLY_INCOME_POLICIES_EDGE_ID}' in incomePolicyEdges`,
    );
  }
  return edge;
})();

const stream = (
  overrides: Partial<IncomeStream> &
    Pick<IncomeStream, "id" | "borrowerId" | "type" | "monthlyAmount">,
): IncomeStream => ({
  id: overrides.id,
  borrowerId: overrides.borrowerId,
  type: overrides.type,
  monthlyAmount: overrides.monthlyAmount,
  ...(overrides.qualifying !== undefined ? { qualifying: overrides.qualifying } : {}),
  ...(overrides.qualifyingPolicy !== undefined
    ? { qualifyingPolicy: overrides.qualifyingPolicy }
    : {}),
});

const borrower = (id: string, incomes: IncomeStream[]): Borrower => ({
  id,
  fico: 740,
  incomes,
});

describe("incomePolicyEdges", () => {
  it("declares the expected edge metadata", () => {
    expect(incomePolicyEdge.kind).toBe("transform");
    expect(incomePolicyEdge.confidence).toBe("derived");
    // Production change: apply-income-policies edge now reads
    // subjectRentalIncome as a fourth input (Feature 3 — subject-property
    // rental rolls into the canonical qualifyingIncomeMonthly producer).
    expect(incomePolicyEdge.inputs).toEqual([
      "borrowers",
      "includedBorrowerIds",
      "incomePolicies",
      "subjectRentalIncome",
    ]);
    expect(incomePolicyEdge.outputs).toEqual(["qualifyingIncomeMonthly"]);
  });

  it("returns no output when there are no borrowers", () => {
    const result = incomePolicyEdge.compute({
      borrowers: [],
      includedBorrowerIds: [],
    });
    expect(result).toEqual({});
  });

  it("returns no output when included borrowers contribute no income streams", () => {
    const borrowers = [borrower("b1", [])];
    const result = incomePolicyEdge.compute({
      borrowers,
      includedBorrowerIds: ["b1"],
    });
    expect(result).toEqual({});
  });

  it("matches sumQualifyingIncomeWithPolicies for a single borrower", () => {
    const incomes: IncomeStream[] = [
      stream({
        id: "i1",
        borrowerId: "b1",
        type: IncomeType.W2,
        monthlyAmount: money(8000),
      }),
      stream({
        id: "i2",
        borrowerId: "b1",
        type: IncomeType.Rental,
        monthlyAmount: money(2000),
      }),
    ];
    const borrowers = [borrower("b1", incomes)];

    const result = incomePolicyEdge.compute({
      borrowers,
      includedBorrowerIds: ["b1"],
    });

    const expected = sumQualifyingIncomeWithPolicies(incomes);
    expect(Number(result.qualifyingIncomeMonthly)).toBeCloseTo(Number(expected), 2);
    // 8000 (W2 AsStated) + 2000 * 0.75 (Rental default) = 9500
    expect(Number(result.qualifyingIncomeMonthly)).toBeCloseTo(9500, 2);
  });

  it("aggregates income across multiple included borrowers", () => {
    const borrowers = [
      borrower("b1", [
        stream({
          id: "i1",
          borrowerId: "b1",
          type: IncomeType.W2,
          monthlyAmount: money(6000),
        }),
      ]),
      borrower("b2", [
        stream({
          id: "i2",
          borrowerId: "b2",
          type: IncomeType.W2,
          monthlyAmount: money(4500),
        }),
        stream({
          id: "i3",
          borrowerId: "b2",
          type: IncomeType.Rental,
          monthlyAmount: money(3200),
        }),
      ]),
    ];

    const result = incomePolicyEdge.compute({
      borrowers,
      includedBorrowerIds: ["b1", "b2"],
    });

    // 6000 + 4500 + 3200 * 0.75 = 12900
    expect(Number(result.qualifyingIncomeMonthly)).toBeCloseTo(12900, 2);
  });

  it("excludes income from borrowers not in includedBorrowerIds", () => {
    const borrowers = [
      borrower("b1", [
        stream({
          id: "i1",
          borrowerId: "b1",
          type: IncomeType.W2,
          monthlyAmount: money(6000),
        }),
      ]),
      borrower("b2", [
        stream({
          id: "i2",
          borrowerId: "b2",
          type: IncomeType.W2,
          monthlyAmount: money(9000),
        }),
      ]),
    ];

    const result = incomePolicyEdge.compute({
      borrowers,
      includedBorrowerIds: ["b1"],
    });

    expect(Number(result.qualifyingIncomeMonthly)).toBeCloseTo(6000, 2);
  });

  it("excludes streams flagged qualifying === false", () => {
    const incomes: IncomeStream[] = [
      stream({
        id: "i1",
        borrowerId: "b1",
        type: IncomeType.W2,
        monthlyAmount: money(7000),
      }),
      stream({
        id: "i2",
        borrowerId: "b1",
        type: IncomeType.W2,
        monthlyAmount: money(2500),
        qualifying: false,
      }),
    ];

    const result = incomePolicyEdge.compute({
      borrowers: [borrower("b1", incomes)],
      includedBorrowerIds: ["b1"],
    });

    expect(Number(result.qualifyingIncomeMonthly)).toBeCloseTo(7000, 2);
  });

  it("honors an explicit qualifyingPolicy that overrides the type default", () => {
    const incomes: IncomeStream[] = [
      stream({
        id: "i1",
        borrowerId: "b1",
        type: IncomeType.Rental,
        monthlyAmount: money(2000),
        qualifyingPolicy: { kind: "AsStated" },
      }),
    ];

    const result = incomePolicyEdge.compute({
      borrowers: [borrower("b1", incomes)],
      includedBorrowerIds: ["b1"],
    });

    // Default would have been 1500 (75%); explicit AsStated yields 2000.
    expect(Number(result.qualifyingIncomeMonthly)).toBeCloseTo(2000, 2);
  });

  it("supports an explicit RentalGross policy with a custom vacancy factor", () => {
    const incomes: IncomeStream[] = [
      stream({
        id: "i1",
        borrowerId: "b1",
        type: IncomeType.Rental,
        monthlyAmount: money(0),
        qualifyingPolicy: {
          kind: "RentalGross",
          grossRent: money(4000),
          vacancyFactor: ratio(0.1),
        },
      }),
    ];

    const result = incomePolicyEdge.compute({
      borrowers: [borrower("b1", incomes)],
      includedBorrowerIds: ["b1"],
    });

    // 4000 * (1 - 0.1) = 3600
    expect(Number(result.qualifyingIncomeMonthly)).toBeCloseTo(3600, 2);
  });

  // Feature 3: subject-property rental income is added to the canonical
  // qualifyingIncomeMonthly producer via the new subjectRentalIncome input.
  it("adds subjectRentalIncome to the borrower-stream qualifying total", () => {
    const incomes: IncomeStream[] = [
      stream({
        id: "i1",
        borrowerId: "b1",
        type: IncomeType.W2,
        monthlyAmount: money(7000),
      }),
      stream({
        id: "i2",
        borrowerId: "b2",
        type: IncomeType.W2,
        monthlyAmount: money(5500),
      }),
    ];
    const borrowers = [borrower("b1", [incomes[0]!]), borrower("b2", [incomes[1]!])];

    const result = incomePolicyEdge.compute({
      borrowers,
      includedBorrowerIds: ["b1", "b2"],
      subjectRentalIncome: money(1350),
    });

    // 7000 + 5500 + 1350 = 13850
    expect(Number(result.qualifyingIncomeMonthly)).toBeCloseTo(13850, 2);
  });

  it("emits qualifyingIncomeMonthly from subject-rental alone when borrowers have no income streams", () => {
    // No included borrowers contribute streams, but a positive
    // subjectRentalIncome must still produce an output (otherwise the
    // downstream check edge would block on a missing value).
    const result = incomePolicyEdge.compute({
      borrowers: [borrower("b1", [])],
      includedBorrowerIds: ["b1"],
      subjectRentalIncome: money(1800),
    });
    expect(Number(result.qualifyingIncomeMonthly)).toBeCloseTo(1800, 2);
  });

  it("treats null subjectRentalIncome as $0 (no contribution)", () => {
    const incomes: IncomeStream[] = [
      stream({
        id: "i1",
        borrowerId: "b1",
        type: IncomeType.W2,
        monthlyAmount: money(6000),
      }),
    ];
    const result = incomePolicyEdge.compute({
      borrowers: [borrower("b1", incomes)],
      includedBorrowerIds: ["b1"],
      subjectRentalIncome: null,
    });
    expect(Number(result.qualifyingIncomeMonthly)).toBeCloseTo(6000, 2);
  });

  it("returns no output when both borrower streams and subject-rental are zero", () => {
    const result = incomePolicyEdge.compute({
      borrowers: [borrower("b1", [])],
      includedBorrowerIds: ["b1"],
      subjectRentalIncome: money(0),
    });
    expect(result).toEqual({});
  });
});
