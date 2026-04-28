import { describe, expect, it } from "vitest";
import {
  money,
  ratio,
  ratePct,
  months,
  ratioToPercent,
  percentToRatio,
  annualToMonthly,
  monthlyToAnnual,
  assertNever,
} from "../primitives";
import {
  Occupancy,
  LoanPurpose,
  PropertyType,
  LoanType,
  GovernmentProgram,
  CheckSeverity,
  ActionKind,
} from "../enums";

describe("primitives", () => {
  it("creates branded Money type", () => {
    const m = money(100000);
    expect(Number(m)).toBe(100000);
  });

  it("creates branded Ratio type", () => {
    const r = ratio(0.8);
    expect(Number(r)).toBe(0.8);
  });

  it("creates branded RatePct type", () => {
    const rate = ratePct(6.875);
    expect(Number(rate)).toBe(6.875);
  });

  it("creates branded Months type", () => {
    const term = months(360);
    expect(Number(term)).toBe(360);
  });

  it("converts ratio to percent", () => {
    expect(ratioToPercent(ratio(0.8))).toBe(80);
    expect(ratioToPercent(ratio(0.95))).toBe(95);
  });

  it("converts percent to ratio", () => {
    expect(Number(percentToRatio(80))).toBe(0.8);
    expect(Number(percentToRatio(95))).toBe(0.95);
  });

  it("converts annual to monthly", () => {
    expect(Number(annualToMonthly(money(12000)))).toBe(1000);
  });

  it("converts monthly to annual", () => {
    expect(Number(monthlyToAnnual(money(1000)))).toBe(12000);
  });
});

describe("enums", () => {
  it("has valid Occupancy values", () => {
    expect(Occupancy.Primary).toBe("Primary");
    expect(Occupancy.Secondary).toBe("Secondary");
    expect(Occupancy.Investment).toBe("Investment");
  });

  it("has valid LoanPurpose values", () => {
    expect(LoanPurpose.Purchase).toBe("Purchase");
    expect(LoanPurpose.RateTermRefi).toBe("RateTermRefi");
    expect(LoanPurpose.CashOutRefi).toBe("CashOutRefi");
  });

  it("has valid PropertyType values", () => {
    expect(PropertyType.SFR).toBe("SFR");
    expect(PropertyType.Condo).toBe("Condo");
    expect(PropertyType.MultiUnit).toBe("MultiUnit");
  });

  it("has valid LoanType values", () => {
    expect(LoanType.Conventional).toBe("Conventional");
    expect(LoanType.FHA).toBe("FHA");
    expect(LoanType.VA).toBe("VA");
    expect(LoanType.USDA).toBe("USDA");
    expect(LoanType.Jumbo).toBe("Jumbo");
    expect(LoanType.HighBalance).toBe("HighBalance");
  });

  it("has valid GovernmentProgram values", () => {
    expect(GovernmentProgram.FHA).toBe("FHA");
    expect(GovernmentProgram.VA).toBe("VA");
    expect(GovernmentProgram.USDA).toBe("USDA");
  });

  it("has valid CheckSeverity values", () => {
    expect(CheckSeverity.Blocker).toBe("blocker");
    expect(CheckSeverity.Warning).toBe("warning");
    expect(CheckSeverity.Info).toBe("info");
  });

  it("has ChangeTerm in ActionKind", () => {
    expect(ActionKind.ChangeTerm).toBe("ChangeTerm");
  });
});

describe("assertNever", () => {
  it("throws on unexpected value", () => {
    expect(() => assertNever("oops" as never)).toThrow("Unexpected value: oops");
  });

  it("throws with custom message", () => {
    expect(() => assertNever("x" as never, "bad value")).toThrow("bad value");
  });
});
