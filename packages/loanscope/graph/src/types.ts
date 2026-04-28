export type NodeKind = "input" | "computed" | "check" | "output";
export type ValueType =
  | "Money"
  | "Ratio"
  | "RatePct"
  | "Months"
  | "Boolean"
  | "Enum"
  | "Object"
  | "Array";

/** Canonical 4-value source model for how a value was determined. */
export type ValueSource = "provided" | "defaulted" | "derived" | "estimated";

export type EdgeKind = "transform" | "estimate" | "check";

export interface NodeDefinition {
  id: string;
  kind: NodeKind;
  valueType: ValueType;
  description?: string;
  defaultValue?: unknown;
}

export interface EdgeMetadata {
  category?: "transform" | "check" | "estimate";
  severity?: "blocker" | "warning" | "info";
  documentation?: string;
}

export interface EdgeDefinition {
  id: string;
  kind: EdgeKind;
  inputs: string[];
  outputs: string[];
  compute: (inputs: Record<string, unknown>) => Record<string, unknown>;
  confidence: ValueSource;
  description?: string;
  metadata?: EdgeMetadata;
  priority?: number;
}

export interface GraphDefinition {
  nodes: Map<string, NodeDefinition>;
  edges: Map<string, EdgeDefinition>;
}

/** Structured error from a single edge execution failure. */
export interface GraphExecutionError {
  edgeId: string;
  message: string;
  code?: string;
  nodeIds?: string[];
}

/** A computed value annotated with provenance. */
export interface ComputedValue<T = unknown> {
  value: T;
  source: ValueSource;
  computedBy?: string;
  trace?: string[];
}

/** First-class result of a single underwriting check within the graph. */
export interface GraphCheckResult {
  key: string;
  status: "PASS" | "FAIL" | "WARN";
  actual?: string;
  limit?: string;
  message?: string;
  margin?: {
    kind: "Money" | "Ratio" | "Months";
    deltaToPass: number;
    actionHint?: string;
  };
  computedBy?: string;
  severity?: "blocker" | "warning" | "info";
}

/** Canonical evaluation result for a full graph execution pass. */
export interface EvaluationResult {
  inputs: Record<string, { value: unknown; source: "provided" }>;
  computed: Record<string, ComputedValue>;
  checks: Record<string, GraphCheckResult>;
  blocked: Array<{ nodeId: string; missingInputs: string[] }>;
  errors: GraphExecutionError[];
  inputScope: string[];
  effectiveScope: string[];
  estimatesUsed: Array<{ nodeId: string; estimatedBy: string; value: unknown }>;
}

export interface SweepResult {
  dimension: { nodeId: string; values: unknown[] };
  results: EvaluationResult[];
}

export interface GridResult {
  dimensions: Array<{ nodeId: string; values: unknown[] }>;
  cells: EvaluationResult[][];
  flatCells: Array<{
    coordinates: Record<string, unknown>;
    result: EvaluationResult;
  }>;
}

export interface SearchResult {
  found: boolean;
  value?: unknown;
  result?: EvaluationResult;
  iterations: number;
  bounds: { min: number; max: number };
  bestFeasible?: number;
  reason?: string;
}

export type EdgeRegistry = Map<string, EdgeDefinition>;
