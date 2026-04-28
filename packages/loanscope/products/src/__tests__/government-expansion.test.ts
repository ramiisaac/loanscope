import { describe, expect, it } from "vitest";
import { AmortizationTerm, LoanPurpose, Occupancy } from "@loanscope/domain";
import { FHA } from "../government/fha";
import { FhaStreamline } from "../government/fha-streamline";
import { VA } from "../government/va";
import { VaIrrrl } from "../government/va-irrrl";
import { USDA } from "../government/usda";
import { UsdaStreamline } from "../government/usda-streamline";

describe("FHA", () => {
  it("caps primary LTV at 96.5%", () => {
    const variant = FHA.variants[0];
    expect(variant).toBeDefined();
    expect(Number(variant!.constraints[Occupancy.Primary]!.maxLTVRatio)).toBe(0.965);
  });

  it("disallows secondary and investment occupancy (LTV 0)", () => {
    const variant = FHA.variants[0]!;
    expect(Number(variant.constraints[Occupancy.Secondary]!.maxLTVRatio)).toBe(0.0);
    expect(Number(variant.constraints[Occupancy.Investment]!.maxLTVRatio)).toBe(0.0);
  });

  it("supports 30/25/20/15-year fixed terms", () => {
    const variant = FHA.variants[0]!;
    expect(variant.terms).toEqual([
      AmortizationTerm.M360,
      AmortizationTerm.M300,
      AmortizationTerm.M240,
      AmortizationTerm.M180,
    ]);
  });

  it("encodes max DTI of 57%", () => {
    const variant = FHA.variants[0]!;
    expect(Number(variant.constraints[Occupancy.Primary]!.maxDTIRatio)).toBe(0.57);
  });

  it("allows Purchase, RateTermRefi, and CashOutRefi", () => {
    const purposes = FHA.baseConstraints?.allowedPurposes ?? [];
    expect(purposes).toContain(LoanPurpose.Purchase);
    expect(purposes).toContain(LoanPurpose.RateTermRefi);
    expect(purposes).toContain(LoanPurpose.CashOutRefi);
  });

  it("caps cash-out refinance LTV at 80% per HUD ML 2019-11", () => {
    const cap = FHA.baseConstraints?.maxLtvByPurpose?.[LoanPurpose.CashOutRefi];
    expect(cap).toBeDefined();
    expect(Number(cap)).toBe(0.8);
  });
});

describe("FHA Streamline", () => {
  it("restricts loan purpose to RateTermRefi only", () => {
    expect(FhaStreamline.baseConstraints?.allowedPurposes).toEqual([LoanPurpose.RateTermRefi]);
  });

  it("caps primary LTV at 97.75%", () => {
    const variant = FhaStreamline.variants[0]!;
    expect(Number(variant.constraints[Occupancy.Primary]!.maxLTVRatio)).toBe(0.9775);
  });
});

describe("VA", () => {
  it("allows 100% LTV for primary occupancy", () => {
    const variant = VA.variants[0]!;
    expect(Number(variant.constraints[Occupancy.Primary]!.maxLTVRatio)).toBe(1.0);
  });

  it("encodes max DTI of 60%", () => {
    const variant = VA.variants[0]!;
    expect(Number(variant.constraints[Occupancy.Primary]!.maxDTIRatio)).toBe(0.6);
  });

  it("encodes minimum FICO of 620", () => {
    const variant = VA.variants[0]!;
    expect(variant.constraints[Occupancy.Primary]!.minFico).toBe(620);
  });

  it("allows Purchase, RateTermRefi, and CashOutRefi", () => {
    const purposes = VA.baseConstraints?.allowedPurposes ?? [];
    expect(purposes).toContain(LoanPurpose.Purchase);
    expect(purposes).toContain(LoanPurpose.RateTermRefi);
    expect(purposes).toContain(LoanPurpose.CashOutRefi);
  });

  it("supports 30/25/20/15-year fixed terms", () => {
    const variant = VA.variants[0]!;
    expect(variant.terms).toEqual([
      AmortizationTerm.M360,
      AmortizationTerm.M300,
      AmortizationTerm.M240,
      AmortizationTerm.M180,
    ]);
  });
});

describe("VA IRRRL", () => {
  it("allows both IrrrlRefi (preferred) and RateTermRefi (legacy) purposes", () => {
    // Production change: Feature 1 — allowedPurposes was widened from
    // [RateTermRefi] to [IrrrlRefi, RateTermRefi] so the new first-class
    // IrrrlRefi enum is accepted alongside the legacy RateTermRefi +
    // priorUse=true signal that pre-existing scenarios rely on.
    const purposes = VaIrrrl.baseConstraints?.allowedPurposes ?? [];
    expect(purposes).toHaveLength(2);
    expect(purposes).toContain(LoanPurpose.IrrrlRefi);
    expect(purposes).toContain(LoanPurpose.RateTermRefi);
  });

  it("supports 30 and 15-year terms", () => {
    const variant = VaIrrrl.variants[0]!;
    expect(variant.terms).toEqual([AmortizationTerm.M360, AmortizationTerm.M180]);
  });
});

describe("USDA", () => {
  it("allows 100% LTV for primary occupancy", () => {
    const variant = USDA.variants[0]!;
    expect(Number(variant.constraints[Occupancy.Primary]!.maxLTVRatio)).toBe(1.0);
  });

  it("encodes max DTI of 50% (GUS auto-underwrite default)", () => {
    const variant = USDA.variants[0]!;
    expect(Number(variant.constraints[Occupancy.Primary]!.maxDTIRatio)).toBe(0.5);
  });

  it("encodes minimum FICO of 640 (GUS auto-underwrite threshold)", () => {
    const variant = USDA.variants[0]!;
    expect(variant.constraints[Occupancy.Primary]!.minFico).toBe(640);
  });

  it("allows only Purchase and RateTermRefi (no cash-out)", () => {
    expect(USDA.baseConstraints?.allowedPurposes).toEqual([
      LoanPurpose.Purchase,
      LoanPurpose.RateTermRefi,
    ]);
  });
});

describe("USDA Streamline", () => {
  it("restricts loan purpose to RateTermRefi only", () => {
    expect(UsdaStreamline.baseConstraints?.allowedPurposes).toEqual([LoanPurpose.RateTermRefi]);
  });
});
