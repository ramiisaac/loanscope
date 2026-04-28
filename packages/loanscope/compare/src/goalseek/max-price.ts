import Decimal from "decimal.js";
import type { Money, ProductDefinition, Transaction } from "@loanscope/domain";
import { money } from "@loanscope/domain";
import type { GoalSeekParams, GoalSeekResult, GoalSeekFailureReason } from "../types";
import { validateGoalSeekBounds } from "../types";
import { evaluate, evaluateProduct, extractScopedProductResult } from "@loanscope/engine";

const DEFAULT_TOLERANCE = 1000;
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

const applyPurchasePrice = (transaction: Transaction, amount: Money): Transaction => {
  const next = cloneTransaction(transaction);
  next.scenario.purchasePrice = amount;
  next.scenario.appraisedValue = amount;
  if (next.scenario.downPayment !== undefined) {
    const loan = new Decimal(amount).minus(new Decimal(next.scenario.downPayment)).toNumber();
    next.scenario.requestedLoanAmount = money(loan);
  }
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

const evaluatePrice = (
  transaction: Transaction,
  product: ProductDefinition,
  amount: Money,
): { eligible: boolean; result: GoalSeekResult["finalResult"] } => {
  const adjusted = applyPurchasePrice(transaction, amount);
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

export const findMaxPurchasePrice = (params: GoalSeekParams): GoalSeekResult => {
  const { transaction, product } = params;
  const min = params.bounds.min;
  const max = params.bounds.max;
  const tolerance = params.tolerance ?? DEFAULT_TOLERANCE;
  const maxIterations = params.maxIterations ?? DEFAULT_ITERATIONS;

  validateGoalSeekBounds(params.bounds, "findMaxPurchasePrice");

  const minEval = evaluatePrice(transaction, product, money(min));
  const maxEval = evaluatePrice(transaction, product, money(max));

  // Already feasible at max -- the entire range works
  if (maxEval.eligible) {
    return {
      found: true,
      targetValue: max,
      finalResult: maxEval.result,
      iterations: 1,
      converged: true,
      reason: "already_feasible",
    };
  }

  // Never feasible -- even minimum fails
  if (!minEval.eligible) {
    return makeFailure("never_feasible", minEval.result, min, 1);
  }

  let low = new Decimal(min);
  let high = new Decimal(max);
  let best = new Decimal(min);
  let bestResult: GoalSeekResult["finalResult"] = minEval.result;
  let iterations = 0;
  let converged = false;

  for (; iterations < maxIterations; iterations += 1) {
    const mid = low.plus(high).div(2);
    const midValue = mid.toDecimalPlaces(2).toNumber();
    const { eligible, result } = evaluatePrice(transaction, product, money(midValue));
    if (eligible) {
      best = mid;
      bestResult = result;
      low = mid;
    } else {
      high = mid;
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
