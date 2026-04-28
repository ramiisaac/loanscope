import Decimal from "decimal.js";
import type { ProductDefinition, Transaction } from "@loanscope/domain";
import type { GoalSeekParams, GoalSeekResult, GoalSeekFailureReason } from "../types";
import { validateGoalSeekBounds } from "../types";
import { evaluate, evaluateProduct, extractScopedProductResult } from "@loanscope/engine";

const DEFAULT_TOLERANCE = 1;
const DEFAULT_ITERATIONS = 20;

const cloneTransaction = (transaction: Transaction): Transaction => structuredClone(transaction);

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

const applyFico = (transaction: Transaction, fico: number): Transaction => {
  const next = cloneTransaction(transaction);
  next.borrowers = next.borrowers.map((borrower) => ({ ...borrower, fico }));
  return next;
};

const evaluateScoped = (
  transaction: Transaction,
  product: ProductDefinition,
): { scoped: GoalSeekResult["finalResult"]; eligible: boolean } => {
  const prepared = ensureVariant(transaction);
  const variant = prepared.variants[0];
  if (!variant) {
    throw new Error("Transaction must include at least one variant");
  }
  const graphResult = evaluate(prepared, variant, product);
  const scoped = extractScopedProductResult(product, graphResult);
  const full = evaluateProduct(prepared, variant, product);
  scoped.full = full;
  scoped.variantId = full.variantId;
  return { scoped, eligible: full.eligible };
};

const evaluateFico = (
  transaction: Transaction,
  product: ProductDefinition,
  fico: number,
): { eligible: boolean; result: GoalSeekResult["finalResult"] } => {
  const adjusted = applyFico(transaction, fico);
  const { scoped, eligible } = evaluateScoped(adjusted, product);
  return { eligible, result: scoped };
};

const makeFailure = (
  reason: GoalSeekFailureReason,
  fallbackResult: GoalSeekResult["finalResult"],
  targetValue: number,
  iterations: number,
): GoalSeekResult => ({
  found: false,
  targetValue,
  finalResult: fallbackResult,
  iterations,
  converged: false,
  reason,
});

export const findMinFico = (params: GoalSeekParams): GoalSeekResult => {
  const { transaction, product } = params;
  const min = params.bounds.min;
  const max = params.bounds.max;
  const tolerance = params.tolerance ?? DEFAULT_TOLERANCE;
  const maxIterations = params.maxIterations ?? DEFAULT_ITERATIONS;

  validateGoalSeekBounds(params.bounds, "findMinFico");

  const minEval = evaluateFico(transaction, product, min);
  const maxEval = evaluateFico(transaction, product, max);

  // Already feasible at minimum -- no further search needed
  if (minEval.eligible) {
    return {
      found: true,
      targetValue: min,
      finalResult: minEval.result,
      iterations: 1,
      converged: true,
      reason: "already_feasible",
    };
  }

  // Never feasible -- even maximum FICO fails
  if (!maxEval.eligible) {
    return makeFailure("never_feasible", maxEval.result, max, 1);
  }

  // Binary search: low is ineligible, high is eligible. Converge toward min eligible.
  let low = new Decimal(min);
  let high = new Decimal(max);
  let best = new Decimal(max);
  let bestResult: GoalSeekResult["finalResult"] = maxEval.result;
  let iterations = 0;
  let converged = false;

  for (; iterations < maxIterations; iterations += 1) {
    const mid = low.plus(high).div(2).round();
    const midValue = mid.toNumber();
    const { eligible, result } = evaluateFico(transaction, product, midValue);
    if (eligible) {
      best = mid;
      bestResult = result;
      high = mid;
    } else {
      low = Decimal.max(mid.plus(1), low.plus(1));
    }
    if (high.minus(low).abs().lte(tolerance)) {
      converged = true;
      break;
    }
  }

  return {
    found: true,
    targetValue: best.toNumber(),
    finalResult: bestResult,
    iterations,
    converged,
    ...(!converged ? { reason: "max_iterations_exceeded" as const } : {}),
  };
};
