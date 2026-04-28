import type { ProductDefinition } from "@loanscope/domain";
import type { ProductFix, SimState, SimulationReport } from "./types";

export const extractPerProductFixes = (
  states: SimState[],
  products: ProductDefinition[],
): ProductFix[] => {
  const fixes: ProductFix[] = [];
  for (const product of products) {
    const candidates = states
      .filter((state) =>
        state.results?.some((result) => result.productId === product.id && result.full?.eligible),
      )
      .sort((a, b) => a.actions.length - b.actions.length);
    const best = candidates[0];
    if (!best) continue;
    const result = best.results?.find((res) => res.productId === product.id);
    if (!result?.full) continue;
    fixes.push({
      productId: product.id,
      productName: product.name,
      actions: best.actions,
      cashRequired: best.totalCashUsed,
      resultingChecks: result.full.checks,
      eligible: result.full.eligible,
    });
  }
  return fixes;
};

export const extractBestStates = (states: SimState[], limit: number): SimState[] => {
  return [...states].slice(0, limit);
};

export const buildReport = (
  explored: number,
  terminated: "complete" | "limit" | "timeout",
  states: SimState[],
  products: ProductDefinition[],
): SimulationReport => {
  return {
    perProductFixes: extractPerProductFixes(states, products),
    bestStates: extractBestStates(states, 10),
    statesExplored: explored,
    terminated,
  };
};
