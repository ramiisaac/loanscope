import Decimal from "decimal.js";
import { MonthlyHousing, Money, money } from "@loanscope/domain";

/**
 * Sum of monthly housing components (tax, insurance, HOA, MI, flood).
 * Throws on non-finite or negative component values.
 */
export const calculateHousingMonthly = (housing: MonthlyHousing): Money => {
  const components: { name: string; value: number }[] = [
    { name: "propertyTax", value: housing.propertyTax ?? 0 },
    { name: "insurance", value: housing.insurance ?? 0 },
    { name: "hoa", value: housing.hoa ?? 0 },
    { name: "mi", value: housing.mi ?? 0 },
    { name: "floodInsurance", value: housing.floodInsurance ?? 0 },
    { name: "governmentFee", value: housing.governmentFee ?? 0 },
  ];

  for (const c of components) {
    if (!Number.isFinite(c.value)) {
      throw new RangeError(`Housing component ${c.name} must be finite, got ${c.value}`);
    }
    if (c.value < 0) {
      throw new RangeError(`Housing component ${c.name} must be non-negative, got ${c.value}`);
    }
  }

  const total = components.reduce((sum, c) => sum.plus(c.value), new Decimal(0));
  return money(total.toNumber());
};

/**
 * PITI monthly payment: principal & interest plus housing costs.
 * Throws on non-finite or negative inputs.
 */
export const calculatePitiMonthly = (principalAndInterest: Money, housingMonthly: Money): Money => {
  if (!Number.isFinite(principalAndInterest) || !Number.isFinite(housingMonthly)) {
    throw new RangeError("PITI inputs must be finite");
  }
  if (principalAndInterest < 0) {
    throw new RangeError(`principalAndInterest must be non-negative, got ${principalAndInterest}`);
  }
  if (housingMonthly < 0) {
    throw new RangeError(`housingMonthly must be non-negative, got ${housingMonthly}`);
  }
  const total = new Decimal(principalAndInterest).plus(housingMonthly);
  return money(total.toNumber());
};
