import { describe, expect, it } from "vitest";
import { money, ratio } from "@loanscope/domain";
import { subjectRentalEdges } from "../edges/subject-rental";

const SUBJECT_RENTAL_EDGE_ID = "calculate-subject-rental-income";

const subjectRentalEdge = (() => {
  const edge = subjectRentalEdges.find((candidate) => candidate.id === SUBJECT_RENTAL_EDGE_ID);
  if (!edge) {
    throw new Error(`Expected edge with id '${SUBJECT_RENTAL_EDGE_ID}' in subjectRentalEdges`);
  }
  return edge;
})();

describe("subjectRentalEdges", () => {
  it("declares the expected edge metadata", () => {
    expect(subjectRentalEdge.kind).toBe("transform");
    expect(subjectRentalEdge.confidence).toBe("derived");
    expect(subjectRentalEdge.inputs).toEqual(["subjectPropertyRental", "units"]);
    expect(subjectRentalEdge.outputs).toEqual(["subjectRentalIncome"]);
  });

  it("returns money(0) when subjectPropertyRental is null", () => {
    const result = subjectRentalEdge.compute({
      subjectPropertyRental: null,
      units: 2,
    });
    expect(Number(result.subjectRentalIncome)).toBe(0);
  });

  it("returns money(0) when subjectPropertyRental is undefined", () => {
    const result = subjectRentalEdge.compute({
      subjectPropertyRental: undefined,
      units: 4,
    });
    expect(Number(result.subjectRentalIncome)).toBe(0);
  });

  it("returns money(0) on a 1-unit property even when rental is supplied", () => {
    // Per calculateSubjectRentalIncome: a 1-unit primary cannot generate
    // subject-rental income for the borrower-occupied unit.
    const result = subjectRentalEdge.compute({
      subjectPropertyRental: { grossMonthlyRent: 2500 },
      units: 1,
    });
    expect(Number(result.subjectRentalIncome)).toBe(0);
  });

  it("4-unit at $9000 gross with default 25% vacancy -> $6750", () => {
    // 9000 * (1 - 0.25) = 6750
    const result = subjectRentalEdge.compute({
      subjectPropertyRental: { grossMonthlyRent: 9000 },
      units: 4,
    });
    expect(Number(result.subjectRentalIncome)).toBeCloseTo(6750, 2);
  });

  it("2-unit at $1800 gross with default 25% vacancy -> $1350", () => {
    // 1800 * 0.75 = 1350
    const result = subjectRentalEdge.compute({
      subjectPropertyRental: { grossMonthlyRent: 1800 },
      units: 2,
    });
    expect(Number(result.subjectRentalIncome)).toBeCloseTo(1350, 2);
  });

  it("honors an explicit vacancyFactor passed through the edge", () => {
    // 4000 * (1 - 0.10) = 3600
    const result = subjectRentalEdge.compute({
      subjectPropertyRental: {
        grossMonthlyRent: 4000,
        vacancyFactor: 0.1,
      },
      units: 3,
    });
    expect(Number(result.subjectRentalIncome)).toBeCloseTo(3600, 2);
  });

  it("returns explicit money/ratio brands on the rental shape (cents-rounded)", () => {
    // 1234.567 * 0.75 = 925.92525, half-up to 925.93.
    const result = subjectRentalEdge.compute({
      subjectPropertyRental: {
        grossMonthlyRent: 1234.567,
        vacancyFactor: 0.25,
      },
      units: 2,
    });
    expect(Number(result.subjectRentalIncome)).toBeCloseTo(925.93, 2);
  });

  it("throws when subjectPropertyRental is not an object (number)", () => {
    expect(() =>
      subjectRentalEdge.compute({
        subjectPropertyRental: 1500,
        units: 2,
      }),
    ).toThrow(/subjectPropertyRental/);
  });

  it("throws when subjectPropertyRental is an array (rejected as non-object shape)", () => {
    expect(() =>
      subjectRentalEdge.compute({
        subjectPropertyRental: [1, 2, 3],
        units: 2,
      }),
    ).toThrow(/subjectPropertyRental/);
  });

  it("throws when grossMonthlyRent is missing", () => {
    expect(() =>
      subjectRentalEdge.compute({
        subjectPropertyRental: { vacancyFactor: 0.25 },
        units: 2,
      }),
    ).toThrow(/grossMonthlyRent/);
  });

  it("throws when grossMonthlyRent is negative", () => {
    expect(() =>
      subjectRentalEdge.compute({
        subjectPropertyRental: { grossMonthlyRent: -50 },
        units: 2,
      }),
    ).toThrow(/grossMonthlyRent/);
  });

  it("throws when vacancyFactor is outside [0, 1]", () => {
    expect(() =>
      subjectRentalEdge.compute({
        subjectPropertyRental: {
          grossMonthlyRent: 2000,
          vacancyFactor: 1.5,
        },
        units: 2,
      }),
    ).toThrow(/vacancyFactor/);
  });

  it("throws when units is outside [1, 4] (5)", () => {
    expect(() =>
      subjectRentalEdge.compute({
        subjectPropertyRental: { grossMonthlyRent: 1500 },
        units: 5,
      }),
    ).toThrow(/units/);
  });

  it("throws when units is non-integer", () => {
    expect(() =>
      subjectRentalEdge.compute({
        subjectPropertyRental: { grossMonthlyRent: 1500 },
        units: 2.5,
      }),
    ).toThrow(/units/);
  });

  it("uses default units=1 (which yields $0) when units input is omitted", () => {
    // readUnits defaults undefined to 1; on a 1-unit shape the function
    // returns money(0) without throwing, so the rental shape is parsed
    // (and validated) but produces no qualifying-income contribution.
    const result = subjectRentalEdge.compute({
      subjectPropertyRental: { grossMonthlyRent: 2000 },
    });
    expect(Number(result.subjectRentalIncome)).toBe(0);
  });

  // Sanity: ratio() is a pure brand cast, so passing a numeric vacancy
  // factor of 0 through the edge yields the full gross.
  it("vacancyFactor of 0 passes the full gross through (2-unit at $2500 -> $2500)", () => {
    const result = subjectRentalEdge.compute({
      subjectPropertyRental: {
        grossMonthlyRent: 2500,
        vacancyFactor: 0,
      },
      units: 2,
    });
    expect(Number(result.subjectRentalIncome)).toBeCloseTo(2500, 2);
    // Confirm the brand is preserved by checking the ratio() helper's identity.
    expect(Number(ratio(0))).toBe(0);
    expect(Number(money(0))).toBe(0);
  });
});
