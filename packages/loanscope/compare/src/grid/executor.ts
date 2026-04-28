import type { ProductDefinition, ScopedProductResult, Transaction } from "@loanscope/domain";
import {
  evaluate,
  evaluateProduct,
  extractScopedProductResult,
  isProductConfigurationError,
} from "@loanscope/engine";
import type {
  ComparisonGrid,
  GridCell,
  GridCellError,
  GridExecutionOptions,
  GridResult,
  GridSummary,
} from "../types";
import { DEFAULT_GRID_CONCURRENCY } from "../types";
import type { ExpandedGridCell } from "./builder";
import { expandGrid } from "./builder";

// ---------------------------------------------------------------------------
// Coordinate extraction -- replaces raw `as` casts
// ---------------------------------------------------------------------------

const extractStringCoord = (
  coordinates: Record<string, unknown>,
  key: string,
): string | undefined => {
  const raw = coordinates[key];
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== "string") return undefined;
  return raw;
};

// ---------------------------------------------------------------------------
// Product filtering with validated coordinate access
// ---------------------------------------------------------------------------

const filterProducts = (
  products: ProductDefinition[],
  coordinates: Record<string, unknown>,
): ProductDefinition[] => {
  const productId = extractStringCoord(coordinates, "productId");
  const lenderId = extractStringCoord(coordinates, "lenderId");
  let filtered = products;
  if (productId) {
    filtered = filtered.filter((product) => product.id === productId);
  }
  if (lenderId) {
    filtered = filtered.filter((product) => product.lenderId === lenderId);
  }
  return filtered;
};

const getValue = <T>(graphResult: ReturnType<typeof evaluate>, nodeId: string): T | undefined => {
  const fromInputs = graphResult.inputs[nodeId];
  if (fromInputs !== undefined) {
    return fromInputs.value as T;
  }
  const fromComputed = graphResult.computed[nodeId];
  if (fromComputed !== undefined) {
    return fromComputed.value as T;
  }
  return undefined;
};

const hasComparableUnderwritingBasis = (graphResult: ReturnType<typeof evaluate>): boolean => {
  if (Object.keys(graphResult.checks).length === 0) {
    return false;
  }

  const hasLoanAmount = getValue(graphResult, "loanAmount") !== undefined;
  const hasDti = getValue(graphResult, "dti") !== undefined;
  const hasLtv = getValue(graphResult, "ltv") !== undefined;
  const hasIncome = getValue(graphResult, "qualifyingIncomeMonthly") !== undefined;

  return hasLoanAmount && hasDti && hasLtv && hasIncome;
};

// ---------------------------------------------------------------------------
// Variant helper
// ---------------------------------------------------------------------------

const ensureVariant = (transaction: Transaction): Transaction => {
  if (transaction.variants.length > 0) return transaction;
  const borrowerIds = transaction.borrowers.map((borrower) => borrower.id);
  return {
    ...transaction,
    variants: [
      {
        id: "default",
        label: "Default",
        includedBorrowerIds: borrowerIds,
      },
    ],
  };
};

// ---------------------------------------------------------------------------
// Single-product scoped evaluation with surfaced errors
// ---------------------------------------------------------------------------

interface EvalScopedOk {
  kind: "ok";
  result: ScopedProductResult;
}

interface EvalScopedError {
  kind: "error";
  message: string;
  code: GridCellError["code"];
}

type EvalScopedOutcome = EvalScopedOk | EvalScopedError;

const evaluateScoped = (
  transaction: Transaction,
  product: ProductDefinition,
): EvalScopedOutcome => {
  const variant = transaction.variants[0];
  if (!variant) {
    return {
      kind: "error",
      message: "Transaction must include at least one variant",
      code: "invalid_cell",
    };
  }
  try {
    const graphResult = evaluate(transaction, variant, product);
    const scoped = extractScopedProductResult(product, graphResult, variant.id);

    // Compare output is pass/fail oriented like evaluateProduct. Some runs still
    // expose blocked optional nodes even when the core underwriting basis exists.
    if (!scoped.full && hasComparableUnderwritingBasis(graphResult)) {
      const full = evaluateProduct(transaction, variant, product);
      scoped.full = full;
      scoped.variantId = full.variantId;
    }
    return { kind: "ok", result: scoped };
  } catch (err: unknown) {
    if (isProductConfigurationError(err)) {
      return {
        kind: "error",
        message: err instanceof Error ? err.message : String(err),
        code: "unsupported_product",
      };
    }
    const message = err instanceof Error ? err.message : String(err);
    return {
      kind: "error",
      message,
      code: "evaluation_error",
    };
  }
};

// ---------------------------------------------------------------------------
// Public: evaluate a single grid cell (used by tests/external callers)
// ---------------------------------------------------------------------------

export const executeGridCell = (
  transaction: Transaction,
  coordinates: Record<string, unknown>,
  products: ProductDefinition[],
): GridCell | null => {
  const filtered = filterProducts(products, coordinates);
  if (filtered.length === 0) {
    return null;
  }
  if (filtered.length > 1) {
    throw new Error("Grid cell is ambiguous; include product dimension to disambiguate");
  }
  const prepared = ensureVariant(transaction);
  const product = filtered[0]!;
  const outcome = evaluateScoped(prepared, product);
  if (outcome.kind === "error") {
    throw new Error(`Cell evaluation failed for product ${product.id}: ${outcome.message}`);
  }
  const coords = { ...coordinates, productId: product.id };
  return { coordinates: coords, result: outcome.result };
};

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

const summarize = (cells: GridCell[], errorCount: number): GridSummary => {
  let passCount = 0;
  let failCount = 0;
  let warnCount = 0;
  let partialCount = 0;
  for (const cell of cells) {
    const full = cell.result.full;
    if (!full) {
      partialCount += 1;
      continue;
    }
    if (full.eligible) {
      passCount += 1;
      if (full.warnings.length > 0) {
        warnCount += 1;
      }
    } else {
      failCount += 1;
    }
  }
  return {
    totalCells: cells.length,
    passCount,
    failCount,
    warnCount,
    partialCount,
    errorCount,
  };
};

// ---------------------------------------------------------------------------
// Bounded parallel execution via p-map
// ---------------------------------------------------------------------------

interface CellTask {
  expandedItem: ExpandedGridCell;
  product: ProductDefinition;
}

const buildCellTasks = (
  expanded: ExpandedGridCell[],
  baseProducts: ProductDefinition[],
): CellTask[] => {
  const tasks: CellTask[] = [];
  for (const item of expanded) {
    const filtered = filterProducts(baseProducts, item.coordinates);
    for (const product of filtered) {
      tasks.push({ expandedItem: item, product });
    }
  }
  return tasks;
};

interface CellOutcome {
  cell: GridCell | null;
  error: GridCellError | null;
}

const executeCellTask = (task: CellTask): CellOutcome => {
  const prepared = ensureVariant(task.expandedItem.modifiedTransaction);
  const outcome = evaluateScoped(prepared, task.product);
  if (outcome.kind === "error") {
    return {
      cell: null,
      error: {
        coordinates: task.expandedItem.coordinates,
        productId: task.product.id,
        message: outcome.message,
        code: outcome.code,
      },
    };
  }
  const coords = {
    ...task.expandedItem.coordinates,
    productId: task.product.id,
  };
  return {
    cell: { coordinates: coords, result: outcome.result },
    error: null,
  };
};

/**
 * Runs cell tasks in bounded parallel batches. Uses a simple chunked
 * Promise.all approach as a concurrency limiter -- keeps memory
 * and CPU usage predictable without pulling in additional runtime deps
 * beyond p-map (which is already declared but not strictly needed here).
 */
const runBounded = async (tasks: CellTask[], concurrency: number): Promise<CellOutcome[]> => {
  const results: CellOutcome[] = [];
  for (let i = 0; i < tasks.length; i += concurrency) {
    const batch = tasks.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map((task) => Promise.resolve().then(() => executeCellTask(task))),
    );
    results.push(...batchResults);
  }
  return results;
};

// ---------------------------------------------------------------------------
// Public: execute entire grid (synchronous, backward-compatible)
// ---------------------------------------------------------------------------

export const executeGrid = (grid: ComparisonGrid, products: ProductDefinition[]): GridResult => {
  const baseProducts = grid.products ?? products;
  if (!baseProducts || baseProducts.length === 0) {
    throw new Error("executeGrid requires a non-empty product list");
  }
  const expanded = expandGrid(grid);
  const tasks = buildCellTasks(expanded, baseProducts);

  const cells: GridCell[] = [];
  const errors: GridCellError[] = [];

  for (const task of tasks) {
    const outcome = executeCellTask(task);
    if (outcome.cell) {
      cells.push(outcome.cell);
    }
    if (outcome.error) {
      errors.push(outcome.error);
    }
  }

  const summary = summarize(cells, errors.length);
  return { dimensions: grid.dimensions, cells, errors, summary };
};

// ---------------------------------------------------------------------------
// Public: async bounded parallel grid execution
// ---------------------------------------------------------------------------

export const executeGridAsync = async (
  grid: ComparisonGrid,
  products: ProductDefinition[],
  options?: Partial<GridExecutionOptions>,
): Promise<GridResult> => {
  const baseProducts = grid.products ?? products;
  if (!baseProducts || baseProducts.length === 0) {
    throw new Error("executeGridAsync requires a non-empty product list");
  }
  const concurrency = options?.concurrency ?? DEFAULT_GRID_CONCURRENCY;
  if (concurrency < 1 || !Number.isFinite(concurrency)) {
    throw new Error(`Concurrency must be a positive finite integer, got ${concurrency}`);
  }
  const expanded = expandGrid(grid);
  const tasks = buildCellTasks(expanded, baseProducts);
  const outcomes = await runBounded(tasks, concurrency);

  const cells: GridCell[] = [];
  const errors: GridCellError[] = [];

  for (const outcome of outcomes) {
    if (outcome.cell) {
      cells.push(outcome.cell);
    }
    if (outcome.error) {
      errors.push(outcome.error);
    }
  }

  const summary = summarize(cells, errors.length);
  return { dimensions: grid.dimensions, cells, errors, summary };
};
