import Decimal from "decimal.js";
import { Money, PropertyType, Ratio, money } from "@loanscope/domain";

const stateRateAdjustments: Record<string, number> = {
  NJ: 0.02,
  IL: 0.019,
  CT: 0.018,
  NH: 0.017,
  HI: 0.008,
  AL: 0.007,
  CO: 0.0085,
};

const closingCostRateAdjustments: Record<string, number> = {
  NY: 0.04,
  FL: 0.035,
  TX: 0.0325,
  CA: 0.0335,
};

const hoaAdjustments: Record<string, number> = {
  CA: 75,
  HI: 100,
  NY: 60,
};

export const estimatePropertyTax = (propertyValue: Money, stateCode?: string): Money => {
  const annualRate = stateCode ? (stateRateAdjustments[stateCode] ?? 0.0125) : 0.0125;
  const annual = new Decimal(propertyValue).mul(annualRate);
  return money(annual.div(12).toNumber());
};

export const estimateInsurance = (propertyValue: Money, propertyType?: PropertyType): Money => {
  let annualRate = 0.0035;
  if (propertyType === PropertyType.Condo) annualRate = 0.004;
  if (propertyType === PropertyType.Townhome) annualRate = 0.0038;
  if (propertyType === PropertyType.MultiUnit) annualRate = 0.0045;
  const annual = new Decimal(propertyValue).mul(annualRate);
  return money(annual.div(12).toNumber());
};

export const estimateHoa = (propertyType: PropertyType, stateCode?: string): Money => {
  if (propertyType === PropertyType.SFR) return money(0);
  if (propertyType === PropertyType.Condo || propertyType === PropertyType.Townhome) {
    const base = 300;
    const adjustment = stateCode ? (hoaAdjustments[stateCode] ?? 0) : 0;
    return money(base + adjustment);
  }
  return money(0);
};

export const estimateMI = (ltv: Ratio, fico: number, loanAmount: Money): Money => {
  const ltvPct = Number(ltv);
  let rate = 0;
  if (ltvPct > 0.95) rate = 0.015;
  else if (ltvPct > 0.9) rate = 0.012;
  else if (ltvPct > 0.85) rate = 0.009;
  else if (ltvPct > 0.8) rate = 0.006;
  if (fico < 700) rate += 0.002;
  const annual = new Decimal(loanAmount).mul(rate);
  return money(annual.div(12).toNumber());
};

export const estimateClosingCosts = (loanAmount: Money, stateCode?: string): Money => {
  const rate = stateCode ? (closingCostRateAdjustments[stateCode] ?? 0.03) : 0.03;
  const estimated = new Decimal(loanAmount).mul(rate);
  return money(estimated.toNumber());
};
