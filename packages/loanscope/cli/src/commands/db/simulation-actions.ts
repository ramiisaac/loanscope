import type { DatabaseManager, SavedSimulationRecord } from "@loanscope/db";
import { CliValidationError } from "../../cli-error";
import { renderJson } from "../../output";

import type { ActionOutputFormat } from "../../output";

/* ------------------------------------------------------------------ */
/*  Require helper (exported for reuse by diff and other commands)   */
/* ------------------------------------------------------------------ */

export const requireSimulation = (
  manager: DatabaseManager,
  simulationId: string,
): SavedSimulationRecord => {
  const found = manager.simulations.findById(simulationId);
  if (!found) {
    throw new CliValidationError(`Unknown saved simulation: "${simulationId}".`);
  }
  return found;
};

/* ------------------------------------------------------------------ */
/*  Simulation management actions (list/show/rename/delete)           */
/* ------------------------------------------------------------------ */

export interface ListSimulationsInput {
  readonly output: ActionOutputFormat;
}

export const listSimulationsAction = (
  manager: DatabaseManager,
  input: ListSimulationsInput,
): string => {
  const all = manager.simulations.findAll();
  if (input.output === "json") {
    return JSON.stringify(
      all.map((s) => ({
        simulationId: s.simulationId,
        name: s.name,
        scenarioId: s.scenarioId,
        hasResult: s.resultPayload !== null,
        createdAt: s.createdAt,
      })),
      null,
      2,
    );
  }
  if (all.length === 0) {
    return "No saved simulations.";
  }
  const lines: string[] = [];
  for (const s of all) {
    const resultTag = s.resultPayload !== null ? " [evaluated]" : "";
    lines.push(`${s.simulationId} — ${s.name}${resultTag}`);
    if (s.scenarioId !== null) {
      lines.push(`  Scenario: ${s.scenarioId}`);
    }
    lines.push(`  Created: ${s.createdAt}`);
  }
  return lines.join("\n");
};

export interface ShowSimulationInput {
  readonly simulationId: string;
  readonly output: ActionOutputFormat;
}

export interface SimulationMetadata {
  readonly simulationId: string;
  readonly name: string;
  readonly scenarioId: string | null;
  readonly hasResult: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface SimulationFullJson extends SimulationMetadata {
  readonly config: unknown;
  readonly result: unknown | null;
}

export const showSimulationAction = (
  manager: DatabaseManager,
  input: ShowSimulationInput,
): string => {
  const record = requireSimulation(manager, input.simulationId);
  const metadata: SimulationMetadata = {
    simulationId: record.simulationId,
    name: record.name,
    scenarioId: record.scenarioId,
    hasResult: record.resultPayload !== null,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };

  if (input.output === "json") {
    const payload: SimulationFullJson = {
      ...metadata,
      config: record.configPayload,
      result: record.resultPayload,
    };
    return renderJson(payload);
  }

  const lines = [
    `${metadata.simulationId} — ${metadata.name}`,
    metadata.scenarioId !== null ? `  Scenario: ${metadata.scenarioId}` : null,
    `  Created: ${metadata.createdAt}`,
    `  Updated: ${metadata.updatedAt}`,
    `  Result:  ${metadata.hasResult ? "present" : "none"}`,
  ].filter((line): line is string => line !== null);
  return lines.join("\n");
};

export interface RenameSimulationInput {
  readonly simulationId: string;
  readonly name: string;
}

export const renameSimulationAction = (
  manager: DatabaseManager,
  input: RenameSimulationInput,
): string => {
  const trimmedName = input.name.trim();
  if (trimmedName.length === 0) {
    throw new CliValidationError("Invalid simulation name: value must not be empty.");
  }
  requireSimulation(manager, input.simulationId);
  manager.simulations.updateName(input.simulationId, trimmedName);
  return `Renamed simulation "${input.simulationId}" to "${trimmedName}".`;
};

export interface DeleteSimulationInput {
  readonly simulationId: string;
}

export const deleteSimulationAction = (
  manager: DatabaseManager,
  input: DeleteSimulationInput,
): string => {
  requireSimulation(manager, input.simulationId);
  manager.simulations.delete(input.simulationId);
  return `Deleted simulation "${input.simulationId}".`;
};
