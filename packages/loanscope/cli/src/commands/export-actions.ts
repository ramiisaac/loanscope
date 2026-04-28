import fs from "node:fs";
import { dumpYaml, loadYamlFile, parseConfig, type ConfigParseResult } from "@loanscope/config";
import type { DatabaseManager } from "@loanscope/db";
import type { Transaction } from "@loanscope/domain";
import { quickQuoteToTransaction } from "@loanscope/engine";
import { renderJson } from "../output";

import { CliValidationError } from "../cli-error";
import { findDefaultScenario } from "../config-loaders";
import type { ScenarioPayloadFormat } from "../format-parsers";
import { applyScenarioOverrides, type ScenarioOverrideOptions } from "./scenario-overrides";
import { buildQuickQuoteConfigPayloadFromTransaction, loadScenarioFromDb } from "./db";

/**
 * Discriminated source describing where the starting scenario payload
 * originates. `default` falls back to the repo's default-scenario YAML via
 * `findDefaultScenario`, matching the ergonomics of `evaluate` when neither
 * `--config` nor `--from-db` is supplied.
 */
export type ExportScenarioSource =
  | {
      readonly kind: "db";
      readonly manager: DatabaseManager;
      readonly scenarioId: string;
    }
  | { readonly kind: "config"; readonly filePath: string }
  | { readonly kind: "default" };

export type ExportScenarioShape = "transaction" | "quickQuote";

export interface ExportScenarioInput {
  readonly source: ExportScenarioSource;
  readonly overrides: ScenarioOverrideOptions;
  readonly format: ScenarioPayloadFormat;
  readonly outPath?: string;
}

export interface ExportScenarioOutput {
  readonly rendered: string;
  readonly outPath: string | null;
  readonly shape: ExportScenarioShape;
}

/**
 * Loads a starting config payload and its parsed view from the requested
 * source. The raw payload is used only to detect the authored shape
 * (transaction vs quickQuote); the normalized `parsed` view provides the
 * `Transaction` we apply overrides to.
 */
const loadSource = (
  source: ExportScenarioSource,
): { readonly parsed: ConfigParseResult; readonly rawPayload: unknown } => {
  if (source.kind === "db") {
    const loaded = loadScenarioFromDb(source.manager, source.scenarioId);
    const parsed = parseConfig(loaded.configPayload);
    return { parsed, rawPayload: loaded.configPayload };
  }

  const filePath = source.kind === "config" ? source.filePath : findDefaultScenario();
  const rawPayload = loadYamlFile(filePath);
  const parsed = parseConfig(rawPayload);
  return { parsed, rawPayload };
};

/**
 * Returns the `Transaction` implied by a parsed config, preferring the
 * transaction shape when both are present. Mirrors `loadScenarioFromDb`'s
 * resolution order so exports and evaluations stay in sync.
 */
const resolveBaseTransaction = (parsed: ConfigParseResult, label: string): Transaction => {
  if (parsed.transaction) return parsed.transaction;
  if (parsed.quickQuote) {
    return quickQuoteToTransaction(parsed.quickQuote);
  }
  throw new CliValidationError(`${label} has no transaction or quickQuote payload to export.`);
};

/**
 * Detects the authored shape by inspecting the raw payload's top-level keys.
 * A payload is treated as transaction-shaped if it carries a `transaction`
 * field; otherwise, if it carries a `quickQuote` field, it is quick-quote
 * shaped. Anything else is rejected at the `resolveBaseTransaction` stage.
 *
 * We detect on the raw payload (not the parsed result) because the user's
 * authoring shape is the contract we must preserve on round-trip — a file
 * that carries both shapes must still emit transaction shape, which matches
 * `resolveBaseTransaction`.
 */
const detectShape = (rawPayload: unknown): ExportScenarioShape => {
  if (
    rawPayload !== null &&
    typeof rawPayload === "object" &&
    "transaction" in rawPayload &&
    (rawPayload as { transaction?: unknown }).transaction !== undefined
  ) {
    return "transaction";
  }
  return "quickQuote";
};

/**
 * Serializes a post-override transaction back into a re-parseable config
 * payload matching the authored shape. Transaction shape embeds the full
 * normalized `Transaction` under the `transaction:` key (branded numeric
 * primitives serialize cleanly through `dumpYaml` / `JSON.stringify`).
 * Quick-quote shape uses `buildQuickQuoteConfigPayloadFromTransaction` so
 * the exported file re-loads through `parseConfig` with `parsed.quickQuote`
 * populated.
 */
const buildPayload = (transaction: Transaction, shape: ExportScenarioShape): unknown => {
  if (shape === "transaction") {
    return { transaction };
  }
  return buildQuickQuoteConfigPayloadFromTransaction(transaction);
};

const renderPayload = (payload: unknown, format: ScenarioPayloadFormat): string => {
  if (format === "json") {
    return renderJson(payload);
  }
  return dumpYaml(payload);
};

/**
 * Loads a scenario from the requested source, applies CLI overrides, and
 * re-serializes the result as a re-parseable config payload. When `outPath`
 * is supplied, the rendered string is written to disk and the resolved path
 * is returned; collisions with an existing file are rejected so a stray
 * invocation cannot silently overwrite authored YAML.
 */
export const exportScenarioAction = (input: ExportScenarioInput): ExportScenarioOutput => {
  const label =
    input.source.kind === "db"
      ? `Saved scenario "${input.source.scenarioId}"`
      : input.source.kind === "config"
        ? `Config file at ${input.source.filePath}`
        : "Default scenario";

  const { parsed, rawPayload } = loadSource(input.source);
  const baseTransaction = resolveBaseTransaction(parsed, label);
  const transaction = applyScenarioOverrides(baseTransaction, input.overrides);
  const shape = detectShape(rawPayload);
  const payload = buildPayload(transaction, shape);
  const rendered = renderPayload(payload, input.format);

  if (input.outPath !== undefined) {
    if (fs.existsSync(input.outPath)) {
      throw new CliValidationError(`Refusing to overwrite existing file: ${input.outPath}`);
    }
    fs.writeFileSync(input.outPath, rendered, "utf8");
    return { rendered, outPath: input.outPath, shape };
  }

  return { rendered, outPath: null, shape };
};
