import { describe, it, expect } from "vitest";
import { money } from "@loanscope/domain";
import { financedLoanAmountEdges } from "../edges/financed-loan-amount";
const getEdge = (id: string) => {
  const edge = financedLoanAmountEdges.find((e) => e.id === id);
  if (!edge) throw new Error(`edge "${id}" not registered`);
  return edge;
};

describe("calculate-base-ltv edge", () => {
  const edge = getEdge("calculate-base-ltv");

  it("declares baseLoanAmount and propertyValue as inputs", () => {
    expect(edge.inputs).toEqual(["baseLoanAmount", "propertyValue"]);
    expect(edge.outputs).toEqual(["baseLtv"]);
  });

  it("computes baseLtv = baseLoanAmount / propertyValue", () => {
    const out = edge.compute({
      baseLoanAmount: money(800_000),
      propertyValue: money(1_000_000),
    });
    expect(Number(out.baseLtv)).toBeCloseTo(0.8, 6);
  });

  it("returns 0 when baseLoanAmount is 0", () => {
    const out = edge.compute({
      baseLoanAmount: money(0),
      propertyValue: money(500_000),
    });
    expect(Number(out.baseLtv)).toBe(0);
  });

  it("throws when propertyValue is 0", () => {
    expect(() =>
      edge.compute({
        baseLoanAmount: money(100_000),
        propertyValue: money(0),
      }),
    ).toThrow(/propertyValue must be > 0/);
  });

  it("computes a 100% LTV correctly", () => {
    const out = edge.compute({
      baseLoanAmount: money(500_000),
      propertyValue: money(500_000),
    });
    expect(Number(out.baseLtv)).toBe(1);
  });
});

describe("resolve-financed-loan-amount edge", () => {
  const edge = getEdge("resolve-financed-loan-amount");

  it("declares baseLoanAmount, upfrontGovernmentFee, financedUpfrontFees as inputs", () => {
    expect(edge.inputs).toEqual(["baseLoanAmount", "upfrontGovernmentFee", "financedUpfrontFees"]);
    expect(edge.outputs).toEqual(["loanAmount"]);
  });

  it("returns baseLoanAmount unchanged when financedUpfrontFees is false", () => {
    const out = edge.compute({
      baseLoanAmount: money(300_000),
      upfrontGovernmentFee: money(5_250),
      financedUpfrontFees: false,
    });
    expect(Number(out.loanAmount)).toBe(300_000);
  });

  it("returns baseLoanAmount unchanged when financedUpfrontFees is undefined", () => {
    const out = edge.compute({
      baseLoanAmount: money(300_000),
      upfrontGovernmentFee: money(5_250),
      financedUpfrontFees: undefined,
    });
    expect(Number(out.loanAmount)).toBe(300_000);
  });

  it("returns baseLoanAmount unchanged when financedUpfrontFees is null", () => {
    const out = edge.compute({
      baseLoanAmount: money(300_000),
      upfrontGovernmentFee: money(5_250),
      financedUpfrontFees: null,
    });
    expect(Number(out.loanAmount)).toBe(300_000);
  });

  it("rolls upfront fee into the loan when financedUpfrontFees is true", () => {
    const out = edge.compute({
      baseLoanAmount: money(300_000),
      upfrontGovernmentFee: money(5_250),
      financedUpfrontFees: true,
    });
    expect(Number(out.loanAmount)).toBe(305_250);
  });

  it("returns baseLoanAmount when upfrontGovernmentFee is 0 even if financed", () => {
    const out = edge.compute({
      baseLoanAmount: money(500_000),
      upfrontGovernmentFee: money(0),
      financedUpfrontFees: true,
    });
    expect(Number(out.loanAmount)).toBe(500_000);
  });

  it("computes a typical FHA 96.5% scenario with UFMIP financed", () => {
    // $300k base loan, FHA UFMIP = 1.75% of base = $5,250
    const out = edge.compute({
      baseLoanAmount: money(300_000),
      upfrontGovernmentFee: money(5_250),
      financedUpfrontFees: true,
    });
    expect(Number(out.loanAmount)).toBe(305_250);
  });

  it("computes a typical VA 100% scenario with funding fee financed", () => {
    // $400k base loan, VA funding fee 2.15% first-use = $8,600
    const out = edge.compute({
      baseLoanAmount: money(400_000),
      upfrontGovernmentFee: money(8_600),
      financedUpfrontFees: true,
    });
    expect(Number(out.loanAmount)).toBe(408_600);
  });

  it("throws when financedUpfrontFees is a non-boolean truthy value", () => {
    expect(() =>
      edge.compute({
        baseLoanAmount: money(300_000),
        upfrontGovernmentFee: money(5_250),
        financedUpfrontFees: "true",
      }),
    ).toThrow(/financedUpfrontFees to be boolean/);
  });

  it("throws when financedUpfrontFees is a number", () => {
    expect(() =>
      edge.compute({
        baseLoanAmount: money(300_000),
        upfrontGovernmentFee: money(5_250),
        financedUpfrontFees: 1,
      }),
    ).toThrow(/financedUpfrontFees to be boolean/);
  });
});

describe("financed-loan-amount edges integration semantics", () => {
  const baseLtvEdge = getEdge("calculate-base-ltv");
  const financedEdge = getEdge("resolve-financed-loan-amount");

  it("baseLtv is independent of financedUpfrontFees", () => {
    const baseInputs = {
      baseLoanAmount: money(300_000),
      propertyValue: money(310_881),
    };
    const baseLtvOut = baseLtvEdge.compute(baseInputs);
    expect(Number(baseLtvOut.baseLtv)).toBeCloseTo(0.965, 4);

    const financedOut = financedEdge.compute({
      baseLoanAmount: money(300_000),
      upfrontGovernmentFee: money(5_250),
      financedUpfrontFees: true,
    });
    // financed loanAmount > propertyValue is permitted at this layer; downstream
    // LTV checks operate on `loanAmount` and may exceed 100% accordingly.
    expect(Number(financedOut.loanAmount)).toBe(305_250);
  });

  it("preserves the cycle-break: government-fees consumes baseLtv, not the financed loanAmount", () => {
    // Sanity: the resolve-financed-loan-amount edge does NOT take ltv or
    // baseLtv as an input. It only depends on baseLoanAmount + the upfront
    // fee + the flag. This ensures the dependency chain is acyclic.
    expect(financedEdge.inputs).not.toContain("ltv");
    expect(financedEdge.inputs).not.toContain("baseLtv");
  });
});
