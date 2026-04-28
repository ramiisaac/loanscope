import { Graph } from "./graph";
import { reachableFrom, topologicalSort } from "./traversal";
import type {
  ValueSource,
  EdgeDefinition,
  EvaluationResult,
  ComputedValue,
  GraphCheckResult,
  GraphExecutionError,
} from "./types";

/**
 * Numeric rank for value-source precedence.
 * Lower rank = higher precedence: provided > defaulted > derived > estimated.
 */
const SOURCE_RANK: Record<ValueSource, number> = {
  provided: 0,
  defaulted: 1,
  derived: 2,
  estimated: 3,
};

interface ResolvedEntry {
  value: unknown;
  source: ValueSource;
  computedBy?: string;
}

const edgePriority = (edge: EdgeDefinition | undefined): number => edge?.priority ?? 0;

/**
 * Determines whether a new computation should replace an existing resolved
 * value based on source precedence, edge priority, then stable edge-id tie-break.
 */
const shouldReplace = (
  current: ResolvedEntry | undefined,
  next: ResolvedEntry,
  edges: Map<string, EdgeDefinition>,
): boolean => {
  if (!current) return true;
  if (current.source === "provided") return false;

  const currRank = SOURCE_RANK[current.source];
  const nextRank = SOURCE_RANK[next.source];
  if (nextRank < currRank) return true;
  if (nextRank > currRank) return false;

  const currentEdge = current.computedBy ? edges.get(current.computedBy) : undefined;
  const nextEdge = next.computedBy ? edges.get(next.computedBy) : undefined;
  const currentPriority = edgePriority(currentEdge);
  const nextPriority = edgePriority(nextEdge);
  if (nextPriority < currentPriority) return true;
  if (nextPriority > currentPriority) return false;

  return (next.computedBy ?? "").localeCompare(current.computedBy ?? "") < 0;
};

/** Build a map from output nodeId to the list of edge ids that can produce it. */
const buildCandidateEdgeIndex = (edges: Map<string, EdgeDefinition>): Map<string, string[]> => {
  const index = new Map<string, string[]>();
  for (const edge of edges.values()) {
    for (const output of edge.outputs) {
      let list = index.get(output);
      if (!list) {
        list = [];
        index.set(output, list);
      }
      list.push(edge.id);
    }
  }
  return index;
};

/** Create an empty canonical result. */
const emptyResult = (): EvaluationResult => ({
  inputs: {},
  computed: {},
  checks: {},
  blocked: [],
  errors: [],
  inputScope: [],
  effectiveScope: [],
  estimatesUsed: [],
});

/**
 * Determine if a raw check-edge output value has the shape of a GraphCheckResult.
 * We require at minimum `status` and `key` string fields.
 */
const isCheckShape = (
  v: unknown,
): v is { key: string; status: "PASS" | "FAIL" | "WARN" } & Record<string, unknown> => {
  if (typeof v !== "object" || v === null) return false;
  const obj = v as Record<string, unknown>;
  return (
    typeof obj["key"] === "string" &&
    (obj["status"] === "PASS" || obj["status"] === "FAIL" || obj["status"] === "WARN")
  );
};

/** Full graph evaluation producing the canonical EvaluationResult. */
export const evaluate = (graph: Graph, inputs: Record<string, unknown>): EvaluationResult => {
  const result = emptyResult();

  /* Internal resolved-value map spanning all sources. */
  const resolved = new Map<string, ResolvedEntry>();

  /* Track which nodes were provided vs defaulted for scope computation. */
  const providedNodeIds: string[] = [];
  const defaultedNodeIds: string[] = [];

  /* Candidate edge index for blocked analysis later. */
  const candidateEdges = buildCandidateEdgeIndex(graph.edges);

  /* --- Phase 1: Seed inputs and defaults --- */
  for (const [nodeId, node] of graph.nodes.entries()) {
    const hasKey = Object.prototype.hasOwnProperty.call(inputs, nodeId);
    const rawValue = hasKey ? inputs[nodeId] : undefined;

    if (hasKey && rawValue !== undefined) {
      const entry: ResolvedEntry = { value: rawValue, source: "provided" };
      resolved.set(nodeId, entry);
      result.inputs[nodeId] = { value: rawValue, source: "provided" };
      providedNodeIds.push(nodeId);
    } else if (node.defaultValue !== undefined) {
      const entry: ResolvedEntry = {
        value: node.defaultValue,
        source: "defaulted",
      };
      resolved.set(nodeId, entry);
      result.computed[nodeId] = {
        value: node.defaultValue,
        source: "defaulted",
      };
      defaultedNodeIds.push(nodeId);
    }
  }

  /* Track estimate edges that actually fire and their outputs. */
  const estimateOutputs = new Map<string, { edgeId: string; value: unknown }>();

  /* --- Phase 2: Execute edges in topological order --- */
  const order = topologicalSort(graph);
  for (const internalId of order) {
    if (!internalId.startsWith("e:")) continue;
    const edgeId = internalId.slice(2);
    const edge = graph.edges.get(edgeId);
    if (!edge) continue;

    /* Check all inputs are resolved. */
    const missingInputs = edge.inputs.filter((id) => !resolved.has(id));
    if (missingInputs.length > 0) continue;

    /* Gather input values for the compute function. */
    const inputValues: Record<string, unknown> = {};
    for (const inputId of edge.inputs) {
      const entry = resolved.get(inputId);
      inputValues[inputId] = entry ? entry.value : undefined;
    }

    let outputValues: Record<string, unknown>;
    try {
      outputValues = edge.compute(inputValues);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const error: GraphExecutionError = {
        edgeId,
        message,
        nodeIds: edge.outputs,
      };
      result.errors.push(error);
      continue;
    }

    /* Determine the source tag based on edge kind. */
    const sourceForKind: ValueSource =
      edge.kind === "estimate" ? "estimated" : edge.kind === "check" ? "derived" : "derived";

    for (const outputNodeId of edge.outputs) {
      if (!Object.prototype.hasOwnProperty.call(outputValues, outputNodeId)) {
        continue;
      }

      const rawOutputValue = outputValues[outputNodeId];
      const nextEntry: ResolvedEntry = {
        value: rawOutputValue,
        source: sourceForKind,
        computedBy: edgeId,
      };

      if (!shouldReplace(resolved.get(outputNodeId), nextEntry, graph.edges)) {
        continue;
      }

      resolved.set(outputNodeId, nextEntry);

      /* --- Check edge handling --- */
      if (edge.kind === "check" && isCheckShape(rawOutputValue)) {
        const checkValue = rawOutputValue as Record<string, unknown>;
        const checkResult: GraphCheckResult = {
          key: checkValue["key"] as string,
          status: checkValue["status"] as "PASS" | "FAIL" | "WARN",
          computedBy: edgeId,
        };
        if (typeof checkValue["actual"] === "string") {
          checkResult.actual = checkValue["actual"];
        }
        if (typeof checkValue["limit"] === "string") {
          checkResult.limit = checkValue["limit"];
        }
        if (typeof checkValue["message"] === "string") {
          checkResult.message = checkValue["message"];
        }
        if (typeof checkValue["margin"] === "object" && checkValue["margin"] !== null) {
          const rawMargin = checkValue["margin"] as NonNullable<GraphCheckResult["margin"]>;
          checkResult.margin = rawMargin;
        }
        if (typeof checkValue["severity"] === "string") {
          const rawSeverity = checkValue["severity"] as NonNullable<GraphCheckResult["severity"]>;
          checkResult.severity = rawSeverity;
        }
        result.checks[checkResult.key] = checkResult;
      }

      /* --- Estimate tracking --- */
      if (edge.kind === "estimate") {
        estimateOutputs.set(outputNodeId, {
          edgeId,
          value: rawOutputValue,
        });
      } else {
        /* A non-estimate replaced this node -- remove stale estimate record. */
        estimateOutputs.delete(outputNodeId);
      }

      /* Store in computed (non-provided values). */
      const cv: ComputedValue = {
        value: rawOutputValue,
        source: sourceForKind,
        computedBy: edgeId,
      };
      result.computed[outputNodeId] = cv;
    }
  }

  /* --- Phase 3: Finalize estimatesUsed --- */
  for (const [nodeId, est] of estimateOutputs.entries()) {
    const current = resolved.get(nodeId);
    if (current && current.source === "estimated" && current.computedBy === est.edgeId) {
      result.estimatesUsed.push({
        nodeId,
        estimatedBy: est.edgeId,
        value: est.value,
      });
    }
  }

  /* --- Phase 4: Scope computation --- */
  result.inputScope = reachableFrom(graph, providedNodeIds);

  const allResolvedNodeIds = Array.from(resolved.keys());
  result.effectiveScope = reachableFrom(graph, allResolvedNodeIds);

  /* --- Phase 5: Blocked analysis --- */
  for (const nodeId of graph.nodes.keys()) {
    if (resolved.has(nodeId)) continue;

    const candidates = candidateEdges.get(nodeId) ?? [];
    let bestMissing: string[] | null = null;

    for (const candEdgeId of candidates) {
      const candEdge = graph.edges.get(candEdgeId);
      if (!candEdge) continue;
      const missing = candEdge.inputs.filter((id) => !resolved.has(id));
      if (bestMissing === null || missing.length < bestMissing.length) {
        bestMissing = missing;
      }
    }

    result.blocked.push({ nodeId, missingInputs: bestMissing ?? [] });
  }

  return result;
};

/**
 * Re-evaluate from a previous result merged with changed inputs.
 * Only truly provided inputs from the previous run are carried forward.
 */
export const evaluateIncremental = (
  graph: Graph,
  prevResult: EvaluationResult,
  changedInputs: Record<string, unknown>,
): EvaluationResult => {
  const mergedInputs: Record<string, unknown> = {};
  for (const [nodeId, entry] of Object.entries(prevResult.inputs)) {
    if (entry.source === "provided") {
      mergedInputs[nodeId] = entry.value;
    }
  }
  for (const [nodeId, value] of Object.entries(changedInputs)) {
    mergedInputs[nodeId] = value;
  }
  return evaluate(graph, mergedInputs);
};

/**
 * Evaluate allowing only the specified estimate edges; all other
 * estimate edges are filtered out of the graph before execution.
 */
export const evaluateWithEstimates = (
  graph: Graph,
  inputs: Record<string, unknown>,
  estimateEdgeIds: string[],
): EvaluationResult => {
  const allowed = new Set(estimateEdgeIds);
  const filteredEdges = new Map<string, EdgeDefinition>();
  for (const [edgeId, edge] of graph.edges.entries()) {
    if (edge.kind !== "estimate" || allowed.has(edgeId)) {
      filteredEdges.set(edgeId, edge);
    }
  }
  const filtered = new Graph({ nodes: graph.nodes, edges: filteredEdges });
  return evaluate(filtered, inputs);
};
