import { loadYamlFile, parseConfig, dumpYaml } from "@loanscope/config";
import type { DatabaseManager, SavedScenarioRecord } from "@loanscope/db";
import { buildId } from "../../ids";
import { CliValidationError } from "../../cli-error";
import type { ScenarioPayloadFormat } from "../../format-parsers";
import { renderJson } from "../../output";

import type { ActionOutputFormat } from "../../output";

/* ------------------------------------------------------------------ */
/*  Require helper (exported for reuse by diff and other commands)   */
/* ------------------------------------------------------------------ */

export const requireScenario = (
  manager: DatabaseManager,
  scenarioId: string,
): SavedScenarioRecord => {
  const found = manager.scenarios.findById(scenarioId);
  if (!found) {
    throw new CliValidationError(`Unknown saved scenario: "${scenarioId}".`);
  }
  return found;
};

/* ------------------------------------------------------------------ */
/*  save-scenario                                                      */
/* ------------------------------------------------------------------ */

export interface SaveScenarioInput {
  readonly configPath: string;
  readonly name: string;
  readonly description?: string;
  readonly id?: string;
  readonly now?: Date;
}

export interface SaveScenarioResult {
  readonly scenarioId: string;
  readonly name: string;
}

/**
 * Loads and validates a YAML config file, then persists the raw parsed object
 * as the scenario's `configPayload`. Validation runs at the boundary so we
 * never persist a payload that cannot be re-evaluated; the raw YAML object
 * (not the normalized domain `Transaction`) is the durable contract.
 */
export const saveScenarioAction = (
  manager: DatabaseManager,
  input: SaveScenarioInput,
): SaveScenarioResult => {
  const trimmedName = input.name.trim();
  if (trimmedName.length === 0) {
    throw new CliValidationError("Invalid scenario name: value must not be empty.");
  }

  const raw = loadYamlFile(input.configPath);
  // Validate at the boundary; a parse failure here surfaces a ConfigError
  // with the field path the user needs to fix.
  parseConfig(raw);

  const scenarioId = buildId(input.id, trimmedName, {
    ...(input.now !== undefined ? { now: input.now } : {}),
    fallback: "scenario",
  });

  try {
    manager.db.transaction(() => {
      manager.scenarios.create({
        scenarioId,
        name: trimmedName,
        ...(input.description !== undefined ? { description: input.description } : {}),
        configPayload: raw,
      });
      manager.scenarioVersions.append({
        scenarioId,
        version: 1,
        configPayload: raw,
        changeKind: "create",
        ...(input.description !== undefined ? { changeNote: input.description } : {}),
      });
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new CliValidationError(`Failed to save scenario "${scenarioId}": ${message}`);
  }

  return { scenarioId, name: trimmedName };
};

/* ------------------------------------------------------------------ */
/*  load-scenario                                                      */
/* ------------------------------------------------------------------ */

export interface LoadScenarioInput {
  readonly scenarioId: string;
  readonly format: ScenarioPayloadFormat;
}

/**
 * Returns the stored `configPayload` rendered as YAML or JSON. The output is
 * re-loadable by `evaluate --config` and round-trips through `parseConfig`.
 */
export const loadScenarioAction = (manager: DatabaseManager, input: LoadScenarioInput): string => {
  const record = requireScenario(manager, input.scenarioId);
  if (input.format === "json") {
    return renderJson(record.configPayload);
  }
  return dumpYaml(record.configPayload);
};

/* ------------------------------------------------------------------ */
/*  show-scenario                                                      */
/* ------------------------------------------------------------------ */

export interface ShowScenarioInput {
  readonly scenarioId: string;
  readonly output: ActionOutputFormat;
}

export interface ScenarioMetadata {
  readonly scenarioId: string;
  readonly name: string;
  readonly description: string | null;
  readonly hasResult: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ScenarioFullJson extends ScenarioMetadata {
  readonly result: unknown | null;
}

/**
 * Returns either a concise human-readable summary (default) or a JSON document
 * containing the full result payload when `json` is true.
 */
export const showScenarioAction = (manager: DatabaseManager, input: ShowScenarioInput): string => {
  const record = requireScenario(manager, input.scenarioId);
  const metadata: ScenarioMetadata = {
    scenarioId: record.scenarioId,
    name: record.name,
    description: record.description,
    hasResult: record.resultPayload !== null,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };

  if (input.output === "json") {
    const payload: ScenarioFullJson = {
      ...metadata,
      result: record.resultPayload,
    };
    return renderJson(payload);
  }

  const lines = [
    `${metadata.scenarioId} — ${metadata.name}`,
    metadata.description !== null ? `  Description: ${metadata.description}` : null,
    `  Created: ${metadata.createdAt}`,
    `  Updated: ${metadata.updatedAt}`,
    `  Result:  ${metadata.hasResult ? "present" : "none"}`,
  ].filter((line): line is string => line !== null);
  return lines.join("\n");
};

/* ------------------------------------------------------------------ */
/*  delete-scenario                                                    */
/* ------------------------------------------------------------------ */

export interface DeleteScenarioInput {
  readonly scenarioId: string;
}

export const deleteScenarioAction = (
  manager: DatabaseManager,
  input: DeleteScenarioInput,
): string => {
  requireScenario(manager, input.scenarioId);
  manager.scenarios.delete(input.scenarioId);
  return `Deleted scenario "${input.scenarioId}".`;
};

/* ------------------------------------------------------------------ */
/*  rename-scenario                                                    */
/* ------------------------------------------------------------------ */

export interface RenameScenarioInput {
  readonly scenarioId: string;
  readonly name: string;
}

export const renameScenarioAction = (
  manager: DatabaseManager,
  input: RenameScenarioInput,
): string => {
  const trimmedName = input.name.trim();
  if (trimmedName.length === 0) {
    throw new CliValidationError("Invalid scenario name: value must not be empty.");
  }
  requireScenario(manager, input.scenarioId);
  manager.scenarios.updateName(input.scenarioId, trimmedName);
  return `Renamed scenario "${input.scenarioId}" to "${trimmedName}".`;
};
