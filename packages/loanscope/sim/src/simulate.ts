import { ProductDefinition } from "@loanscope/domain";
import { SimState, SimulationPlan, SimulationReport } from "./types";
import { applyAction } from "./actions";
import { createInitialState, stateKey } from "./state";
import { evaluateState, deriveStateMetrics } from "./executor";
import { generateCandidateActions, prioritizeActions } from "./generator";
import { deduplicateStates, rankStates } from "./ranker";
import { buildReport } from "./reporter";

const now = (): number => Date.now();

export const simulate = (
  transaction: SimState["baseTransaction"],
  products: ProductDefinition[],
  plan: SimulationPlan,
): SimulationReport => {
  const start = now();
  const limits = plan.limits;
  const baseVariant = transaction.variants[0];
  if (!baseVariant) {
    throw new Error("Simulation requires a base transaction with at least one variant");
  }

  const initial = createInitialState(transaction, baseVariant);
  const queue: SimState[] = [initial];
  const visited = new Set<string>();
  const explored: SimState[] = [];
  let terminated: "complete" | "limit" | "timeout" = "complete";

  while (queue.length > 0) {
    if (limits.timeoutMs && now() - start > limits.timeoutMs) {
      terminated = "timeout";
      break;
    }
    if (explored.length >= limits.maxStates) {
      terminated = "limit";
      break;
    }
    const state = queue.shift();
    if (!state) continue;
    const key = stateKey(state);
    if (visited.has(key)) continue;
    visited.add(key);

    const evaluated = evaluateState(state, products);
    const metrics = deriveStateMetrics(evaluated);
    evaluated.eligibleCount = metrics.eligibleCount;
    if (metrics.worstMargin !== undefined) {
      evaluated.worstMargin = metrics.worstMargin;
    }

    explored.push(evaluated);

    if (evaluated.actions.length >= limits.maxDepth) {
      continue;
    }

    const margins =
      evaluated.results
        ?.flatMap((result) => result.full?.checks ?? [])
        .map((check) => check.margin)
        .filter((margin): margin is NonNullable<typeof margin> => Boolean(margin)) ?? [];

    const candidates = generateCandidateActions(evaluated, plan);
    const prioritized = prioritizeActions(candidates, margins);

    for (const action of prioritized) {
      const nextState = applyAction(evaluated, action);
      queue.push(nextState);
    }
  }

  const deduped = deduplicateStates(explored);
  const ranked = rankStates(deduped, plan.objectives);

  return buildReport(explored.length, terminated, ranked, products);
};
