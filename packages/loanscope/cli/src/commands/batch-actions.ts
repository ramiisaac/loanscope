import fs from "node:fs";
import { evaluateAll } from "@loanscope/engine";
import { loadConfigFile } from "@loanscope/config";
import type { ProductSourceSelection, Transaction } from "@loanscope/domain";
import { CliValidationError } from "../cli-error";
import { loadTransaction } from "../config-loaders";
import { applyScenarioOverrides, type ScenarioOverrideOptions } from "./scenario-overrides";
import { selectProductsForTransaction } from "./select-products";

import { renderJson } from "../output";

/**
 * Per-scenario summary captured by {@link runBatchAction}. Mirrors the shape
 * emitted by `buildEvaluateAuditSummary` (eligible / ineligible / warnings /
 * variantCount / totalResults) so downstream tooling can reuse the same
 * reduction across the audit and batch surfaces without a translator.
 */
export interface BatchScenarioResult {
  readonly path: string;
  readonly eligibleCount: number;
  readonly ineligibleCount: number;
  readonly warningsCount: number;
  readonly totalResults: number;
  readonly variantCount: number;
}

/**
 * Aggregate totals across all scenarios in a single batch run. `scenarioCount`
 * is the number of successfully evaluated scenarios; in v1 (fail-fast) this
 * always equals `scenarios.length` in the enclosing {@link BatchReport}.
 */
export interface BatchAggregate {
  readonly scenarioCount: number;
  readonly eligibleCount: number;
  readonly ineligibleCount: number;
  readonly warningsCount: number;
  readonly totalResults: number;
  readonly variantCount: number;
}

export interface BatchReport {
  readonly scenarios: readonly BatchScenarioResult[];
  readonly aggregate: BatchAggregate;
}

/**
 * Product-selection flags applied uniformly to every scenario in a batch.
 * Narrower than the full CLI flag surface — v1 does not expose `--lenders`
 * since batch is scoped to the evaluate pipeline.
 */
export interface BatchProductSelectionFlags {
  readonly lender?: string;
  readonly products?: string;
  readonly productSource?: string;
}

export interface BatchInput {
  readonly paths: readonly string[];
  readonly overrides: ScenarioOverrideOptions;
  readonly selection: BatchProductSelectionFlags;
}

/**
 * Reads a newline-separated list of scenario paths. Whitespace is trimmed,
 * empty lines are skipped, and `#`-prefixed lines are treated as comments.
 * The file itself must exist; missing files raise {@link CliValidationError}
 * with the offending path so the batch fail-fast contract can surface it
 * uniformly with per-scenario load failures.
 */
export const readBatchList = (listPath: string): readonly string[] => {
  if (!fs.existsSync(listPath)) {
    throw new CliValidationError(`Batch list file not found: "${listPath}".`);
  }
  const raw = fs.readFileSync(listPath, "utf8");
  const lines = raw.split(/\r?\n/);
  const out: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "") continue;
    if (trimmed.startsWith("#")) continue;
    out.push(trimmed);
  }
  return out;
};

interface EvaluateGroupLike {
  readonly results: ReadonlyArray<{
    readonly eligible: boolean;
    readonly warnings: readonly string[];
  }>;
}

const reduceGroups = (path: string, groups: readonly EvaluateGroupLike[]): BatchScenarioResult => {
  let eligibleCount = 0;
  let ineligibleCount = 0;
  let warningsCount = 0;
  let totalResults = 0;
  for (const group of groups) {
    for (const result of group.results) {
      totalResults += 1;
      if (result.eligible) eligibleCount += 1;
      else ineligibleCount += 1;
      warningsCount += result.warnings.length;
    }
  }
  return {
    path,
    eligibleCount,
    ineligibleCount,
    warningsCount,
    totalResults,
    variantCount: groups.length,
  };
};

const aggregate = (scenarios: readonly BatchScenarioResult[]): BatchAggregate => {
  let eligibleCount = 0;
  let ineligibleCount = 0;
  let warningsCount = 0;
  let totalResults = 0;
  let variantCount = 0;
  for (const s of scenarios) {
    eligibleCount += s.eligibleCount;
    ineligibleCount += s.ineligibleCount;
    warningsCount += s.warningsCount;
    totalResults += s.totalResults;
    variantCount += s.variantCount;
  }
  return {
    scenarioCount: scenarios.length,
    eligibleCount,
    ineligibleCount,
    warningsCount,
    totalResults,
    variantCount,
  };
};

/**
 * Evaluates every scenario in {@link BatchInput.paths} sequentially and
 * returns a reduced {@link BatchReport}. Execution is strictly serial in v1
 * to preserve deterministic command output; the fail-fast contract is enforced
 * by letting any load/evaluate throw propagate with the
 * offending path prefixed to the message.
 *
 * Overrides and product-selection flags are applied uniformly to every
 * scenario using the same helpers (`applyScenarioOverrides`,
 * `selectProductsForTransaction`) that back `loanscope evaluate`, ensuring
 * the per-scenario reduction matches what a solo `evaluate --config <path>`
 * would produce for the same flags.
 *
 * Empty `paths` returns an empty report rather than throwing — the CLI
 * wrapper is responsible for rejecting "no inputs at all" before calling in.
 */
export const runBatchAction = (input: BatchInput): BatchReport => {
  const scenarios: BatchScenarioResult[] = [];
  for (const scenarioPath of input.paths) {
    let loaded: Transaction;
    let configProductSource: ProductSourceSelection | undefined;
    try {
      loaded = loadTransaction(scenarioPath);
      configProductSource = loadConfigFile(scenarioPath).productSource;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new CliValidationError(`Failed to load scenario "${scenarioPath}": ${message}`);
    }

    let result: BatchScenarioResult;
    try {
      const transaction = applyScenarioOverrides(loaded, input.overrides);
      const { products } = selectProductsForTransaction(
        transaction,
        {
          ...(input.selection.lender !== undefined ? { lender: input.selection.lender } : {}),
          ...(input.selection.products !== undefined ? { products: input.selection.products } : {}),
          ...(input.selection.productSource !== undefined
            ? { productSource: input.selection.productSource }
            : {}),
        },
        configProductSource,
      );
      const groups = evaluateAll(transaction, products);
      result = reduceGroups(scenarioPath, groups);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new CliValidationError(`Failed to evaluate scenario "${scenarioPath}": ${message}`);
    }
    scenarios.push(result);
  }
  return { scenarios, aggregate: aggregate(scenarios) };
};

/* ------------------------------------------------------------------ */
/*  Renderers                                                          */
/* ------------------------------------------------------------------ */

/**
 * One-line-per-scenario text report plus an aggregate footer. Format:
 *   `<path> — <e> eligible / <i> ineligible / <w> warnings (variantCount=<k>)`
 */
export const renderBatchTable = (report: BatchReport): string => {
  const lines: string[] = [];
  for (const s of report.scenarios) {
    lines.push(
      `${s.path} — ${s.eligibleCount} eligible / ${s.ineligibleCount} ineligible / ${s.warningsCount} warnings (variantCount=${s.variantCount})`,
    );
  }
  const a = report.aggregate;
  lines.push(
    `TOTAL (${a.scenarioCount} scenarios) — ${a.eligibleCount} eligible / ${a.ineligibleCount} ineligible / ${a.warningsCount} warnings (variantCount=${a.variantCount}, totalResults=${a.totalResults})`,
  );
  return lines.join("\n");
};

export const renderBatchJson = (report: BatchReport): string => renderJson(report);

const CSV_HEADER = "path,eligibleCount,ineligibleCount,warningsCount,variantCount,totalResults";

const csvEscape = (value: string): string => {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
};

export const renderBatchCsv = (report: BatchReport): string => {
  const rows: string[] = [CSV_HEADER];
  for (const s of report.scenarios) {
    rows.push(
      [
        csvEscape(s.path),
        String(s.eligibleCount),
        String(s.ineligibleCount),
        String(s.warningsCount),
        String(s.variantCount),
        String(s.totalResults),
      ].join(","),
    );
  }
  return rows.join("\n");
};
