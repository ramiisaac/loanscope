import type { EvaluationResult, SearchResult } from "./types";
import type { Graph } from "./graph";
import { evaluate } from "./execution";

export const binarySearch = (
  evalFn: (value: number) => { pass: boolean; margin?: number },
  min: number,
  max: number,
  tolerance = 0.0001,
  maxIter = 20,
): SearchResult => {
  let low = min;
  let high = max;
  let iterations = 0;
  let bestFeasible: number | undefined;
  while (iterations < maxIter && Math.abs(high - low) > tolerance) {
    const mid = (low + high) / 2;
    const { pass } = evalFn(mid);
    if (pass) {
      bestFeasible = mid;
      low = mid;
    } else {
      high = mid;
    }
    iterations += 1;
  }
  const found = bestFeasible !== undefined;
  return { found, value: bestFeasible, iterations, bounds: { min, max } };
};

export const searchThreshold = (
  graph: Graph,
  baseInputs: Record<string, unknown>,
  targetNode: string,
  constraint: (result: EvaluationResult) => {
    pass: boolean;
    margin?: number;
  },
  bounds: { min: number; max: number },
  options?: { assertMonotone?: boolean },
): SearchResult => {
  const evalAt = (value: number) =>
    constraint(evaluate(graph, { ...baseInputs, [targetNode]: value }));

  if (options?.assertMonotone) {
    const start = evalAt(bounds.min);
    const end = evalAt(bounds.max);
    if (start.pass === end.pass) {
      return {
        found: false,
        iterations: 0,
        bounds,
        reason: "non-monotonic",
        bestFeasible: start.pass ? bounds.max : bounds.min,
      };
    }
  }

  const result = binarySearch((value) => evalAt(value), bounds.min, bounds.max, 0.0001, 20);
  return result;
};

/** @deprecated Use {@link searchThreshold} directly. This is a misnomer — it performs binary search, not gradient descent. */
export const gradientSearch = (
  graph: Graph,
  baseInputs: Record<string, unknown>,
  targetNode: string,
  objective: (result: EvaluationResult) => {
    pass: boolean;
    margin?: number;
  },
  bounds: { min: number; max: number },
): SearchResult => {
  return searchThreshold(graph, baseInputs, targetNode, objective, bounds);
};
