import graphlib from "graphlib";
const { alg } = graphlib;
import { Graph, valueNodeId } from "./graph";
import type { NodeDefinition } from "./types";

const stripValuePrefix = (id: string): string => (id.startsWith("v:") ? id.slice(2) : id);
const isValueNode = (id: string): boolean => id.startsWith("v:");

export const topologicalSort = (graph: Graph): string[] => alg.topsort(graph.internal);

export const reachableFrom = (graph: Graph, inputNodeIds: string[]): string[] => {
  const starts = inputNodeIds.map(valueNodeId);
  const reachable = alg.preorder(graph.internal, starts);
  return reachable.filter(isValueNode).map(stripValuePrefix);
};

export const ancestorsOf = (graph: Graph, nodeId: string): string[] => {
  const start = valueNodeId(nodeId);
  const visited = new Set<string>();
  const stack: string[] = [start];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    const preds = graph.internal.predecessors(current) ?? [];
    for (const pred of preds) {
      if (!visited.has(pred)) {
        visited.add(pred);
        stack.push(pred);
      }
    }
  }
  return Array.from(visited)
    .filter(isValueNode)
    .map(stripValuePrefix)
    .filter((id) => id !== nodeId);
};

export const dependentsOf = (graph: Graph, nodeId: string): string[] => {
  const start = valueNodeId(nodeId);
  const visited = new Set<string>();
  const queue: string[] = [start];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;
    const succ = graph.internal.successors(current) ?? [];
    for (const next of succ) {
      if (!visited.has(next)) {
        visited.add(next);
        queue.push(next);
      }
    }
  }
  return Array.from(visited)
    .filter(isValueNode)
    .map(stripValuePrefix)
    .filter((id) => id !== nodeId);
};

export const pathTo = (
  graph: Graph,
  fromInputs: string[],
  targetNodeId: string,
): { path: string[]; missing: string[] } => {
  const target = valueNodeId(targetNodeId);
  const starts = fromInputs.map(valueNodeId);
  const queue = [...starts];
  const parent = new Map<string, string | null>();
  for (const start of starts) parent.set(start, null);

  let found = false;
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;
    if (current === target) {
      found = true;
      break;
    }
    const succ = graph.internal.successors(current) ?? [];
    for (const next of succ) {
      if (!parent.has(next)) {
        parent.set(next, current);
        queue.push(next);
      }
    }
  }

  const pathEdgeIds: string[] = [];
  if (found) {
    let cursor: string | null | undefined = target;
    while (cursor) {
      if (cursor.startsWith("e:")) {
        pathEdgeIds.push(cursor.slice(2));
      }
      cursor = parent.get(cursor) ?? null;
    }
    pathEdgeIds.reverse();
  }

  const missing = found ? [] : computeMissingInputs(graph, targetNodeId, new Set(fromInputs));

  return { path: pathEdgeIds, missing };
};

const computeMissingInputs = (
  graph: Graph,
  targetNodeId: string,
  provided: Set<string>,
): string[] => {
  const ancestors = ancestorsOf(graph, targetNodeId);
  const missing: string[] = [];
  for (const id of ancestors) {
    const node: NodeDefinition | undefined = graph.nodes.get(id);
    if (node?.kind === "input" && !provided.has(id)) {
      missing.push(id);
    }
  }
  return missing;
};

export const findCycles = (graph: Graph): string[][] => alg.findCycles(graph.internal);

export const edgePathTo = (
  graph: Graph,
  inputNodeIds: string[],
  targetNodeId: string,
): { path: string[]; missing: string[] } => pathTo(graph, inputNodeIds, targetNodeId);
