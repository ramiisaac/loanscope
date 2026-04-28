import type {
  DatabaseManager,
  ImportRunRecord,
  ImportRunStatus,
  ImportSourceFormat,
} from "@loanscope/db";
import { renderJson, type ActionOutputFormat } from "../../output";
import { requireImportRun } from "./shared";

export interface ShowImportRunInput {
  readonly runId: string;
  readonly output: ActionOutputFormat;
}

export interface ImportRunDetail {
  readonly runId: string;
  readonly lenderId: string;
  readonly status: ImportRunStatus;
  readonly sourceFile: string;
  readonly sourceFormat: ImportSourceFormat;
  readonly contentHash: string;
  readonly productsImported: number;
  readonly productsFailed: number;
  readonly catalogVersionId: number | null;
  readonly startedAt: string;
  readonly completedAt: string | null;
  readonly errorLog: readonly string[];
}

const toDetail = (record: ImportRunRecord): ImportRunDetail => ({
  runId: record.runId,
  lenderId: record.lenderId,
  status: record.status,
  sourceFile: record.sourceFile,
  sourceFormat: record.sourceFormat,
  contentHash: record.contentHash,
  productsImported: record.productsImported,
  productsFailed: record.productsFailed,
  catalogVersionId: record.catalogVersionId,
  startedAt: record.startedAt,
  completedAt: record.completedAt,
  errorLog: record.errorLog ?? [],
});

/**
 * Emits full detail for a single import run, including the error log when
 * present. JSON mode is the stable machine-readable contract; text mode is
 * a metadata-first operator view.
 */
export const showImportRunAction = (
  manager: DatabaseManager,
  input: ShowImportRunInput,
): string => {
  const record = requireImportRun(manager, input.runId);
  const detail = toDetail(record);
  if (input.output === "json") {
    return renderJson(detail);
  }
  const lines: string[] = [
    `Run:       ${detail.runId}`,
    `Lender:    ${detail.lenderId}`,
    `Status:    ${detail.status}`,
    `Source:    ${detail.sourceFile} (${detail.sourceFormat})`,
    `Hash:      ${detail.contentHash}`,
    `Imported:  ${detail.productsImported}`,
    `Failed:    ${detail.productsFailed}`,
    `Catalog:   ${
      detail.catalogVersionId !== null ? `version id ${detail.catalogVersionId}` : "(none)"
    }`,
    `Started:   ${detail.startedAt}`,
    `Finished:  ${detail.completedAt ?? "(in progress)"}`,
  ];
  if (detail.errorLog.length > 0) {
    lines.push("Errors:");
    for (const entry of detail.errorLog) {
      lines.push(`  - ${entry}`);
    }
  }
  return lines.join("\n");
};
