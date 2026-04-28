import type { AuditSessionRecord, DatabaseManager, AuditExitStatus } from "@loanscope/db";
import { buildId } from "../ids";
import { CliValidationError } from "../cli-error";
import { renderJson } from "../output";

import type { ActionOutputFormat } from "../output";

/* ------------------------------------------------------------------ */
/*  Command discriminant                                              */
/* ------------------------------------------------------------------ */

/**
 * Narrow set of CLI commands that may emit an audit session. Keeps the
 * `audit_sessions.command` column bounded to a known enum even though the
 * underlying schema stores free-form text.
 */
export type AuditableCommand = "evaluate" | "compare" | "simulate" | "goalseek" | "quote";

const AUDITABLE_COMMANDS: ReadonlySet<AuditableCommand> = new Set<AuditableCommand>([
  "evaluate",
  "compare",
  "simulate",
  "goalseek",
  "quote",
]);

const isAuditableCommand = (raw: string): raw is AuditableCommand =>
  (AUDITABLE_COMMANDS as ReadonlySet<string>).has(raw);

/**
 * Validates a raw string as an {@link AuditableCommand}. Exported so CLI
 * subcommands can funnel user-facing flag values through a single narrow
 * contract.
 */
export const assertAuditableCommand = (raw: string): AuditableCommand => {
  if (isAuditableCommand(raw)) {
    return raw;
  }
  throw new CliValidationError(
    `Invalid audit command: "${raw}". Valid values: ${[...AUDITABLE_COMMANDS].join(", ")}.`,
  );
};

/* ------------------------------------------------------------------ */
/*  Start audit                                                        */
/* ------------------------------------------------------------------ */

export interface StartAuditInput {
  readonly command: AuditableCommand;
  readonly argsPayload: unknown;
  readonly scenarioId?: string;
  readonly now?: Date;
  readonly sessionId?: string;
}

export interface StartAuditResult {
  readonly sessionId: string;
}

/**
 * Opens a new audit session in status `running`. The returned `sessionId` is
 * stable across the lifetime of the run and is the sole identifier passed
 * through to the matching `completeAuditSuccess` / `completeAuditError` call.
 *
 * Callers must ensure exactly one completion call per `startAudit` — a
 * dangling `running` row indicates the CLI crashed hard enough to bypass the
 * top-level try/catch. The `audit list` surface treats these rows as
 * diagnostic signal rather than an error state.
 */
export const startAudit = (manager: DatabaseManager, input: StartAuditInput): StartAuditResult => {
  const sessionId = buildId(input.sessionId, input.command, {
    ...(input.now !== undefined ? { now: input.now } : {}),
    fallback: "audit",
  });
  try {
    manager.auditSessions.create({
      sessionId,
      command: input.command,
      argsPayload: input.argsPayload,
      ...(input.scenarioId !== undefined ? { scenarioId: input.scenarioId } : {}),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new CliValidationError(`Failed to start audit session "${sessionId}": ${message}`);
  }
  return { sessionId };
};

/* ------------------------------------------------------------------ */
/*  Complete audit                                                     */
/* ------------------------------------------------------------------ */

/**
 * Finalizes an audit session with `exit_status = "success"` and attaches the
 * supplied `resultSummary`. The summary shape is command-specific and is
 * stored as opaque JSON; callers are responsible for keeping the shape
 * stable enough to diff across runs.
 */
export const completeAuditSuccess = (
  manager: DatabaseManager,
  sessionId: string,
  resultSummary: unknown,
): void => {
  manager.auditSessions.markSuccess(sessionId, resultSummary);
};

/**
 * Finalizes an audit session with `exit_status = "error"`. The `phase` field
 * on the summary distinguishes `evaluation` failures (the underlying engine /
 * compare / sim call threw) from `persistence` failures (the save path
 * threw after a successful core run). This is the minimum signal needed to
 * triage a failed audit without re-running the command.
 */
export const completeAuditError = (
  manager: DatabaseManager,
  sessionId: string,
  resultSummary: unknown,
): void => {
  manager.auditSessions.markError(sessionId, resultSummary);
};

/* ------------------------------------------------------------------ */
/*  Require helper                                                    */
/* ------------------------------------------------------------------ */

/**
 * Loads an audit session by id or raises `CliValidationError`. Exported so
 * follow-on commands (diff, export) can reuse the same error contract.
 */
export const requireAuditSession = (
  manager: DatabaseManager,
  sessionId: string,
): AuditSessionRecord => {
  const found = manager.auditSessions.findById(sessionId);
  if (!found) {
    throw new CliValidationError(`Unknown audit session: "${sessionId}".`);
  }
  return found;
};

/* ------------------------------------------------------------------ */
/*  List                                                               */
/* ------------------------------------------------------------------ */

export interface ListAuditSessionsInput {
  readonly command?: string;
  readonly output: ActionOutputFormat;
}

interface AuditSessionListEntry {
  readonly sessionId: string;
  readonly command: string;
  readonly exitStatus: AuditExitStatus;
  readonly scenarioId: string | null;
  readonly startedAt: string;
  readonly completedAt: string | null;
}

const toListEntry = (record: AuditSessionRecord): AuditSessionListEntry => ({
  sessionId: record.sessionId,
  command: record.command,
  exitStatus: record.exitStatus,
  scenarioId: record.scenarioId,
  startedAt: record.startedAt,
  completedAt: record.completedAt,
});

/**
 * Lists audit sessions, optionally narrowed to a single command. Results are
 * sorted ascending by `startedAt` so the most recent run appears last — this
 * matches operator expectations from the import-run listing surface.
 */
export const listAuditSessionsAction = (
  manager: DatabaseManager,
  input: ListAuditSessionsInput,
): string => {
  const raw =
    input.command !== undefined
      ? manager.auditSessions.findByCommand(input.command)
      : manager.auditSessions.findAll();
  const all = [...raw].sort((a, b) => a.startedAt.localeCompare(b.startedAt));

  if (input.output === "json") {
    return renderJson(all.map(toListEntry));
  }
  if (all.length === 0) {
    const scope = input.command !== undefined ? ` for command "${input.command}"` : "";
    return `No audit sessions${scope}.`;
  }
  const lines: string[] = [];
  for (const record of all) {
    const scenarioSuffix = record.scenarioId !== null ? ` [scenario: ${record.scenarioId}]` : "";
    lines.push(`${record.sessionId} — ${record.command} [${record.exitStatus}]${scenarioSuffix}`);
    lines.push(`  Started:  ${record.startedAt}`);
    if (record.completedAt !== null) {
      lines.push(`  Finished: ${record.completedAt}`);
    }
  }
  return lines.join("\n");
};

/* ------------------------------------------------------------------ */
/*  Show                                                               */
/* ------------------------------------------------------------------ */

export interface ShowAuditSessionInput {
  readonly sessionId: string;
  readonly output: ActionOutputFormat;
}

interface AuditSessionDetail {
  readonly sessionId: string;
  readonly command: string;
  readonly exitStatus: AuditExitStatus;
  readonly scenarioId: string | null;
  readonly argsPayload: unknown;
  readonly resultSummary: unknown;
  readonly startedAt: string;
  readonly completedAt: string | null;
}

const toDetail = (record: AuditSessionRecord): AuditSessionDetail => ({
  sessionId: record.sessionId,
  command: record.command,
  exitStatus: record.exitStatus,
  scenarioId: record.scenarioId,
  argsPayload: record.argsPayload,
  resultSummary: record.resultSummary,
  startedAt: record.startedAt,
  completedAt: record.completedAt,
});

/**
 * Renders full detail for a single audit session. JSON mode is the stable
 * machine-readable contract (identical to `AuditSessionDetail`); text mode
 * surfaces the argsPayload and resultSummary via `JSON.stringify` so nested
 * objects remain legible without a dedicated table renderer.
 */
export const showAuditSessionAction = (
  manager: DatabaseManager,
  input: ShowAuditSessionInput,
): string => {
  const record = requireAuditSession(manager, input.sessionId);
  const detail = toDetail(record);
  if (input.output === "json") {
    return renderJson(detail);
  }
  const lines: string[] = [
    `Session:   ${detail.sessionId}`,
    `Command:   ${detail.command}`,
    `Status:    ${detail.exitStatus}`,
    `Scenario:  ${detail.scenarioId ?? "(none)"}`,
    `Started:   ${detail.startedAt}`,
    `Finished:  ${detail.completedAt ?? "(in progress)"}`,
    "Args:",
    `  ${renderJson(detail.argsPayload).replace(/\n/g, "\n  ")}`,
  ];
  if (detail.resultSummary !== null && detail.resultSummary !== undefined) {
    lines.push("Result:");
    lines.push(`  ${renderJson(detail.resultSummary).replace(/\n/g, "\n  ")}`);
  } else {
    lines.push("Result:    (none)");
  }
  return lines.join("\n");
};

/* ------------------------------------------------------------------ */
/*  Result-summary builders (per command)                             */
/* ------------------------------------------------------------------ */

interface EvaluateGroupLike {
  readonly results: ReadonlyArray<{
    readonly eligible: boolean;
    readonly warnings: readonly string[];
  }>;
}

export interface EvaluateAuditSummaryInput {
  readonly groups: readonly EvaluateGroupLike[];
  readonly persistedScenarioId?: string;
}

export interface EvaluateAuditSummary {
  readonly phase: "success";
  readonly eligibleCount: number;
  readonly ineligibleCount: number;
  readonly warningsCount: number;
  readonly totalResults: number;
  readonly variantCount: number;
  readonly persistedScenarioId: string | null;
}

/**
 * Reduces `evaluateAll` output to a compact audit summary: counts of
 * eligible / ineligible results, aggregate warnings count, number of
 * variants evaluated, and an optional back-reference to the saved-scenario
 * row written in the same invocation.
 */
export const buildEvaluateAuditSummary = (
  input: EvaluateAuditSummaryInput,
): EvaluateAuditSummary => {
  let eligibleCount = 0;
  let ineligibleCount = 0;
  let warningsCount = 0;
  let totalResults = 0;
  for (const group of input.groups) {
    for (const result of group.results) {
      totalResults += 1;
      if (result.eligible) eligibleCount += 1;
      else ineligibleCount += 1;
      warningsCount += result.warnings.length;
    }
  }
  return {
    phase: "success",
    eligibleCount,
    ineligibleCount,
    warningsCount,
    totalResults,
    variantCount: input.groups.length,
    persistedScenarioId: input.persistedScenarioId ?? null,
  };
};

interface GridSummaryLike {
  readonly totalCells: number;
  readonly passCount: number;
  readonly failCount: number;
  readonly warnCount: number;
  readonly partialCount: number;
  readonly errorCount: number;
}

export interface CompareAuditSummary {
  readonly phase: "success";
  readonly totalCells: number;
  readonly passCount: number;
  readonly failCount: number;
  readonly warnCount: number;
  readonly partialCount: number;
  readonly errorCount: number;
  readonly persistedComparisonId: string | null;
  readonly scenarioId: string | null;
}

/**
 * Reduces a `GridSummary` to the audit shape, threading through any
 * persisted comparison id and source scenarioId so downstream tooling can
 * reconstruct the full lineage without a join.
 */
export const buildCompareAuditSummary = (
  summary: GridSummaryLike,
  persistedComparisonId?: string,
  scenarioId?: string,
): CompareAuditSummary => ({
  phase: "success",
  totalCells: summary.totalCells,
  passCount: summary.passCount,
  failCount: summary.failCount,
  warnCount: summary.warnCount,
  partialCount: summary.partialCount,
  errorCount: summary.errorCount,
  persistedComparisonId: persistedComparisonId ?? null,
  scenarioId: scenarioId ?? null,
});

interface SimulationReportLike {
  readonly statesExplored: number;
  readonly terminated: "complete" | "limit" | "timeout";
  readonly perProductFixes: readonly unknown[];
  readonly bestStates: readonly unknown[];
}

export interface SimulateAuditSummary {
  readonly phase: "success";
  readonly statesExplored: number;
  readonly terminated: "complete" | "limit" | "timeout";
  readonly perProductFixesCount: number;
  readonly bestStatesCount: number;
  readonly persistedSimulationId: string | null;
  readonly scenarioId: string | null;
}

/**
 * Reduces a `SimulationReport` to the audit shape. `perProductFixesCount` and
 * `bestStatesCount` are preferred over the full payloads so the audit row
 * stays small while preserving enough signal to triage regressions.
 */
export const buildSimulateAuditSummary = (
  report: SimulationReportLike,
  persistedSimulationId?: string,
  scenarioId?: string,
): SimulateAuditSummary => ({
  phase: "success",
  statesExplored: report.statesExplored,
  terminated: report.terminated,
  perProductFixesCount: report.perProductFixes.length,
  bestStatesCount: report.bestStates.length,
  persistedSimulationId: persistedSimulationId ?? null,
  scenarioId: scenarioId ?? null,
});

/* ------------------------------------------------------------------ */
/*  Error summary                                                     */
/* ------------------------------------------------------------------ */

export type AuditErrorPhase = "evaluation" | "persistence";

export interface AuditErrorSummary {
  readonly phase: AuditErrorPhase;
  readonly message: string;
  readonly errorName: string;
}

/**
 * Converts a thrown error into the error-branch audit summary. The `phase`
 * field distinguishes evaluation-path failures from persistence-path
 * failures; callers supply the phase based on where the throw originated.
 * `errorName` preserves the subclass (e.g. `CliValidationError`) so the
 * audit row surfaces the same error taxonomy as the CLI output.
 */
export const buildAuditErrorSummary = (phase: AuditErrorPhase, err: unknown): AuditErrorSummary => {
  if (err instanceof Error) {
    return { phase, message: err.message, errorName: err.name };
  }
  return { phase, message: String(err), errorName: "UnknownError" };
};
