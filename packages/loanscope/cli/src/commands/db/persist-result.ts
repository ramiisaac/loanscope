import { parseConfig } from "@loanscope/config";
import type { DatabaseManager } from "@loanscope/db";
import { quickQuoteToTransaction, transactionToQuickQuote } from "@loanscope/engine";
import type { Transaction } from "@loanscope/domain";
import { buildId } from "../../ids";
import { CliValidationError } from "../../cli-error";
import { requireScenario } from "./scenario-actions";
/* ------------------------------------------------------------------ */
/*  load-scenario-from-db (for evaluate/compare/simulate --from-db)    */
/* ------------------------------------------------------------------ */

export interface LoadFromDbResult {
  readonly transaction: Transaction;
  readonly scenarioId: string;
  readonly configPayload: unknown;
}

/**
 * Reads a saved scenario row, re-parses its stored `configPayload` through
 * `parseConfig`, and returns a ready-to-evaluate `Transaction`. Falls back to
 * `quickQuoteToTransaction` when only a quickQuote is stored. Used by the
 * `--from-db` path on `evaluate`, `compare`, and `simulate`.
 */
export const loadScenarioFromDb = (
  manager: DatabaseManager,
  scenarioId: string,
): LoadFromDbResult => {
  const record = requireScenario(manager, scenarioId);
  const parsed = parseConfig(record.configPayload);

  let transaction: Transaction;
  if (parsed.transaction) {
    transaction = parsed.transaction;
  } else if (parsed.quickQuote) {
    transaction = quickQuoteToTransaction(parsed.quickQuote);
  } else {
    throw new CliValidationError(
      `Saved scenario "${scenarioId}" has no transaction or quickQuote payload.`,
    );
  }

  return {
    transaction,
    scenarioId: record.scenarioId,
    configPayload: record.configPayload,
  };
};

/**
 * Builds a schema-re-parseable `{ quickQuote: … }` config payload from an
 * in-memory `Transaction`. Used by `evaluate --save --interactive` so the
 * durable payload can be re-loaded via `parseConfig` the same way a
 * YAML-sourced payload can.
 */
export const buildQuickQuoteConfigPayloadFromTransaction = (transaction: Transaction): unknown => ({
  quickQuote: transactionToQuickQuote(transaction),
});

/* ------------------------------------------------------------------ */
/*  persist-scenario-result (for evaluate --save)                     */
/* ------------------------------------------------------------------ */

export interface PersistScenarioResultInput {
  readonly name?: string;
  readonly id?: string;
  readonly description?: string;
  readonly configPayload: unknown;
  readonly resultPayload: unknown;
  readonly existingScenarioId?: string;
  readonly now?: Date;
}

export interface PersistScenarioResultOutput {
  readonly scenarioId: string;
  readonly created: boolean;
}

/**
 * Writes an evaluation result to the saved-scenario table. When
 * `existingScenarioId` is provided (typically from `--from-db`), updates the
 * existing row's `resultPayload`. Otherwise creates a new row and then
 * attaches the result.
 */
export const persistScenarioResult = (
  manager: DatabaseManager,
  input: PersistScenarioResultInput,
): PersistScenarioResultOutput => {
  if (input.existingScenarioId !== undefined) {
    requireScenario(manager, input.existingScenarioId);
    manager.scenarios.updateResult(input.existingScenarioId, input.resultPayload);
    return { scenarioId: input.existingScenarioId, created: false };
  }

  if (input.name === undefined) {
    throw new CliValidationError(
      "Cannot persist scenario result: --save requires a name when no existing scenario id is provided.",
    );
  }
  const trimmedName = input.name.trim();
  if (trimmedName.length === 0) {
    throw new CliValidationError("Invalid scenario name: value must not be empty.");
  }

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
        configPayload: input.configPayload,
      });
      manager.scenarioVersions.append({
        scenarioId,
        version: 1,
        configPayload: input.configPayload,
        changeKind: "create",
        ...(input.description !== undefined ? { changeNote: input.description } : {}),
      });
      manager.scenarios.updateResult(scenarioId, input.resultPayload);
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new CliValidationError(`Failed to save scenario "${scenarioId}": ${message}`);
  }

  return { scenarioId, created: true };
};

/* ------------------------------------------------------------------ */
/*  persist-comparison-result (for compare --save)                    */
/* ------------------------------------------------------------------ */

export interface PersistComparisonResultInput {
  readonly name: string;
  readonly id?: string;
  readonly scenarioId?: string;
  readonly configPayload: unknown;
  readonly resultPayload: unknown;
  readonly now?: Date;
}

export interface PersistComparisonResultOutput {
  readonly comparisonId: string;
}

/**
 * Creates a saved-comparison row and attaches the grid result. Links the
 * optional `scenarioId` FK when `--from-db` was used.
 */
export const persistComparisonResult = (
  manager: DatabaseManager,
  input: PersistComparisonResultInput,
): PersistComparisonResultOutput => {
  const trimmedName = input.name.trim();
  if (trimmedName.length === 0) {
    throw new CliValidationError("Invalid comparison name: value must not be empty.");
  }

  const comparisonId = buildId(input.id, trimmedName, {
    ...(input.now !== undefined ? { now: input.now } : {}),
    fallback: "comparison",
  });

  try {
    manager.comparisons.create({
      comparisonId,
      name: trimmedName,
      ...(input.scenarioId !== undefined ? { scenarioId: input.scenarioId } : {}),
      configPayload: input.configPayload,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new CliValidationError(`Failed to save comparison "${comparisonId}": ${message}`);
  }

  manager.comparisons.updateResult(comparisonId, input.resultPayload);
  return { comparisonId };
};

/* ------------------------------------------------------------------ */
/*  persist-simulation-result (for simulate --save)                   */
/* ------------------------------------------------------------------ */

export interface PersistSimulationResultInput {
  readonly name: string;
  readonly id?: string;
  readonly scenarioId?: string;
  readonly configPayload: unknown;
  readonly resultPayload: unknown;
  readonly now?: Date;
}

export interface PersistSimulationResultOutput {
  readonly simulationId: string;
}

/**
 * Creates a saved-simulation row and attaches the simulation report. Links
 * the optional `scenarioId` FK when `--from-db` was used.
 */
export const persistSimulationResult = (
  manager: DatabaseManager,
  input: PersistSimulationResultInput,
): PersistSimulationResultOutput => {
  const trimmedName = input.name.trim();
  if (trimmedName.length === 0) {
    throw new CliValidationError("Invalid simulation name: value must not be empty.");
  }

  const simulationId = buildId(input.id, trimmedName, {
    ...(input.now !== undefined ? { now: input.now } : {}),
    fallback: "simulation",
  });

  try {
    manager.simulations.create({
      simulationId,
      name: trimmedName,
      ...(input.scenarioId !== undefined ? { scenarioId: input.scenarioId } : {}),
      configPayload: input.configPayload,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new CliValidationError(`Failed to save simulation "${simulationId}": ${message}`);
  }

  manager.simulations.updateResult(simulationId, input.resultPayload);
  return { simulationId };
};
