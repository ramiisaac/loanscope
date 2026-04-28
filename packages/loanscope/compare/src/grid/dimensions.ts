import Decimal from "decimal.js";
import type { RatePct } from "@loanscope/domain";
import {
  AmortizationTerm,
  LoanPurpose,
  Occupancy,
  PropertyType,
  Ratio,
  Money,
  assertNever,
  money,
  ratio,
} from "@loanscope/domain";
import type { ComparisonDimension } from "../types";
import { validateDimension } from "../types";

export const termDimension = (terms: AmortizationTerm[]): ComparisonDimension => {
  const dim: ComparisonDimension = { kind: "Terms", values: terms };
  validateDimension(dim);
  return dim;
};

export const rateDimension = (rates: RatePct[]): ComparisonDimension => {
  const dim: ComparisonDimension = { kind: "Rates", values: rates };
  validateDimension(dim);
  return dim;
};

export const ltvSteps = (min: Ratio, max: Ratio, step: Ratio): ComparisonDimension => {
  const dim: ComparisonDimension = { kind: "LTV", min, max, step };
  validateDimension(dim);
  return dim;
};

export const loanAmountSteps = (min: Money, max: Money, step: Money): ComparisonDimension => {
  const dim: ComparisonDimension = { kind: "LoanAmount", min, max, step };
  validateDimension(dim);
  return dim;
};

export const occupancyDimension = (occupancies: Occupancy[]): ComparisonDimension => {
  const dim: ComparisonDimension = { kind: "Occupancy", values: occupancies };
  validateDimension(dim);
  return dim;
};

export const productDimension = (productIds: string[]): ComparisonDimension => {
  const dim: ComparisonDimension = { kind: "Products", productIds };
  validateDimension(dim);
  return dim;
};

export const lenderDimension = (lenderIds: string[]): ComparisonDimension => {
  const dim: ComparisonDimension = { kind: "Lenders", lenderIds };
  validateDimension(dim);
  return dim;
};

export const borrowerSetDimension = (sets: string[][]): ComparisonDimension => {
  const dim: ComparisonDimension = { kind: "BorrowerSets", sets };
  validateDimension(dim);
  return dim;
};

export const ficoDimension = (scores: number[]): ComparisonDimension => {
  const dim: ComparisonDimension = { kind: "Fico", values: scores };
  validateDimension(dim);
  return dim;
};

export const downPaymentSteps = (min: Money, max: Money, step: Money): ComparisonDimension => {
  const dim: ComparisonDimension = { kind: "DownPayment", min, max, step };
  validateDimension(dim);
  return dim;
};

export const propertyTypeDimension = (types: PropertyType[]): ComparisonDimension => {
  const dim: ComparisonDimension = { kind: "PropertyType", values: types };
  validateDimension(dim);
  return dim;
};

export const loanPurposeDimension = (purposes: LoanPurpose[]): ComparisonDimension => {
  const dim: ComparisonDimension = { kind: "LoanPurpose", values: purposes };
  validateDimension(dim);
  return dim;
};

/** Expand a dimension into its concrete value list using Decimal.js for numeric steps. */
export const expandDimension = (dim: ComparisonDimension): unknown[] => {
  switch (dim.kind) {
    case "Terms":
      return dim.values;
    case "Rates":
      return dim.values;
    case "LTV": {
      const minD = new Decimal(dim.min);
      const maxD = new Decimal(dim.max);
      const stepD = new Decimal(dim.step);
      if (stepD.lte(0)) return [];
      const values: Ratio[] = [];
      let current = minD;
      while (current.lte(maxD.plus(new Decimal("1e-9")))) {
        values.push(ratio(current.toDecimalPlaces(6).toNumber()));
        current = current.plus(stepD);
      }
      return values;
    }
    case "LoanAmount": {
      const minD = new Decimal(dim.min);
      const maxD = new Decimal(dim.max);
      const stepD = new Decimal(dim.step);
      if (stepD.lte(0)) return [];
      const values: Money[] = [];
      let current = minD;
      while (current.lte(maxD.plus(new Decimal("1e-9")))) {
        values.push(money(current.toDecimalPlaces(2).toNumber()));
        current = current.plus(stepD);
      }
      return values;
    }
    case "Occupancy":
      return dim.values;
    case "Products":
      return dim.productIds;
    case "Lenders":
      return dim.lenderIds;
    case "BorrowerSets":
      return dim.sets;
    case "Fico":
      return dim.values;
    case "DownPayment": {
      const minD = new Decimal(dim.min);
      const maxD = new Decimal(dim.max);
      const stepD = new Decimal(dim.step);
      if (stepD.lte(0)) return [];
      const values: Money[] = [];
      let current = minD;
      while (current.lte(maxD.plus(new Decimal("1e-9")))) {
        values.push(money(current.toDecimalPlaces(2).toNumber()));
        current = current.plus(stepD);
      }
      return values;
    }
    case "PropertyType":
      return dim.values;
    case "LoanPurpose":
      return dim.values;
    default:
      return assertNever(dim);
  }
};
