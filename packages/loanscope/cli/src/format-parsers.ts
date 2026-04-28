// Top-level CLI output-format parsers.
//
// Each output flavor is gate-checked at the CLI boundary so downstream
// renderers can rely on a closed, validated string-literal union.

import { CliValidationError } from "./cli-error";

export type CliOutputFormat = "table" | "json" | "csv";

export const parseCliOutputFormat = (raw: string): CliOutputFormat => {
  if (raw === "table" || raw === "json" || raw === "csv") {
    return raw;
  }

  throw new CliValidationError(`Invalid output format: "${raw}". Valid values: table, json, csv`);
};

/**
 * Output format for emitting a stored scenario/comparison/simulation config
 * payload. YAML is the durable contract (re-loadable by `evaluate --config`);
 * JSON is offered for tooling that prefers it.
 */
export type ScenarioPayloadFormat = "yaml" | "json";

export const parseScenarioPayloadFormat = (raw: string): ScenarioPayloadFormat => {
  if (raw === "yaml" || raw === "json") return raw;
  throw new CliValidationError(
    `Invalid scenario output format: "${raw}". Valid values: yaml, json`,
  );
};

/**
 * Session kind targeted by `loanscope diff`. Each kind maps to a distinct
 * persisted record type (`SavedScenarioRecord` / `SavedComparisonRecord` /
 * `SavedSimulationRecord`) and to a dedicated diff action.
 */
export type DiffKind = "scenario" | "comparison" | "simulation";

export const parseDiffKind = (raw: string): DiffKind => {
  if (raw === "scenario" || raw === "comparison" || raw === "simulation") {
    return raw;
  }
  throw new CliValidationError(
    `Invalid diff kind: "${raw}". Valid values: scenario, comparison, simulation`,
  );
};
