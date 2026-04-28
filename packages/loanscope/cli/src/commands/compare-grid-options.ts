import { ratio } from "@loanscope/domain";
import type { AmortizationTerm, RatePct } from "@loanscope/domain";
import type { ComparisonDimension } from "@loanscope/compare";
import {
  termDimension,
  rateDimension,
  ltvSteps,
  loanAmountSteps,
  occupancyDimension,
  productDimension,
  lenderDimension,
  borrowerSetDimension,
  ficoDimension,
  downPaymentSteps,
  propertyTypeDimension,
  loanPurposeDimension,
} from "@loanscope/compare";
import { CliValidationError } from "../cli-error";
import {
  parseCliAmortizationTerm,
  parseCliOccupancy,
  parseCliPropertyType,
  parseCliLoanPurpose,
} from "../cli-parsers";
import { parseCliRatePct, parseCliMoney, parseCliFico } from "../cli-parsers";
import { parseCliRange, parseCliList, parseCliNumberList, parseBorrowerSets } from "../cli-parsers";
import { validateLenderIds, validateProductIds } from "../cli-validators";

export interface CompareGridOptionFlags {
  terms?: string;
  rates?: string;
  ltv?: string;
  loanAmount?: string;
  occupancy?: string;
  fico?: string;
  downPayment?: string;
  propertyType?: string;
  purpose?: string;
  products?: string;
  lenders?: string;
  borrowers?: string[];
}

export type GridSpec = ReadonlyArray<ComparisonDimension>;

interface ParseCompareGridOptionsInput {
  readonly options: CompareGridOptionFlags;
  readonly allProductIds: readonly string[];
  readonly allLenderIds: readonly string[];
  readonly hasFlagSource: boolean;
}

export const parseCompareGridOptions = ({
  options,
  allProductIds,
  allLenderIds,
  hasFlagSource,
}: ParseCompareGridOptionsInput): GridSpec => {
  const dimensions: ComparisonDimension[] = [];

  if (options.terms) {
    const termValues = parseCliNumberList(options.terms, "terms");
    const terms = termValues.map((term) => parseCliAmortizationTerm(String(term)));
    dimensions.push(termDimension(terms as AmortizationTerm[]));
  }

  if (options.rates) {
    const rateValues = parseCliList(options.rates);
    if (rateValues.length === 0) {
      throw new CliValidationError("Invalid rates: list must contain at least one value.");
    }
    const rates = rateValues.map((rate) => parseCliRatePct(rate, "rate"));
    dimensions.push(rateDimension(rates as RatePct[]));
  }

  if (options.ltv) {
    const range = parseCliRange(options.ltv, "LTV");
    if (range.min < 0 || range.max > 1) {
      throw new CliValidationError(
        `Invalid LTV range: values must be between 0 and 1, got ${range.min}:${range.max}.`,
      );
    }
    dimensions.push(ltvSteps(ratio(range.min), ratio(range.max), ratio(range.step)));
  }

  if (options.loanAmount) {
    const range = parseCliRange(options.loanAmount, "loan amount");
    if (range.min < 0) {
      throw new CliValidationError(
        `Invalid loan amount range: min must be non-negative, got ${range.min}.`,
      );
    }
    dimensions.push(
      loanAmountSteps(
        parseCliMoney(String(range.min), "loan amount min"),
        parseCliMoney(String(range.max), "loan amount max"),
        parseCliMoney(String(range.step), "loan amount step"),
      ),
    );
  }

  if (options.occupancy) {
    const occupancyValues = parseCliList(options.occupancy);
    if (occupancyValues.length === 0) {
      throw new CliValidationError("Invalid occupancy: list must contain at least one value.");
    }
    dimensions.push(occupancyDimension(occupancyValues.map((value) => parseCliOccupancy(value))));
  }

  if (options.fico) {
    const ficoValues = parseCliList(options.fico);
    if (ficoValues.length === 0) {
      throw new CliValidationError("Invalid FICO: list must contain at least one value.");
    }
    dimensions.push(ficoDimension(ficoValues.map((value) => parseCliFico(value))));
  }

  if (options.downPayment) {
    const range = parseCliRange(options.downPayment, "down payment");
    if (range.min < 0) {
      throw new CliValidationError(
        `Invalid down payment range: min must be non-negative, got ${range.min}.`,
      );
    }
    dimensions.push(
      downPaymentSteps(
        parseCliMoney(String(range.min), "down payment min"),
        parseCliMoney(String(range.max), "down payment max"),
        parseCliMoney(String(range.step), "down payment step"),
      ),
    );
  }

  if (options.propertyType) {
    const propertyTypeValues = parseCliList(options.propertyType);
    if (propertyTypeValues.length === 0) {
      throw new CliValidationError("Invalid property type: list must contain at least one value.");
    }
    dimensions.push(
      propertyTypeDimension(propertyTypeValues.map((value) => parseCliPropertyType(value))),
    );
  }

  if (options.purpose) {
    const purposeValues = parseCliList(options.purpose);
    if (purposeValues.length === 0) {
      throw new CliValidationError("Invalid loan purpose: list must contain at least one value.");
    }
    dimensions.push(loanPurposeDimension(purposeValues.map((value) => parseCliLoanPurpose(value))));
  }

  if (options.products && !hasFlagSource) {
    const productIds = parseCliList(options.products);
    if (productIds.length === 0) {
      throw new CliValidationError("Invalid products: list must contain at least one value.");
    }
    validateProductIds(productIds, allProductIds);
    dimensions.push(productDimension(productIds));
  }

  if (options.lenders && !hasFlagSource) {
    const lenderIds = parseCliList(options.lenders);
    if (lenderIds.length === 0) {
      throw new CliValidationError("Invalid lenders: list must contain at least one value.");
    }
    validateLenderIds(lenderIds, allLenderIds);
    dimensions.push(lenderDimension(lenderIds));
  }

  if (options.borrowers && options.borrowers.length > 0) {
    const sets = parseBorrowerSets(options.borrowers);
    if (sets.length === 0 || sets.some((set) => set.length === 0)) {
      throw new CliValidationError(
        "Invalid borrower sets: each set must contain at least one borrower id.",
      );
    }
    dimensions.push(borrowerSetDimension(sets));
  }

  return dimensions;
};
