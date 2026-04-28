import Decimal from "decimal.js";
import { LoanPurpose, Occupancy, PropertyType, assertNever, money } from "@loanscope/domain";
import type {
  AmortizationTerm,
  Money,
  RatePct,
  Ratio,
  Transaction,
  ProductDefinition,
} from "@loanscope/domain";
import type { ComparisonDimension, ComparisonGrid } from "../types";
import { validateDimension } from "../types";
import { expandDimension } from "./dimensions";

export interface ExpandedGridCell {
  coordinates: Record<string, unknown>;
  modifiedTransaction: Transaction;
}

const dimensionKey = (dim: ComparisonDimension): string => {
  switch (dim.kind) {
    case "Terms":
      return "term";
    case "Rates":
      return "rate";
    case "LTV":
      return "ltv";
    case "LoanAmount":
      return "loanAmount";
    case "Occupancy":
      return "occupancy";
    case "Products":
      return "productId";
    case "Lenders":
      return "lenderId";
    case "BorrowerSets":
      return "borrowerSet";
    case "Fico":
      return "fico";
    case "DownPayment":
      return "downPayment";
    case "PropertyType":
      return "propertyType";
    case "LoanPurpose":
      return "loanPurpose";
    default:
      return assertNever(dim);
  }
};

const cloneTransaction = (transaction: Transaction): Transaction => {
  return structuredClone(transaction);
};

// ---------------------------------------------------------------------------
// Validated value extractors -- replace raw `as` casts
// ---------------------------------------------------------------------------

const VALID_TERMS = new Set<number>([120, 180, 240, 300, 360, 480]);

const extractTerm = (value: unknown): AmortizationTerm => {
  if (typeof value !== "number" || !VALID_TERMS.has(value)) {
    throw new Error(
      `Invalid amortization term: ${String(value)}. Expected one of ${[...VALID_TERMS].join(", ")}`,
    );
  }
  return value as AmortizationTerm;
};

const extractRate = (value: unknown): RatePct => {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`Invalid rate value: ${String(value)}. Expected a non-negative finite number`);
  }
  return value as RatePct;
};

const extractRatio = (value: unknown): Ratio => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Invalid ratio value: ${String(value)}. Expected a finite number`);
  }
  return value as Ratio;
};

const extractMoney = (value: unknown): Money => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Invalid money value: ${String(value)}. Expected a finite number`);
  }
  return value as Money;
};

const VALID_OCCUPANCIES = new Set<string>(Object.values(Occupancy));

const extractOccupancy = (value: unknown): Occupancy => {
  if (typeof value !== "string" || !VALID_OCCUPANCIES.has(value)) {
    throw new Error(
      `Invalid occupancy value: ${String(value)}. Expected one of ${[...VALID_OCCUPANCIES].join(", ")}`,
    );
  }
  return value as Occupancy;
};

const extractBorrowerIds = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    throw new Error(`Invalid borrower set: expected string[], got ${typeof value}`);
  }
  for (let i = 0; i < value.length; i++) {
    if (typeof value[i] !== "string") {
      throw new Error(`Invalid borrower ID at index ${i}: expected string, got ${typeof value[i]}`);
    }
  }
  return value as string[];
};

const extractFico = (value: unknown): number => {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 300 || value > 850) {
    throw new Error(
      `Invalid FICO score: ${String(value)}. Expected an integer between 300 and 850`,
    );
  }
  return value;
};

const VALID_PROPERTY_TYPES = new Set<string>(Object.values(PropertyType));

const extractPropertyType = (value: unknown): PropertyType => {
  if (typeof value !== "string" || !VALID_PROPERTY_TYPES.has(value)) {
    throw new Error(
      `Invalid property type: ${String(value)}. Expected one of ${[...VALID_PROPERTY_TYPES].join(", ")}`,
    );
  }
  return value as PropertyType;
};

const VALID_LOAN_PURPOSES = new Set<string>(Object.values(LoanPurpose));

const extractLoanPurpose = (value: unknown): LoanPurpose => {
  if (typeof value !== "string" || !VALID_LOAN_PURPOSES.has(value)) {
    throw new Error(
      `Invalid loan purpose: ${String(value)}. Expected one of ${[...VALID_LOAN_PURPOSES].join(", ")}`,
    );
  }
  return value as LoanPurpose;
};

// ---------------------------------------------------------------------------
// Mutating appliers -- operate on an already-cloned transaction
// ---------------------------------------------------------------------------

const applyTerm = (transaction: Transaction, value: unknown): void => {
  const term = extractTerm(value);
  transaction.scenario.rateNote.amortizationMonths = term;
};

const applyRate = (transaction: Transaction, value: unknown): void => {
  const rate = extractRate(value);
  transaction.scenario.rateNote.noteRatePct = rate;
};

const applyLoanAmount = (transaction: Transaction, value: unknown): void => {
  const loanAmount = extractMoney(value);
  transaction.scenario.requestedLoanAmount = loanAmount;
  if (transaction.scenario.purchasePrice !== undefined) {
    const down = new Decimal(transaction.scenario.purchasePrice)
      .minus(new Decimal(loanAmount))
      .toNumber();
    transaction.scenario.downPayment = money(down);
  }
};

const applyLTV = (transaction: Transaction, value: unknown): void => {
  const ltv = extractRatio(value);
  const propertyValue = transaction.scenario.appraisedValue ?? transaction.scenario.purchasePrice;
  if (!propertyValue) return;
  const loanAmount = new Decimal(propertyValue)
    .times(new Decimal(ltv))
    .toDecimalPlaces(2)
    .toNumber();
  transaction.scenario.requestedLoanAmount = money(loanAmount);
  if (transaction.scenario.purchasePrice !== undefined) {
    const down = new Decimal(transaction.scenario.purchasePrice)
      .minus(new Decimal(loanAmount))
      .toNumber();
    transaction.scenario.downPayment = money(down);
  }
};

const applyOccupancy = (transaction: Transaction, value: unknown): void => {
  transaction.scenario.occupancy = extractOccupancy(value);
};

const applyBorrowerSet = (transaction: Transaction, value: unknown): void => {
  const borrowerIds = extractBorrowerIds(value);
  const label = borrowerIds.join("+") || "none";
  transaction.variants = [
    {
      id: `borrowers-${label}`,
      label: `Borrowers ${label}`,
      includedBorrowerIds: borrowerIds,
    },
  ];
};

const applyFico = (transaction: Transaction, value: unknown): void => {
  const fico = extractFico(value);
  for (const borrower of transaction.borrowers) {
    borrower.fico = fico;
  }
};

const applyDownPayment = (transaction: Transaction, value: unknown): void => {
  const downPayment = extractMoney(value);
  transaction.scenario.downPayment = downPayment;
  if (transaction.scenario.purchasePrice !== undefined) {
    const loanAmount = new Decimal(transaction.scenario.purchasePrice)
      .minus(new Decimal(downPayment))
      .toNumber();
    transaction.scenario.requestedLoanAmount = money(loanAmount);
  }
};

const applyPropertyType = (transaction: Transaction, value: unknown): void => {
  transaction.scenario.propertyType = extractPropertyType(value);
};

const applyLoanPurpose = (transaction: Transaction, value: unknown): void => {
  transaction.scenario.loanPurpose = extractLoanPurpose(value);
};

/**
 * Applies a dimension value to a cloned transaction using validated extraction
 * instead of raw `as` casts. Products/Lenders dimensions do not modify the
 * transaction -- they are resolved at execution time.
 */
const applyDimensionValue = (
  transaction: Transaction,
  dim: ComparisonDimension,
  value: unknown,
): Transaction => {
  const next = cloneTransaction(transaction);
  switch (dim.kind) {
    case "Terms":
      applyTerm(next, value);
      break;
    case "Rates":
      applyRate(next, value);
      break;
    case "LTV":
      applyLTV(next, value);
      break;
    case "LoanAmount":
      applyLoanAmount(next, value);
      break;
    case "Occupancy":
      applyOccupancy(next, value);
      break;
    case "BorrowerSets":
      applyBorrowerSet(next, value);
      break;
    case "Fico":
      applyFico(next, value);
      break;
    case "DownPayment":
      applyDownPayment(next, value);
      break;
    case "PropertyType":
      applyPropertyType(next, value);
      break;
    case "LoanPurpose":
      applyLoanPurpose(next, value);
      break;
    case "Products":
    case "Lenders":
      // No transaction mutation -- filtering handled in executor.
      break;
    default:
      return assertNever(dim);
  }
  return next;
};

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

export class ComparisonGridBuilder {
  private baseTransaction?: Transaction;
  private dimensions: ComparisonDimension[] = [];
  private products?: ProductDefinition[];

  constructor(transaction?: Transaction) {
    if (transaction !== undefined) {
      this.baseTransaction = transaction;
    }
  }

  static fromTransaction(transaction: Transaction): ComparisonGridBuilder {
    return new ComparisonGridBuilder(transaction);
  }

  fromTransaction(transaction: Transaction): this {
    this.baseTransaction = transaction;
    return this;
  }

  withDimension(dimension: ComparisonDimension): this {
    validateDimension(dimension);
    this.dimensions.push(dimension);
    return this;
  }

  withProducts(products: ProductDefinition[]): this {
    this.products = products;
    return this;
  }

  build(): ComparisonGrid {
    const baseTransaction = this.baseTransaction;
    if (!baseTransaction) {
      throw new Error("ComparisonGridBuilder requires a base transaction");
    }
    const grid: ComparisonGrid = {
      baseTransaction,
      dimensions: this.dimensions,
    };
    if (this.products !== undefined) {
      grid.products = this.products;
    }
    return grid;
  }
}

// ---------------------------------------------------------------------------
// Grid expansion
// ---------------------------------------------------------------------------

export const expandGrid = (grid: ComparisonGrid): ExpandedGridCell[] => {
  const { dimensions } = grid;
  if (dimensions.length === 0) {
    return [
      {
        coordinates: {},
        modifiedTransaction: cloneTransaction(grid.baseTransaction),
      },
    ];
  }

  const expanded: ExpandedGridCell[] = [];

  const expand = (
    index: number,
    coordinates: Record<string, unknown>,
    transaction: Transaction,
  ): void => {
    if (index >= dimensions.length) {
      expanded.push({ coordinates, modifiedTransaction: transaction });
      return;
    }
    const dim = dimensions[index];
    if (!dim) {
      expanded.push({ coordinates, modifiedTransaction: transaction });
      return;
    }
    const values = expandDimension(dim);
    const key = dimensionKey(dim);
    for (const value of values) {
      const nextCoords = { ...coordinates, [key]: value };
      const nextTransaction = applyDimensionValue(transaction, dim, value);
      expand(index + 1, nextCoords, nextTransaction);
    }
  };

  expand(0, {}, cloneTransaction(grid.baseTransaction));
  return expanded;
};
