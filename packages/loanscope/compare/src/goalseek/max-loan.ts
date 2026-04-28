import Decimal from "decimal.js";
import type { Money, ProductDefinition, Ratio, Transaction } from "@loanscope/domain";
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

const applyLoanAmount = (transaction: Transaction, amount: Money): Transaction => {
  const next = cloneTransaction(transaction);
  next.scenario.requestedLoanAmount = amount;
  if (next.scenario.purchasePrice !== undefined) {
    const down = new Decimal(next.scenario.purchasePrice).minus(new Decimal(amount)).toNumber();
    next.scenario.downPayment = money(down);
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

/** Retrieves a value from the EvaluationResult using inputs then computed. */
const getGraphValue = <T>(
  result: {
    inputs: Record<string, { value: unknown }>;
    computed: Record<string, { value: unknown }>;
  },
  nodeId: string,
): T | undefined => {
  const fromInputs = result.inputs[nodeId];
  if (fromInputs !== undefined) return fromInputs.value as T;
  const fromComputed = result.computed[nodeId];
  if (fromComputed !== undefined) return fromComputed.value as T;
  return undefined;
};

const evaluateLoanAmount = (
  transaction: Transaction,
  product: ProductDefinition,
  amount: Money,
): { eligible: boolean; result: GoalSeekResult["finalResult"] } => {
  const adjusted = applyLoanAmount(transaction, amount);
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

export const findMaxLoanAmount = (params: GoalSeekParams): GoalSeekResult => {
  const { transaction, product } = params;
  const min = params.bounds.min;
  const max = params.bounds.max;
  const tolerance = params.tolerance ?? DEFAULT_TOLERANCE;
  const maxIterations = params.maxIterations ?? DEFAULT_ITERATIONS;

  validateGoalSeekBounds(params.bounds, "findMaxLoanAmount");

  const minEval = evaluateLoanAmount(transaction, product, money(min));
  const maxEval = evaluateLoanAmount(transaction, product, money(max));

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

  // Seed best from min evaluation if feasible
  let low = new Decimal(min);
  let high = new Decimal(max);
  let best: Decimal | null = minEval.eligible ? new Decimal(min) : null;
  let bestResult: GoalSeekResult["finalResult"] = minEval.result;
  let iterations = 0;
  let converged = false;

  for (; iterations < maxIterations; iterations += 1) {
    const mid = low.plus(high).div(2);
    const midValue = mid.toDecimalPlaces(2).toNumber();
    const { eligible, result } = evaluateLoanAmount(transaction, product, money(midValue));
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

  if (best === null) {
    return makeFailure("never_feasible", bestResult, min, iterations);
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

export const findMaxLoanByLTV = (
  transaction: Transaction,
  product: ProductDefinition,
  targetLTV: Ratio,
  bounds: { min: number; max: number },
  tolerance = DEFAULT_TOLERANCE,
  maxIterations = DEFAULT_ITERATIONS,
): GoalSeekResult => {
  validateGoalSeekBounds(bounds, "findMaxLoanByLTV");

  const minEvalTx = applyLoanAmount(transaction, money(bounds.min));
  const minEval = evaluateScoped(minEvalTx, product);

  let low = new Decimal(bounds.min);
  let high = new Decimal(bounds.max);
  let best: Decimal | null = minEval.eligible ? new Decimal(bounds.min) : null;
  let bestResult: GoalSeekResult["finalResult"] = minEval.scoped;
  let iterations = 0;
  let converged = false;

  for (; iterations < maxIterations; iterations += 1) {
    const mid = low.plus(high).div(2);
    const midValue = mid.toDecimalPlaces(2).toNumber();
    const adjusted = applyLoanAmount(transaction, money(midValue));
    const prepared = ensureVariant(adjusted);
    const variant = prepared.variants[0];
    if (!variant) {
      throw new Error("Transaction must include at least one variant");
    }
    const graphResult = evaluate(prepared, variant, product);
    const scoped = extractScopedProductResult(product, graphResult);
    const full = evaluateProduct(prepared, variant, product);
    scoped.full = full;
    scoped.variantId = full.variantId;
    const eligible = full.eligible;

    const ltv = getGraphValue<number>(graphResult, "ltv");
    const ok = eligible && ltv !== undefined && Number(ltv) <= Number(targetLTV);
    if (ok) {
      best = mid;
      bestResult = scoped;
      low = mid;
    } else {
      high = mid;
    }
    if (high.minus(low).abs().lte(tolerance)) {
      converged = true;
      break;
    }
  }

  if (best === null) {
    return makeFailure("never_feasible", bestResult, bounds.min, iterations);
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

export const findMaxLoanByDTI = (
  transaction: Transaction,
  product: ProductDefinition,
  targetDTI: Ratio,
  bounds: { min: number; max: number },
  tolerance = DEFAULT_TOLERANCE,
  maxIterations = DEFAULT_ITERATIONS,
): GoalSeekResult => {
  validateGoalSeekBounds(bounds, "findMaxLoanByDTI");

  const minEvalTx = applyLoanAmount(transaction, money(bounds.min));
  const minEval = evaluateScoped(minEvalTx, product);

  let low = new Decimal(bounds.min);
  let high = new Decimal(bounds.max);
  let best: Decimal | null = minEval.eligible ? new Decimal(bounds.min) : null;
  let bestResult: GoalSeekResult["finalResult"] = minEval.scoped;
  let iterations = 0;
  let converged = false;

  for (; iterations < maxIterations; iterations += 1) {
    const mid = low.plus(high).div(2);
    const midValue = mid.toDecimalPlaces(2).toNumber();
    const adjusted = applyLoanAmount(transaction, money(midValue));
    const prepared = ensureVariant(adjusted);
    const variant = prepared.variants[0];
    if (!variant) {
      throw new Error("Transaction must include at least one variant");
    }
    const graphResult = evaluate(prepared, variant, product);
    const scoped = extractScopedProductResult(product, graphResult);
    const full = evaluateProduct(prepared, variant, product);
    scoped.full = full;
    scoped.variantId = full.variantId;
    const eligible = full.eligible;

    const dti = getGraphValue<number>(graphResult, "dti");
    const ok = eligible && dti !== undefined && Number(dti) <= Number(targetDTI);
    if (ok) {
      best = mid;
      bestResult = scoped;
      low = mid;
    } else {
      high = mid;
    }
    if (high.minus(low).abs().lte(tolerance)) {
      converged = true;
      break;
    }
  }

  if (best === null) {
    return makeFailure("never_feasible", bestResult, bounds.min, iterations);
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
