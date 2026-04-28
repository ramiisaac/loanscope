import { describe, expect, it } from "vitest";
import { IncomeType } from "@loanscope/domain";
import { FHA } from "../government/fha";
import { VA } from "../government/va";
import { USDA } from "../government/usda";
import { PortfolioBase } from "../channels/portfolio";

describe("FHA incomePolicies", () => {
  it("declares an incomePolicies block on baseConstraints", () => {
    expect(FHA.baseConstraints?.incomePolicies).toBeDefined();
  });

  it("caps Rental income at 75% via PercentOfStated", () => {
    const rental = FHA.baseConstraints?.incomePolicies?.perIncomeType?.[IncomeType.Rental];
    expect(rental).toBeDefined();
    expect(rental?.kind).toBe("PercentOfStated");
    if (rental?.kind === "PercentOfStated") {
      expect(Number(rental.factor)).toBeCloseTo(0.75, 6);
    }
  });

  it("counts SelfEmployed at full face value (factor 1.0)", () => {
    const se = FHA.baseConstraints?.incomePolicies?.perIncomeType?.[IncomeType.SelfEmployed];
    expect(se).toBeDefined();
    expect(se?.kind).toBe("PercentOfStated");
    if (se?.kind === "PercentOfStated") {
      expect(Number(se.factor)).toBe(1);
    }
  });

  it("counts Bonus at full face value (factor 1.0)", () => {
    const bonus = FHA.baseConstraints?.incomePolicies?.perIncomeType?.[IncomeType.Bonus];
    expect(bonus).toBeDefined();
    expect(bonus?.kind).toBe("PercentOfStated");
    if (bonus?.kind === "PercentOfStated") {
      expect(Number(bonus.factor)).toBe(1);
    }
  });

  it("sets maxRentalFactor to 0.75", () => {
    expect(FHA.baseConstraints?.incomePolicies?.maxRentalFactor).toBe(0.75);
  });

  // Feature 4: FHA 4000.1 II.A.4.c.iv requires 24-month averaging of
  // self-employed income from filed tax returns. The product declares the
  // window; the engine bridges to AveragedMonths when a stream supplies
  // sufficient historicalAmounts.
  it("declares selfEmployedAveragingMonths = 24 (HUD 4000.1 II.A.4.c.iv)", () => {
    expect(FHA.baseConstraints?.incomePolicies?.selfEmployedAveragingMonths).toBe(24);
  });
});

describe("VA incomePolicies", () => {
  it("declares an incomePolicies block on baseConstraints", () => {
    expect(VA.baseConstraints?.incomePolicies).toBeDefined();
  });

  it("caps Rental income at 75% via PercentOfStated", () => {
    const rental = VA.baseConstraints?.incomePolicies?.perIncomeType?.[IncomeType.Rental];
    expect(rental).toBeDefined();
    expect(rental?.kind).toBe("PercentOfStated");
    if (rental?.kind === "PercentOfStated") {
      expect(Number(rental.factor)).toBeCloseTo(0.75, 6);
    }
  });

  it("grosses up SocialSecurity by 1.25x (non-taxable)", () => {
    const ss = VA.baseConstraints?.incomePolicies?.perIncomeType?.[IncomeType.SocialSecurity];
    expect(ss).toBeDefined();
    expect(ss?.kind).toBe("PercentOfStated");
    if (ss?.kind === "PercentOfStated") {
      expect(Number(ss.factor)).toBeCloseTo(1.25, 6);
    }
  });

  it("sets maxRentalFactor to 0.75", () => {
    expect(VA.baseConstraints?.incomePolicies?.maxRentalFactor).toBe(0.75);
  });

  // Feature 4: VA Lender's Handbook 26-7 Ch. 4 requires 2-year averaging
  // of self-employed income from federal tax returns.
  it("declares selfEmployedAveragingMonths = 24 (VA 26-7 Ch. 4)", () => {
    expect(VA.baseConstraints?.incomePolicies?.selfEmployedAveragingMonths).toBe(24);
  });
});

describe("USDA incomePolicies", () => {
  it("declares an incomePolicies block on baseConstraints", () => {
    expect(USDA.baseConstraints?.incomePolicies).toBeDefined();
  });

  it("caps Rental income at 75% via PercentOfStated", () => {
    const rental = USDA.baseConstraints?.incomePolicies?.perIncomeType?.[IncomeType.Rental];
    expect(rental).toBeDefined();
    expect(rental?.kind).toBe("PercentOfStated");
    if (rental?.kind === "PercentOfStated") {
      expect(Number(rental.factor)).toBeCloseTo(0.75, 6);
    }
  });

  it("sets maxRentalFactor to 0.75", () => {
    expect(USDA.baseConstraints?.incomePolicies?.maxRentalFactor).toBe(0.75);
  });

  it("does not override SelfEmployed (deferred to math-layer default)", () => {
    const se = USDA.baseConstraints?.incomePolicies?.perIncomeType?.[IncomeType.SelfEmployed];
    expect(se).toBeUndefined();
  });

  // Feature 4: USDA HB-1-3555 Ch. 9 requires 24-month averaging of
  // self-employed income from tax returns. SE has no perIncomeType
  // override (factor stays 1.0), but the averaging bridge applies once
  // a stream supplies enough history.
  it("declares selfEmployedAveragingMonths = 24 (USDA HB-1-3555 Ch. 9)", () => {
    expect(USDA.baseConstraints?.incomePolicies?.selfEmployedAveragingMonths).toBe(24);
  });
});

describe("PortfolioBase incomePolicies", () => {
  it("declares an incomePolicies block on baseConstraints", () => {
    expect(PortfolioBase.baseConstraints?.incomePolicies).toBeDefined();
  });

  it("defaults Rental to 75% via PercentOfStated", () => {
    const rental =
      PortfolioBase.baseConstraints?.incomePolicies?.perIncomeType?.[IncomeType.Rental];
    expect(rental).toBeDefined();
    expect(rental?.kind).toBe("PercentOfStated");
    if (rental?.kind === "PercentOfStated") {
      expect(Number(rental.factor)).toBeCloseTo(0.75, 6);
    }
  });

  it("counts SelfEmployed at full face value (factor 1.0)", () => {
    const se =
      PortfolioBase.baseConstraints?.incomePolicies?.perIncomeType?.[IncomeType.SelfEmployed];
    expect(se).toBeDefined();
    expect(se?.kind).toBe("PercentOfStated");
    if (se?.kind === "PercentOfStated") {
      expect(Number(se.factor)).toBe(1);
    }
  });

  it("allows rental factor up to 0.85 via maxRentalFactor", () => {
    expect(PortfolioBase.baseConstraints?.incomePolicies?.maxRentalFactor).toBe(0.85);
  });

  // Feature 4: portfolio jumbo programs typically follow agency 24-month
  // averaging conventions for self-employed income. Pinned here so a
  // future loosening to 12 months is an explicit policy decision.
  it("declares selfEmployedAveragingMonths = 24 (portfolio convention)", () => {
    expect(PortfolioBase.baseConstraints?.incomePolicies?.selfEmployedAveragingMonths).toBe(24);
  });
});
