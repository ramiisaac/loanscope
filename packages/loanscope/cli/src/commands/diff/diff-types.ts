import type { GridSummary } from "@loanscope/compare";
import type { SimulationReport } from "@loanscope/sim";
import type { DiffKind } from "../../format-parsers";

export type DiffEntry =
  | { readonly kind: "added"; readonly path: string; readonly after: unknown }
  | {
      readonly kind: "removed";
      readonly path: string;
      readonly before: unknown;
    }
  | {
      readonly kind: "changed";
      readonly path: string;
      readonly before: unknown;
      readonly after: unknown;
    };

export interface DiffMetadataPair {
  readonly a: DiffMetadata;
  readonly b: DiffMetadata;
}

export interface DiffMetadata {
  readonly id: string;
  readonly name: string;
  readonly description?: string | null;
  readonly createdAt: string;
}

export interface GridSummaryDelta {
  readonly totalCells: number;
  readonly passCount: number;
  readonly failCount: number;
  readonly warnCount: number;
  readonly partialCount: number;
  readonly errorCount: number;
}

export interface SimulationReportDelta {
  readonly statesExplored: number;
  readonly terminatedBefore: SimulationReport["terminated"];
  readonly terminatedAfter: SimulationReport["terminated"];
  readonly perProductFixesDelta: number;
  readonly bestStatesDelta: number;
}

export interface DiffReport {
  readonly kind: DiffKind;
  readonly metadata: DiffMetadataPair;
  readonly configPayload: ReadonlyArray<DiffEntry>;
  readonly resultPayload: ReadonlyArray<DiffEntry>;
  readonly resultAsymmetry?: "a-only" | "b-only" | "none" | "both-null";
  readonly gridSummaryDelta?: GridSummaryDelta;
  readonly simulationDelta?: SimulationReportDelta;
}

interface GridSummaryLike {
  readonly totalCells: number;
  readonly passCount: number;
  readonly failCount: number;
  readonly warnCount: number;
  readonly partialCount: number;
  readonly errorCount: number;
}

export const isGridSummary = (value: unknown): value is GridSummary => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const keys: ReadonlyArray<keyof GridSummary> = [
    "totalCells",
    "passCount",
    "failCount",
    "warnCount",
    "partialCount",
    "errorCount",
  ];
  const record = value as Record<string, unknown>;
  for (const key of keys) {
    const keyValue = record[key];
    if (typeof keyValue !== "number" || !Number.isFinite(keyValue)) {
      return false;
    }
  }
  return true;
};

export const buildGridSummaryDelta = (
  a: GridSummaryLike,
  b: GridSummaryLike,
): GridSummaryDelta => ({
  totalCells: b.totalCells - a.totalCells,
  passCount: b.passCount - a.passCount,
  failCount: b.failCount - a.failCount,
  warnCount: b.warnCount - a.warnCount,
  partialCount: b.partialCount - a.partialCount,
  errorCount: b.errorCount - a.errorCount,
});

const isTerminated = (value: unknown): value is SimulationReport["terminated"] =>
  value === "complete" || value === "limit" || value === "timeout";

export const isSimulationReport = (value: unknown): value is SimulationReport => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  if (typeof record["statesExplored"] !== "number") return false;
  if (!isTerminated(record["terminated"])) return false;
  if (!Array.isArray(record["perProductFixes"])) return false;
  if (!Array.isArray(record["bestStates"])) return false;
  return true;
};

export const buildSimulationDelta = (
  a: SimulationReport,
  b: SimulationReport,
): SimulationReportDelta => ({
  statesExplored: b.statesExplored - a.statesExplored,
  terminatedBefore: a.terminated,
  terminatedAfter: b.terminated,
  perProductFixesDelta: b.perProductFixes.length - a.perProductFixes.length,
  bestStatesDelta: b.bestStates.length - a.bestStates.length,
});
