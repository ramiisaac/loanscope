import { describe, expect, it } from "vitest";
import { LoanPurpose, money, months, ratio } from "@loanscope/domain";
import {
  calculateFhaUfmip,
  calculateFhaAnnualMipMonthly,
  calculateVaFundingFee,
  calculateUsdaUpfrontGuaranteeFee,
  calculateUsdaAnnualFeeMonthly,
  type VaServiceContext,
} from "../government-fees";

const defaultVaCtx: VaServiceContext = {
  priorUse: false,
  disabilityExempt: false,
  reserveOrGuard: false,
};

const priorUseCtx: VaServiceContext = {
  priorUse: true,
  disabilityExempt: false,
  reserveOrGuard: false,
};

const exemptCtx: VaServiceContext = {
  priorUse: false,
  disabilityExempt: true,
  reserveOrGuard: false,
};

/* ------------------------------------------------------------------ */
/*  FHA UFMIP                                                          */
/* ------------------------------------------------------------------ */

describe("calculateFhaUfmip", () => {
  it("returns 1.75% of base loan amount for a typical 30-yr loan", () => {
    const ufmip = calculateFhaUfmip({
      loanAmount: money(300_000),
      ltv: ratio(0.965),
      amortizationMonths: months(360),
    });
    expect(Number(ufmip)).toBeCloseTo(5_250, 2);
  });

  it("returns 0 for a $0 loan", () => {
    const ufmip = calculateFhaUfmip({
      loanAmount: money(0),
      ltv: ratio(0.965),
      amortizationMonths: months(360),
    });
    expect(Number(ufmip)).toBeCloseTo(0, 2);
  });

  it("returns 1.75% of $100k = $1,750", () => {
    const ufmip = calculateFhaUfmip({
      loanAmount: money(100_000),
      ltv: ratio(0.965),
      amortizationMonths: months(360),
    });
    expect(Number(ufmip)).toBeCloseTo(1_750, 2);
  });

  it("returns 1.75% of $1M = $17,500", () => {
    const ufmip = calculateFhaUfmip({
      loanAmount: money(1_000_000),
      ltv: ratio(0.965),
      amortizationMonths: months(360),
    });
    expect(Number(ufmip)).toBeCloseTo(17_500, 2);
  });
});

/* ------------------------------------------------------------------ */
/*  FHA annual MIP (monthly)                                           */
/* ------------------------------------------------------------------ */

describe("calculateFhaAnnualMipMonthly", () => {
  const loan = money(300_000);

  describe("term > 15 years (360 months)", () => {
    it("LTV <= 90% -> 50 bps", () => {
      const mip = calculateFhaAnnualMipMonthly({
        loanAmount: loan,
        ltv: ratio(0.9),
        amortizationMonths: months(360),
      });
      // 300000 * 0.005 / 12 = 125
      expect(Number(mip)).toBeCloseTo(125, 2);
    });

    it("90% < LTV <= 95% -> 50 bps", () => {
      const mip = calculateFhaAnnualMipMonthly({
        loanAmount: loan,
        ltv: ratio(0.95),
        amortizationMonths: months(360),
      });
      expect(Number(mip)).toBeCloseTo(125, 2);
    });

    it("LTV > 95% -> 55 bps (96.5% LTV)", () => {
      const mip = calculateFhaAnnualMipMonthly({
        loanAmount: loan,
        ltv: ratio(0.965),
        amortizationMonths: months(360),
      });
      // 300000 * 0.0055 / 12 = 137.50
      expect(Number(mip)).toBeCloseTo(137.5, 2);
    });

    it("term boundary: 181 months treated as long-term", () => {
      const mip = calculateFhaAnnualMipMonthly({
        loanAmount: loan,
        ltv: ratio(0.85),
        amortizationMonths: months(181),
      });
      // 300000 * 0.005 / 12 = 125
      expect(Number(mip)).toBeCloseTo(125, 2);
    });
  });

  describe("term <= 15 years (180 months)", () => {
    it("LTV <= 90% -> 15 bps", () => {
      const mip = calculateFhaAnnualMipMonthly({
        loanAmount: loan,
        ltv: ratio(0.9),
        amortizationMonths: months(180),
      });
      // 300000 * 0.0015 / 12 = 37.5
      expect(Number(mip)).toBeCloseTo(37.5, 2);
    });

    it("90% < LTV <= 95% -> 40 bps", () => {
      const mip = calculateFhaAnnualMipMonthly({
        loanAmount: loan,
        ltv: ratio(0.95),
        amortizationMonths: months(180),
      });
      // 300000 * 0.004 / 12 = 100
      expect(Number(mip)).toBeCloseTo(100, 2);
    });

    it("LTV > 95% -> 40 bps (15-yr cap)", () => {
      const mip = calculateFhaAnnualMipMonthly({
        loanAmount: loan,
        ltv: ratio(0.965),
        amortizationMonths: months(180),
      });
      expect(Number(mip)).toBeCloseTo(100, 2);
    });
  });

  it("LTV exactly 80% on 30-yr -> 50 bps tier", () => {
    const mip = calculateFhaAnnualMipMonthly({
      loanAmount: loan,
      ltv: ratio(0.8),
      amortizationMonths: months(360),
    });
    expect(Number(mip)).toBeCloseTo(125, 2);
  });
});

/* ------------------------------------------------------------------ */
/*  VA funding fee                                                     */
/* ------------------------------------------------------------------ */

describe("calculateVaFundingFee", () => {
  const loan = money(400_000);

  it("disability-exempt borrower owes $0 regardless of bracket", () => {
    const fee = calculateVaFundingFee({
      loanAmount: loan,
      ltv: ratio(1.0),
      serviceContext: exemptCtx,
      loanPurpose: LoanPurpose.Purchase,
    });
    expect(Number(fee)).toBeCloseTo(0, 2);
  });

  describe("purchase, first use", () => {
    it("LTV <= 90% -> 1.25%", () => {
      const fee = calculateVaFundingFee({
        loanAmount: loan,
        ltv: ratio(0.9),
        serviceContext: defaultVaCtx,
        loanPurpose: LoanPurpose.Purchase,
      });
      // 400000 * 0.0125 = 5000
      expect(Number(fee)).toBeCloseTo(5_000, 2);
    });

    it("90% < LTV <= 95% -> 1.50%", () => {
      const fee = calculateVaFundingFee({
        loanAmount: loan,
        ltv: ratio(0.95),
        serviceContext: defaultVaCtx,
        loanPurpose: LoanPurpose.Purchase,
      });
      // 400000 * 0.015 = 6000
      expect(Number(fee)).toBeCloseTo(6_000, 2);
    });

    it("LTV > 95% -> 2.15%", () => {
      const fee = calculateVaFundingFee({
        loanAmount: loan,
        ltv: ratio(1.0),
        serviceContext: defaultVaCtx,
        loanPurpose: LoanPurpose.Purchase,
      });
      // 400000 * 0.0215 = 8600
      expect(Number(fee)).toBeCloseTo(8_600, 2);
    });
  });

  describe("purchase, subsequent use", () => {
    it("LTV <= 90% -> 1.25%", () => {
      const fee = calculateVaFundingFee({
        loanAmount: loan,
        ltv: ratio(0.85),
        serviceContext: priorUseCtx,
        loanPurpose: LoanPurpose.Purchase,
      });
      expect(Number(fee)).toBeCloseTo(5_000, 2);
    });

    it("90% < LTV <= 95% -> 1.50%", () => {
      const fee = calculateVaFundingFee({
        loanAmount: loan,
        ltv: ratio(0.93),
        serviceContext: priorUseCtx,
        loanPurpose: LoanPurpose.Purchase,
      });
      expect(Number(fee)).toBeCloseTo(6_000, 2);
    });

    it("LTV > 95% -> 3.30%", () => {
      const fee = calculateVaFundingFee({
        loanAmount: loan,
        ltv: ratio(1.0),
        serviceContext: priorUseCtx,
        loanPurpose: LoanPurpose.Purchase,
      });
      // 400000 * 0.033 = 13200
      expect(Number(fee)).toBeCloseTo(13_200, 2);
    });
  });

  describe("cash-out refi", () => {
    it("first use -> 2.15%", () => {
      const fee = calculateVaFundingFee({
        loanAmount: loan,
        ltv: ratio(0.8),
        serviceContext: defaultVaCtx,
        loanPurpose: LoanPurpose.CashOutRefi,
      });
      expect(Number(fee)).toBeCloseTo(8_600, 2);
    });

    it("subsequent use -> 3.30%", () => {
      const fee = calculateVaFundingFee({
        loanAmount: loan,
        ltv: ratio(0.8),
        serviceContext: priorUseCtx,
        loanPurpose: LoanPurpose.CashOutRefi,
      });
      expect(Number(fee)).toBeCloseTo(13_200, 2);
    });
  });

  describe("rate-term refi", () => {
    it("non-IRRRL (first use) -> 2.15%", () => {
      const fee = calculateVaFundingFee({
        loanAmount: loan,
        ltv: ratio(0.8),
        serviceContext: defaultVaCtx,
        loanPurpose: LoanPurpose.RateTermRefi,
      });
      expect(Number(fee)).toBeCloseTo(8_600, 2);
    });

    it("IRRRL (signalled by RateTermRefi + priorUse) -> 0.50%", () => {
      const fee = calculateVaFundingFee({
        loanAmount: loan,
        ltv: ratio(0.8),
        serviceContext: priorUseCtx,
        loanPurpose: LoanPurpose.RateTermRefi,
      });
      // 400000 * 0.005 = 2000
      expect(Number(fee)).toBeCloseTo(2_000, 2);
    });
  });

  it("LTV exactly 80% (purchase, first use) sits in 1.25% bracket", () => {
    const fee = calculateVaFundingFee({
      loanAmount: loan,
      ltv: ratio(0.8),
      serviceContext: defaultVaCtx,
      loanPurpose: LoanPurpose.Purchase,
    });
    expect(Number(fee)).toBeCloseTo(5_000, 2);
  });

  // Feature 1: VA IRRRL is now signalled by the explicit
  // LoanPurpose.IrrrlRefi enum value. The legacy RateTermRefi + priorUse
  // path remains supported for scenarios authored before the enum existed.
  describe("VA IRRRL via LoanPurpose.IrrrlRefi", () => {
    it("IrrrlRefi + first-use + 100% LTV -> 0.50% (priorUse irrelevant)", () => {
      const fee = calculateVaFundingFee({
        loanAmount: loan,
        ltv: ratio(1.0),
        serviceContext: defaultVaCtx,
        loanPurpose: LoanPurpose.IrrrlRefi,
      });
      // 400000 * 0.005 = 2000
      expect(Number(fee)).toBeCloseTo(2_000, 2);
    });

    it("IrrrlRefi + prior-use + 100% LTV -> 0.50% (priorUse irrelevant)", () => {
      const fee = calculateVaFundingFee({
        loanAmount: loan,
        ltv: ratio(1.0),
        serviceContext: priorUseCtx,
        loanPurpose: LoanPurpose.IrrrlRefi,
      });
      expect(Number(fee)).toBeCloseTo(2_000, 2);
    });

    it("IrrrlRefi + disability-exempt -> $0", () => {
      const fee = calculateVaFundingFee({
        loanAmount: loan,
        ltv: ratio(1.0),
        serviceContext: exemptCtx,
        loanPurpose: LoanPurpose.IrrrlRefi,
      });
      expect(Number(fee)).toBeCloseTo(0, 2);
    });

    it("IrrrlRefi rate is independent of LTV bracket (80% LTV -> 0.50%)", () => {
      const fee = calculateVaFundingFee({
        loanAmount: loan,
        ltv: ratio(0.8),
        serviceContext: defaultVaCtx,
        loanPurpose: LoanPurpose.IrrrlRefi,
      });
      expect(Number(fee)).toBeCloseTo(2_000, 2);
    });

    // Backward compatibility: legacy RateTermRefi + priorUse=true must
    // continue to yield the IRRRL 0.50% rate so pre-existing scenarios
    // (e.g. examples/scenarios/23-va-irrrl.yaml) keep producing identical
    // funding-fee math.
    it("legacy RateTermRefi + priorUse=true still yields 0.50% (backward compat)", () => {
      const fee = calculateVaFundingFee({
        loanAmount: loan,
        ltv: ratio(0.8),
        serviceContext: priorUseCtx,
        loanPurpose: LoanPurpose.RateTermRefi,
      });
      expect(Number(fee)).toBeCloseTo(2_000, 2);
    });

    it("legacy RateTermRefi + priorUse=false yields 2.15% (non-IRRRL refi)", () => {
      const fee = calculateVaFundingFee({
        loanAmount: loan,
        ltv: ratio(0.8),
        serviceContext: defaultVaCtx,
        loanPurpose: LoanPurpose.RateTermRefi,
      });
      // 400000 * 0.0215 = 8600
      expect(Number(fee)).toBeCloseTo(8_600, 2);
    });
  });
});

/* ------------------------------------------------------------------ */
/*  USDA                                                               */
/* ------------------------------------------------------------------ */

describe("USDA fees", () => {
  it("upfront guarantee = 1.00% of loan ($300k -> $3,000)", () => {
    const fee = calculateUsdaUpfrontGuaranteeFee({
      loanAmount: money(300_000),
    });
    expect(Number(fee)).toBeCloseTo(3_000, 2);
  });

  it("upfront with $0 loan -> $0 (no division by zero)", () => {
    const fee = calculateUsdaUpfrontGuaranteeFee({ loanAmount: money(0) });
    expect(Number(fee)).toBeCloseTo(0, 2);
  });

  it("annual fee monthly = 0.35% / 12 ($300k -> $87.50/mo)", () => {
    const monthly = calculateUsdaAnnualFeeMonthly({
      loanAmount: money(300_000),
    });
    // 300000 * 0.0035 / 12 = 87.5
    expect(Number(monthly)).toBeCloseTo(87.5, 2);
  });

  it("annual monthly with $0 loan -> $0", () => {
    const monthly = calculateUsdaAnnualFeeMonthly({ loanAmount: money(0) });
    expect(Number(monthly)).toBeCloseTo(0, 2);
  });
});
