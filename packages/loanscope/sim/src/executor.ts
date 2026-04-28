import type { ProductDefinition } from "@loanscope/domain";
import type { SimError, SimState } from "./types";
import { buildScopedResponse, evaluate, evaluateProduct } from "@loanscope/engine";
import { stateToEffectiveTransaction } from "./state";

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

/** Evaluates a SimState against all products, surfacing errors instead of swallowing them. */
export const evaluateState = (state: SimState, products: ProductDefinition[]): SimState => {
  const transaction = stateToEffectiveTransaction(state);
  const variant = transaction.variants[0];
  if (!variant) {
    throw new Error("Effective transaction requires a variant");
  }
  const errors: SimError[] = [];
  const results = products.flatMap((product) => {
    try {
      const graphResult = evaluate(transaction, variant, product);
      const scoped = buildScopedResponse(transaction, [product], graphResult).products[0];
      if (!scoped) {
        return [];
      }
      if (!scoped.full && hasComparableUnderwritingBasis(graphResult)) {
        const full = evaluateProduct(transaction, variant, product);
        scoped.full = full;
        scoped.variantId = full.variantId;
      }
      return [scoped];
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push({ productId: product.id, message });
      return [];
    }
  });
  return {
    ...state,
    results,
    ...(errors.length > 0 ? { errors } : {}),
  };
};

export const deriveStateMetrics = (
  state: SimState,
): {
  eligibleCount: number;
  worstMargin?: NonNullable<SimState["worstMargin"]>;
} => {
  const results = state.results ?? [];
  let eligibleCount = 0;
  let worstMargin: NonNullable<SimState["worstMargin"]> | undefined;
  for (const result of results) {
    if (result.full?.eligible) {
      eligibleCount += 1;
    }
    const checks = result.full?.checks ?? [];
    for (const check of checks) {
      if (!check.margin) continue;
      if (!worstMargin || check.margin.deltaToPass > worstMargin.deltaToPass) {
        worstMargin = check.margin;
      }
    }
  }
  if (worstMargin !== undefined) {
    return { eligibleCount, worstMargin };
  }
  return { eligibleCount };
};
