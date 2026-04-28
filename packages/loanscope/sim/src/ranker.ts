import { deepEqual } from "fast-equals";
import type { SimState, SimulationObjective } from "./types";

const scoreState = (state: SimState, objective: SimulationObjective): number => {
  switch (objective) {
    case "MaximizeEligible":
      return state.eligibleCount;
    case "MinimizeCash":
      return -Number(state.totalCashUsed);
    case "MinimizeActions":
      return -state.actions.length;
    case "MaximizeWorstMargin":
      return state.worstMargin ? -state.worstMargin.deltaToPass : 0;
    default:
      return 0;
  }
};

/**
 * Returns true when vector `a` Pareto-dominates vector `b`:
 * every component >= and at least one strictly >.
 */
const dominates = (a: number[], b: number[]): boolean => {
  let strictlyBetter = false;
  for (let i = 0; i < a.length; i += 1) {
    const aVal = a[i];
    const bVal = b[i];
    if (aVal === undefined || bVal === undefined) continue;
    if (aVal < bVal) return false;
    if (aVal > bVal) strictlyBetter = true;
  }
  return strictlyBetter;
};

export const deduplicateStates = (states: SimState[]): SimState[] => {
  const unique: SimState[] = [];
  for (const state of states) {
    if (!unique.some((existing) => deepEqual(existing, state))) {
      unique.push(state);
    }
  }
  return unique;
};

export const isParetoOptimal = (
  state: SimState,
  others: SimState[],
  objectives: SimulationObjective[],
): boolean => {
  const vector = objectives.map((objective) => scoreState(state, objective));
  return !others.some((other) => {
    const otherVector = objectives.map((objective) => scoreState(other, objective));
    return dominates(otherVector, vector);
  });
};

/**
 * N-dimensional Pareto frontier extraction.
 * Returns the subset of states not dominated by any other state.
 */
export const rankStates = (states: SimState[], objectives: SimulationObjective[]): SimState[] => {
  if (states.length === 0) return [];

  const scored = states.map((state) => ({
    state,
    vector: objectives.map((objective) => scoreState(state, objective)),
  }));

  return scored
    .filter((point) => {
      return !scored.some((other) => other !== point && dominates(other.vector, point.vector));
    })
    .map((point) => point.state);
};
