import type { EvaluationResult, SweepResult } from "./types";
import { evaluate } from "./execution";
import type { Graph } from "./graph";

export const sweep = (
  graph: Graph,
  baseInputs: Record<string, unknown>,
  dimension: { nodeId: string; values: unknown[] },
): SweepResult => {
  const results: EvaluationResult[] = [];
  for (const value of dimension.values) {
    results.push(evaluate(graph, { ...baseInputs, [dimension.nodeId]: value }));
  }
  return { dimension, results };
};
