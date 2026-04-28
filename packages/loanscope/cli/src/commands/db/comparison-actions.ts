import type { DatabaseManager, SavedComparisonRecord } from "@loanscope/db";
import { CliValidationError } from "../../cli-error";
import { renderJson } from "../../output";

import type { ActionOutputFormat } from "../../output";

/* ------------------------------------------------------------------ */
/*  Require helper (exported for reuse by diff and other commands)   */
/* ------------------------------------------------------------------ */

export const requireComparison = (
  manager: DatabaseManager,
  comparisonId: string,
): SavedComparisonRecord => {
  const found = manager.comparisons.findById(comparisonId);
  if (!found) {
    throw new CliValidationError(`Unknown saved comparison: "${comparisonId}".`);
  }
  return found;
};

/* ------------------------------------------------------------------ */
/*  Comparison management actions (list/show/rename/delete)           */
/* ------------------------------------------------------------------ */

export interface ListComparisonsInput {
  readonly output: ActionOutputFormat;
}

export const listComparisonsAction = (
  manager: DatabaseManager,
  input: ListComparisonsInput,
): string => {
  const all = manager.comparisons.findAll();
  if (input.output === "json") {
    return JSON.stringify(
      all.map((c) => ({
        comparisonId: c.comparisonId,
        name: c.name,
        scenarioId: c.scenarioId,
        hasResult: c.resultPayload !== null,
        createdAt: c.createdAt,
      })),
      null,
      2,
    );
  }
  if (all.length === 0) {
    return "No saved comparisons.";
  }
  const lines: string[] = [];
  for (const c of all) {
    const resultTag = c.resultPayload !== null ? " [evaluated]" : "";
    lines.push(`${c.comparisonId} — ${c.name}${resultTag}`);
    if (c.scenarioId !== null) {
      lines.push(`  Scenario: ${c.scenarioId}`);
    }
    lines.push(`  Created: ${c.createdAt}`);
  }
  return lines.join("\n");
};

export interface ShowComparisonInput {
  readonly comparisonId: string;
  readonly output: ActionOutputFormat;
}

export interface ComparisonMetadata {
  readonly comparisonId: string;
  readonly name: string;
  readonly scenarioId: string | null;
  readonly hasResult: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ComparisonFullJson extends ComparisonMetadata {
  readonly config: unknown;
  readonly result: unknown | null;
}

export const showComparisonAction = (
  manager: DatabaseManager,
  input: ShowComparisonInput,
): string => {
  const record = requireComparison(manager, input.comparisonId);
  const metadata: ComparisonMetadata = {
    comparisonId: record.comparisonId,
    name: record.name,
    scenarioId: record.scenarioId,
    hasResult: record.resultPayload !== null,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };

  if (input.output === "json") {
    const payload: ComparisonFullJson = {
      ...metadata,
      config: record.configPayload,
      result: record.resultPayload,
    };
    return renderJson(payload);
  }

  const lines = [
    `${metadata.comparisonId} — ${metadata.name}`,
    metadata.scenarioId !== null ? `  Scenario: ${metadata.scenarioId}` : null,
    `  Created: ${metadata.createdAt}`,
    `  Updated: ${metadata.updatedAt}`,
    `  Result:  ${metadata.hasResult ? "present" : "none"}`,
  ].filter((line): line is string => line !== null);
  return lines.join("\n");
};

export interface RenameComparisonInput {
  readonly comparisonId: string;
  readonly name: string;
}

export const renameComparisonAction = (
  manager: DatabaseManager,
  input: RenameComparisonInput,
): string => {
  const trimmedName = input.name.trim();
  if (trimmedName.length === 0) {
    throw new CliValidationError("Invalid comparison name: value must not be empty.");
  }
  requireComparison(manager, input.comparisonId);
  manager.comparisons.updateName(input.comparisonId, trimmedName);
  return `Renamed comparison "${input.comparisonId}" to "${trimmedName}".`;
};

export interface DeleteComparisonInput {
  readonly comparisonId: string;
}

export const deleteComparisonAction = (
  manager: DatabaseManager,
  input: DeleteComparisonInput,
): string => {
  requireComparison(manager, input.comparisonId);
  manager.comparisons.delete(input.comparisonId);
  return `Deleted comparison "${input.comparisonId}".`;
};
