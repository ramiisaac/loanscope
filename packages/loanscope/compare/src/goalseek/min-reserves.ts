import Decimal from "decimal.js";
import type { Money, ProductDefinition, Transaction } from "@loanscope/domain";
import { AssetType, money } from "@loanscope/domain";
import type { GoalSeekParams, GoalSeekResult, GoalSeekFailureReason } from "../types";
import { validateGoalSeekBounds } from "../types";
import { evaluate, evaluateProduct, extractScopedProductResult } from "@loanscope/engine";

const DEFAULT_TOLERANCE = 500;
const DEFAULT_ITERATIONS = 40;

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

const applyReserves = (transaction: Transaction, amount: Money): Transaction => {
  const next = cloneTransaction(transaction);
  const borrowerIds = next.borrowers.map((borrower) => borrower.id);
  const assets = next.assets ? [...next.assets] : [];
  const existingIndex = assets.findIndex((asset) => asset.id === "goalseek-reserves");
  const reserveAsset = {
    id: "goalseek-reserves",
    type: AssetType.Checking,
    ownerBorrowerIds: borrowerIds,
    amount,
  };
  if (existingIndex >= 0) {
    assets[existingIndex] = reserveAsset;
  } else {
    assets.push(reserveAsset);
  }
  next.assets = assets;
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

const evaluateReserves = (
  transaction: Transaction,
  product: ProductDefinition,
  amount: Money,
): { eligible: boolean; result: GoalSeekResult["finalResult"] } => {
  const adjusted = applyReserves(transaction, amount);
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

export const findMinReserves = (params: GoalSeekParams): GoalSeekResult => {
  const { transaction, product } = params;
  const min = params.bounds.min;
  const max = params.bounds.max;
  const tolerance = params.tolerance ?? DEFAULT_TOLERANCE;
  const maxIterations = params.maxIterations ?? DEFAULT_ITERATIONS;

  validateGoalSeekBounds(params.bounds, "findMinReserves");

  const minEval = evaluateReserves(transaction, product, money(min));
  const maxEval = evaluateReserves(transaction, product, money(max));

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

  // Never feasible -- even maximum reserves fails
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
    const mid = low.plus(high).div(2);
    const midValue = mid.toDecimalPlaces(2).toNumber();
    const { eligible, result } = evaluateReserves(transaction, product, money(midValue));
    if (eligible) {
      best = mid;
      bestResult = result;
      high = mid;
    } else {
      low = mid;
    }
    if (high.minus(low).abs().lte(tolerance)) {
      converged = true;
      break;
    }
  }

  return {
    found: true,
    targetValue: best.toDecimalPlaces(2).toNumber(),
    finalResult: bestResult,
    iterations,
    converged,
    ...(!converged ? { reason: "max_iterations_exceeded" as const } : {}),
  };
};
