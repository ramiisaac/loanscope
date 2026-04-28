import { AmortizationTerm, LoanPurpose, PropertyType, assertNever } from "@loanscope/domain";
import type {
  Occupancy,
  ProductDefinition,
  RatePct,
  Ratio,
  Money,
  Transaction,
  ScopedProductResult,
} from "@loanscope/domain";

const VALID_AMORTIZATION_TERMS = new Set<number>(
  Object.values(AmortizationTerm).filter((v): v is number => typeof v === "number"),
);

export type ComparisonDimension =
  | { kind: "Terms"; values: AmortizationTerm[] }
  | { kind: "Rates"; values: RatePct[] }
  | { kind: "LTV"; min: Ratio; max: Ratio; step: Ratio }
  | { kind: "LoanAmount"; min: Money; max: Money; step: Money }
  | { kind: "Occupancy"; values: Occupancy[] }
  | { kind: "Products"; productIds: string[] }
  | { kind: "Lenders"; lenderIds: string[] }
  | { kind: "BorrowerSets"; sets: string[][] }
  | { kind: "Fico"; values: number[] }
  | { kind: "DownPayment"; min: Money; max: Money; step: Money }
  | { kind: "PropertyType"; values: PropertyType[] }
  | { kind: "LoanPurpose"; values: LoanPurpose[] };

export interface ComparisonGrid {
  baseTransaction: Transaction;
  dimensions: ComparisonDimension[];
  products?: ProductDefinition[];
}

/** Error surfaced from a single grid cell evaluation. */
export interface GridCellError {
  coordinates: Record<string, unknown>;
  productId: string;
  message: string;
  code: "unsupported_product" | "evaluation_error" | "invalid_cell";
}

export interface GridCell {
  coordinates: Record<string, unknown>;
  result: ScopedProductResult;
}

export interface GridResult {
  dimensions: ComparisonDimension[];
  cells: GridCell[];
  errors: GridCellError[];
  summary: GridSummary;
}

export interface GridSummary {
  totalCells: number;
  passCount: number;
  failCount: number;
  warnCount: number;
  partialCount: number;
  errorCount: number;
}

/** Concurrency configuration for bounded parallel grid execution. */
export interface GridExecutionOptions {
  /** Maximum number of cells evaluated concurrently. Defaults to 8. */
  concurrency: number;
}

export const DEFAULT_GRID_CONCURRENCY = 8;

export type GoalSeekTarget =
  | "MaxLoanAmount"
  | "MinDownPayment"
  | "MinFico"
  | "MaxPurchasePrice"
  | "MinReserves";

export interface GoalSeekParams {
  target: GoalSeekTarget;
  transaction: Transaction;
  product: ProductDefinition;
  bounds: { min: number; max: number };
  tolerance?: number;
  maxIterations?: number;
}

export type GoalSeekFailureReason =
  | "never_feasible"
  | "already_feasible"
  | "non_monotonic"
  | "malformed_bounds"
  | "max_iterations_exceeded";

export interface GoalSeekResult {
  found: boolean;
  targetValue: number;
  finalResult: ScopedProductResult;
  iterations: number;
  converged: boolean;
  reason?: GoalSeekFailureReason;
}

/** Validates goal-seek bounds, throwing on malformed input. */
export const validateGoalSeekBounds = (
  bounds: { min: number; max: number },
  label: string,
): void => {
  if (!Number.isFinite(bounds.min) || !Number.isFinite(bounds.max)) {
    throw new Error(
      `${label}: bounds must be finite numbers (got min=${bounds.min}, max=${bounds.max})`,
    );
  }
  if (bounds.min > bounds.max) {
    throw new Error(`${label}: min bound (${bounds.min}) exceeds max bound (${bounds.max})`);
  }
  if (bounds.min < 0) {
    throw new Error(`${label}: min bound must be non-negative (got ${bounds.min})`);
  }
};

/**
 * Validates that a dimension definition is well-formed.
 * Throws a descriptive error on malformed input.
 */
export const validateDimension = (dim: ComparisonDimension): void => {
  switch (dim.kind) {
    case "Terms": {
      if (dim.values.length === 0) {
        throw new Error("Terms dimension requires at least one term value");
      }
      for (const term of dim.values) {
        if (
          typeof term !== "number" ||
          !Number.isFinite(term) ||
          !VALID_AMORTIZATION_TERMS.has(term)
        ) {
          throw new Error(
            `Invalid amortization term: ${String(term)}. Expected one of ${[...VALID_AMORTIZATION_TERMS].join(", ")}`,
          );
        }
      }
      break;
    }
    case "Rates": {
      if (dim.values.length === 0) {
        throw new Error("Rates dimension requires at least one rate value");
      }
      for (const rate of dim.values) {
        if (typeof rate !== "number" || rate < 0 || !Number.isFinite(rate)) {
          throw new Error(`Invalid rate value: ${String(rate)}`);
        }
      }
      break;
    }
    case "LTV": {
      const minVal = Number(dim.min);
      const maxVal = Number(dim.max);
      const stepVal = Number(dim.step);
      if (!Number.isFinite(minVal) || !Number.isFinite(maxVal) || !Number.isFinite(stepVal)) {
        throw new Error("LTV dimension requires finite min, max, and step");
      }
      if (minVal < 0 || minVal > 1) {
        throw new Error(`LTV min must be in [0, 1], got ${minVal}`);
      }
      if (maxVal < 0 || maxVal > 1.5) {
        throw new Error(`LTV max must be in [0, 1.5], got ${maxVal}`);
      }
      if (minVal > maxVal) {
        throw new Error(`LTV min (${minVal}) exceeds max (${maxVal})`);
      }
      if (stepVal <= 0) {
        throw new Error(`LTV step must be positive, got ${stepVal}`);
      }
      break;
    }
    case "LoanAmount": {
      const minVal = Number(dim.min);
      const maxVal = Number(dim.max);
      const stepVal = Number(dim.step);
      if (!Number.isFinite(minVal) || !Number.isFinite(maxVal) || !Number.isFinite(stepVal)) {
        throw new Error("LoanAmount dimension requires finite min, max, and step");
      }
      if (minVal < 0) {
        throw new Error(`LoanAmount min must be non-negative, got ${minVal}`);
      }
      if (minVal > maxVal) {
        throw new Error(`LoanAmount min (${minVal}) exceeds max (${maxVal})`);
      }
      if (stepVal <= 0) {
        throw new Error(`LoanAmount step must be positive, got ${stepVal}`);
      }
      break;
    }
    case "Occupancy": {
      if (dim.values.length === 0) {
        throw new Error("Occupancy dimension requires at least one value");
      }
      break;
    }
    case "Products": {
      if (dim.productIds.length === 0) {
        throw new Error("Products dimension requires at least one product ID");
      }
      break;
    }
    case "Lenders": {
      if (dim.lenderIds.length === 0) {
        throw new Error("Lenders dimension requires at least one lender ID");
      }
      break;
    }
    case "BorrowerSets": {
      if (dim.sets.length === 0) {
        throw new Error("BorrowerSets dimension requires at least one set");
      }
      break;
    }
    case "Fico": {
      if (dim.values.length === 0) {
        throw new Error("Fico dimension requires at least one FICO score");
      }
      for (const score of dim.values) {
        if (typeof score !== "number" || !Number.isInteger(score) || score < 300 || score > 850) {
          throw new Error(
            `Invalid FICO score: ${String(score)}. Must be an integer between 300 and 850`,
          );
        }
      }
      break;
    }
    case "DownPayment": {
      const minVal = Number(dim.min);
      const maxVal = Number(dim.max);
      const stepVal = Number(dim.step);
      if (!Number.isFinite(minVal) || !Number.isFinite(maxVal) || !Number.isFinite(stepVal)) {
        throw new Error("DownPayment dimension requires finite min, max, and step");
      }
      if (minVal < 0) {
        throw new Error(`DownPayment min must be non-negative, got ${minVal}`);
      }
      if (minVal > maxVal) {
        throw new Error(`DownPayment min (${minVal}) exceeds max (${maxVal})`);
      }
      if (stepVal <= 0) {
        throw new Error(`DownPayment step must be positive, got ${stepVal}`);
      }
      break;
    }
    case "PropertyType": {
      if (dim.values.length === 0) {
        throw new Error("PropertyType dimension requires at least one property type");
      }
      const validPropertyTypes = new Set<string>(Object.values(PropertyType));
      for (const pt of dim.values) {
        if (!validPropertyTypes.has(pt)) {
          throw new Error(
            `Invalid property type: ${String(pt)}. Valid values: ${[...validPropertyTypes].join(", ")}`,
          );
        }
      }
      break;
    }
    case "LoanPurpose": {
      if (dim.values.length === 0) {
        throw new Error("LoanPurpose dimension requires at least one loan purpose");
      }
      const validLoanPurposes = new Set<string>(Object.values(LoanPurpose));
      for (const lp of dim.values) {
        if (!validLoanPurposes.has(lp)) {
          throw new Error(
            `Invalid loan purpose: ${String(lp)}. Valid values: ${[...validLoanPurposes].join(", ")}`,
          );
        }
      }
      break;
    }
    default:
      assertNever(dim);
  }
};
