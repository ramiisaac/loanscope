import type { EvaluationResult } from "./types";
import type { Graph } from "./graph";

export const graphToMermaid = (graph: Graph): string => {
  const lines: string[] = ["flowchart TD"];
  for (const edge of graph.edges.values()) {
    for (const input of edge.inputs) {
      lines.push(`  ${input} --> ${edge.id}`);
    }
    for (const output of edge.outputs) {
      lines.push(`  ${edge.id} --> ${output}`);
    }
  }
  return lines.join("\n");
};

export const graphToDot = (graph: Graph): string => {
  const lines: string[] = ["digraph G {"];
  for (const edge of graph.edges.values()) {
    lines.push(`  "${edge.id}" [shape=box];`);
    for (const input of edge.inputs) {
      lines.push(`  "${input}" -> "${edge.id}";`);
    }
    for (const output of edge.outputs) {
      lines.push(`  "${edge.id}" -> "${output}";`);
    }
  }
  lines.push("}");
  return lines.join("\n");
};

export const evaluationToTrace = (graph: Graph, result: EvaluationResult): string[] => {
  const lines: string[] = [];
  for (const [nodeId, entry] of Object.entries(result.computed)) {
    if (entry.computedBy) {
      const edge = graph.edges.get(entry.computedBy);
      const inputs = edge
        ? edge.inputs.map((input) => `${input} (${formatValue(result, input)})`)
        : [];
      lines.push(`${nodeId} (${formatValue(result, nodeId)}) <- [${inputs.join(", ")}]`);
    }
  }
  for (const blocked of result.blocked) {
    lines.push(`${blocked.nodeId} (BLOCKED) <- missing: [${blocked.missingInputs.join(", ")}]`);
  }
  return lines;
};

const formatValue = (result: EvaluationResult, nodeId: string): string => {
  const input = result.inputs[nodeId];
  if (input) {
    const v = input.value;
    return typeof v === "string" ? v : JSON.stringify(v);
  }
  const computed = result.computed[nodeId];
  if (computed) {
    const v = computed.value;
    return typeof v === "string" ? v : JSON.stringify(v);
  }
  return "n/a";
};
