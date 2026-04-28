import Decimal from "decimal.js";
import type { Money, ProductDefinition, Transaction } from "@loanscope/domain";
import { money } from "@loanscope/domain";
import type { GoalSeekParams, GoalSeekResult, GoalSeekFailureReason } from "../types";
import { validateGoalSeekBounds } from "../types";
import { evaluate, evaluateProduct, extractScopedProductResult } from "@loanscope/engine";

const DEFAULT_TOLERANCE = 100;
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

const applyDownPayment = (transaction: Transaction, amount: Money): Transaction => {
  const purchasePrice = transaction.scenario.purchasePrice;
  if (purchasePrice === undefined) {
    throw new Error("Down payment adjustment requires purchase price");
  }
  const next = cloneTransaction(transaction);
  next.scenario.downPayment = amount;
  const loan = new Decimal(purchasePrice).minus(new Decimal(amount)).toNumber();
  next.scenario.requestedLoanAmount = money(loan);
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

const evaluateDownPayment = (
  transaction: Transaction,
  product: ProductDefinition,
  amount: Money,
): { eligible: boolean; result: GoalSeekResult["finalResult"] } => {
  const adjusted = applyDownPayment(transaction, amount);
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

export const findMinDownPayment = (params: GoalSeekParams): GoalSeekResult => {
  const { transaction, product } = params;
  const min = params.bounds.min;
  const max = params.bounds.max;
  const tolerance = params.tolerance ?? DEFAULT_TOLERANCE;
  const maxIterations = params.maxIterations ?? DEFAULT_ITERATIONS;

  validateGoalSeekBounds(params.bounds, "findMinDownPayment");

  const minEval = evaluateDownPayment(transaction, product, money(min));
  const maxEval = evaluateDownPayment(transaction, product, money(max));

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

  // Seed best from max evaluation if feasible
  let low = new Decimal(min);
  let high = new Decimal(max);
  let best: Decimal | null = maxEval.eligible ? new Decimal(max) : null;
  let bestResult: GoalSeekResult["finalResult"] = maxEval.eligible
    ? maxEval.result
    : minEval.result;
  let iterations = 0;
  let converged = false;

  for (; iterations < maxIterations; iterations += 1) {
    const mid = low.plus(high).div(2);
    const midValue = mid.toDecimalPlaces(2).toNumber();
    const { eligible, result } = evaluateDownPayment(transaction, product, money(midValue));
    if (eligible) {
      if (best === null || mid.lt(best)) {
        best = mid;
        bestResult = result;
      }
      high = mid;
    } else {
      low = mid;
    }
    if (high.minus(low).abs().lte(tolerance)) {
      converged = true;
      break;
    }
  }

  if (best === null) {
    return makeFailure("never_feasible", bestResult, max, iterations);
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
