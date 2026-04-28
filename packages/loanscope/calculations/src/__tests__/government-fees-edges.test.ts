import { describe, expect, it } from "vitest";
import { LoanPurpose, LoanType, money, months, ratio } from "@loanscope/domain";
import { governmentFeesEdges } from "../edges/government-fees";

const edge = (() => {
  const found = governmentFeesEdges.find((e) => e.id === "calculate-government-fees");
  if (!found) throw new Error("Missing calculate-government-fees edge");
  return found;
})();

const baseInputs = {
  baseLoanAmount: money(300_000),
  baseLtv: ratio(0.8),
  amortizationMonths: months(360),
  loanPurpose: LoanPurpose.Purchase,
};

describe("calculate-government-fees edge", () => {
  it("declares the expected inputs and outputs", () => {
    expect(edge.inputs).toEqual([
      "loanType",
      "baseLoanAmount",
      "baseLtv",
      "amortizationMonths",
      "loanPurpose",
      "vaServiceContext",
    ]);
    expect(edge.outputs).toEqual(["upfrontGovernmentFee", "monthlyGovernmentFee"]);
    expect(edge.kind).toBe("transform");
    expect(edge.confidence).toBe("derived");
  });

  it("dispatches FHA: UFMIP = 1.75% and monthly MIP from table", () => {
    const result = edge.compute({
      ...baseInputs,
      loanType: LoanType.FHA,
      baseLtv: ratio(0.965),
    });
    // UFMIP: 300000 * 0.0175 = 5250
    expect(Number(result.upfrontGovernmentFee)).toBeCloseTo(5_250, 2);
    // 30-yr, LTV > 95% -> 55 bps annual; 300000 * 0.0055 / 12 = 137.5
    expect(Number(result.monthlyGovernmentFee)).toBeCloseTo(137.5, 2);
  });

  it("dispatches VA: funding fee from table; monthly = 0", () => {
    const result = edge.compute({
      ...baseInputs,
      loanType: LoanType.VA,
      baseLtv: ratio(1.0),
      vaServiceContext: {
        priorUse: false,
        disabilityExempt: false,
        reserveOrGuard: false,
      },
    });
    // Purchase, first use, LTV > 95% -> 2.15%; 300000 * 0.0215 = 6450
    expect(Number(result.upfrontGovernmentFee)).toBeCloseTo(6_450, 2);
    expect(Number(result.monthlyGovernmentFee)).toBeCloseTo(0, 2);
  });

  it("dispatches VA with absent vaServiceContext using default (first use, not exempt)", () => {
    const result = edge.compute({
      ...baseInputs,
      loanType: LoanType.VA,
      baseLtv: ratio(0.85),
      // vaServiceContext omitted
    });
    // Purchase, first use, LTV <= 90% -> 1.25%; 300000 * 0.0125 = 3750
    expect(Number(result.upfrontGovernmentFee)).toBeCloseTo(3_750, 2);
    expect(Number(result.monthlyGovernmentFee)).toBeCloseTo(0, 2);
  });

  it("dispatches VA with explicit disability-exempt context -> $0 fee", () => {
    const result = edge.compute({
      ...baseInputs,
      loanType: LoanType.VA,
      baseLtv: ratio(1.0),
      vaServiceContext: {
        priorUse: false,
        disabilityExempt: true,
        reserveOrGuard: false,
      },
    });
    expect(Number(result.upfrontGovernmentFee)).toBeCloseTo(0, 2);
    expect(Number(result.monthlyGovernmentFee)).toBeCloseTo(0, 2);
  });

  it("dispatches USDA: 1.00% upfront and 0.35% annual / 12 monthly", () => {
    const result = edge.compute({
      ...baseInputs,
      loanType: LoanType.USDA,
    });
    // 300000 * 0.01 = 3000
    expect(Number(result.upfrontGovernmentFee)).toBeCloseTo(3_000, 2);
    // 300000 * 0.0035 / 12 = 87.5
    expect(Number(result.monthlyGovernmentFee)).toBeCloseTo(87.5, 2);
  });

  it("returns zero fees for Conventional", () => {
    const result = edge.compute({
      ...baseInputs,
      loanType: LoanType.Conventional,
    });
    expect(Number(result.upfrontGovernmentFee)).toBeCloseTo(0, 2);
    expect(Number(result.monthlyGovernmentFee)).toBeCloseTo(0, 2);
  });

  it("returns zero fees for Jumbo", () => {
    const result = edge.compute({
      ...baseInputs,
      loanType: LoanType.Jumbo,
    });
    expect(Number(result.upfrontGovernmentFee)).toBeCloseTo(0, 2);
    expect(Number(result.monthlyGovernmentFee)).toBeCloseTo(0, 2);
  });

  it("returns zero fees for HighBalance", () => {
    const result = edge.compute({
      ...baseInputs,
      loanType: LoanType.HighBalance,
    });
    expect(Number(result.upfrontGovernmentFee)).toBeCloseTo(0, 2);
    expect(Number(result.monthlyGovernmentFee)).toBeCloseTo(0, 2);
  });

  it("throws on unknown loanType string", () => {
    expect(() =>
      edge.compute({
        ...baseInputs,
        loanType: "Unknown",
      }),
    ).toThrow(/loanType must be one of/);
  });

  it("throws on non-boolean vaServiceContext field", () => {
    expect(() =>
      edge.compute({
        ...baseInputs,
        loanType: LoanType.VA,
        vaServiceContext: {
          priorUse: "yes",
          disabilityExempt: false,
          reserveOrGuard: false,
        },
      }),
    ).toThrow(/vaServiceContext\.priorUse must be boolean/);
  });
});
