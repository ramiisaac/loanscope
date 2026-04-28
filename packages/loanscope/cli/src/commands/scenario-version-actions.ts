import { loadYamlFile, parseConfig, dumpYaml } from "@loanscope/config";
import type { DatabaseManager, ScenarioVersionRecord } from "@loanscope/db";
import { CliValidationError } from "../cli-error";
import type { ScenarioPayloadFormat } from "../format-parsers";
import { requireScenario } from "./db";

import { renderJson } from "../output";

import type { ActionOutputFormat } from "../output";

/* ------------------------------------------------------------------ */
/*  require helper                                                     */
/* ------------------------------------------------------------------ */

export const requireScenarioVersion = (
  manager: DatabaseManager,
  scenarioId: string,
  version: number,
): ScenarioVersionRecord => {
  const found = manager.scenarioVersions.findVersion(scenarioId, version);
  if (!found) {
    throw new CliValidationError(`Unknown scenario version: "${scenarioId}" v${version}.`);
  }
  return found;
};

const parseVersionNumber = (raw: string): number => {
  const trimmed = raw.trim().replace(/^v/i, "");
  const n = Number(trimmed);
  if (!Number.isInteger(n) || n <= 0) {
    throw new CliValidationError(`Invalid version number: "${raw}". Must be a positive integer.`);
  }
  return n;
};

/* ------------------------------------------------------------------ */
/*  update-scenario                                                    */
/* ------------------------------------------------------------------ */

export interface UpdateScenarioInput {
  readonly scenarioId: string;
  readonly configPath: string;
  readonly note?: string;
}

export interface UpdateScenarioResult {
  readonly scenarioId: string;
  readonly version: number;
}

export const updateScenarioAction = (
  manager: DatabaseManager,
  input: UpdateScenarioInput,
): UpdateScenarioResult => {
  requireScenario(manager, input.scenarioId);

  const raw = loadYamlFile(input.configPath);
  parseConfig(raw);

  const latest = manager.scenarioVersions.getLatestVersion(input.scenarioId);
  const nextVersion = (latest?.version ?? 0) + 1;

  try {
    manager.db.transaction(() => {
      manager.scenarios.updateConfig(input.scenarioId, raw);
      manager.scenarioVersions.append({
        scenarioId: input.scenarioId,
        version: nextVersion,
        configPayload: raw,
        changeKind: "update",
        ...(input.note !== undefined ? { changeNote: input.note } : {}),
      });
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new CliValidationError(`Failed to update scenario "${input.scenarioId}": ${message}`);
  }

  return { scenarioId: input.scenarioId, version: nextVersion };
};

/* ------------------------------------------------------------------ */
/*  scenario-history                                                   */
/* ------------------------------------------------------------------ */

export interface ScenarioHistoryInput {
  readonly scenarioId: string;
  readonly output: ActionOutputFormat;
}

interface ScenarioHistoryEntry {
  readonly version: number;
  readonly changeKind: ScenarioVersionRecord["changeKind"];
  readonly changeNote: string | null;
  readonly restoredFromVersion: number | null;
  readonly createdAt: string;
}

const toHistoryEntry = (record: ScenarioVersionRecord): ScenarioHistoryEntry => ({
  version: record.version,
  changeKind: record.changeKind,
  changeNote: record.changeNote,
  restoredFromVersion: record.restoredFromVersion,
  createdAt: record.createdAt,
});

export const scenarioHistoryAction = (
  manager: DatabaseManager,
  input: ScenarioHistoryInput,
): string => {
  requireScenario(manager, input.scenarioId);
  const history = manager.scenarioVersions.findHistory(input.scenarioId);

  if (input.output === "json") {
    return renderJson(history.map(toHistoryEntry));
  }
  if (history.length === 0) {
    return `No version history for scenario "${input.scenarioId}".`;
  }
  const lines: string[] = [`Scenario: ${input.scenarioId}`];
  for (const record of history) {
    const noteSuffix = record.changeNote !== null ? ` — ${record.changeNote}` : "";
    const restoredSuffix =
      record.restoredFromVersion !== null ? ` (restored from v${record.restoredFromVersion})` : "";
    lines.push(
      `  v${record.version} [${record.changeKind}]${restoredSuffix} ${record.createdAt}${noteSuffix}`,
    );
  }
  return lines.join("\n");
};

/* ------------------------------------------------------------------ */
/*  show-scenario-version                                              */
/* ------------------------------------------------------------------ */

export interface ShowScenarioVersionInput {
  readonly scenarioId: string;
  readonly version: number | string;
  readonly format: ScenarioPayloadFormat;
}

export const showScenarioVersionAction = (
  manager: DatabaseManager,
  input: ShowScenarioVersionInput,
): string => {
  const versionNumber =
    typeof input.version === "number" ? input.version : parseVersionNumber(input.version);

  requireScenario(manager, input.scenarioId);
  const record = requireScenarioVersion(manager, input.scenarioId, versionNumber);

  if (input.format === "json") {
    return renderJson(record.configPayload);
  }
  return dumpYaml(record.configPayload);
};

/* ------------------------------------------------------------------ */
/*  restore-scenario-version                                           */
/* ------------------------------------------------------------------ */

export interface RestoreScenarioVersionInput {
  readonly scenarioId: string;
  readonly version: number | string;
  readonly note?: string;
}

export interface RestoreScenarioVersionResult {
  readonly scenarioId: string;
  readonly newVersion: number;
  readonly restoredFromVersion: number;
}

export const restoreScenarioVersionAction = (
  manager: DatabaseManager,
  input: RestoreScenarioVersionInput,
): RestoreScenarioVersionResult => {
  const sourceVersion =
    typeof input.version === "number" ? input.version : parseVersionNumber(input.version);

  requireScenario(manager, input.scenarioId);
  const source = requireScenarioVersion(manager, input.scenarioId, sourceVersion);

  const latest = manager.scenarioVersions.getLatestVersion(input.scenarioId);
  if (latest && latest.version === sourceVersion) {
    throw new CliValidationError(
      `Cannot restore scenario "${input.scenarioId}" to v${sourceVersion}: that version is already the latest.`,
    );
  }
  const nextVersion = (latest?.version ?? 0) + 1;

  try {
    manager.db.transaction(() => {
      manager.scenarios.updateConfig(input.scenarioId, source.configPayload);
      manager.scenarioVersions.append({
        scenarioId: input.scenarioId,
        version: nextVersion,
        configPayload: source.configPayload,
        changeKind: "restore",
        restoredFromVersion: sourceVersion,
        ...(input.note !== undefined ? { changeNote: input.note } : {}),
      });
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new CliValidationError(
      `Failed to restore scenario "${input.scenarioId}" to v${sourceVersion}: ${message}`,
    );
  }

  return {
    scenarioId: input.scenarioId,
    newVersion: nextVersion,
    restoredFromVersion: sourceVersion,
  };
};
