import type {
  DatabaseManager,
  ImportRunRecord,
  ImportRunStatus,
  ImportSourceFormat,
} from "@loanscope/db";
import { renderJson, type ActionOutputFormat } from "../../output";

export interface ListImportRunsInput {
  readonly lenderId?: string;
  readonly output: ActionOutputFormat;
}

export interface ImportRunListEntry {
  readonly runId: string;
  readonly lenderId: string;
  readonly status: ImportRunStatus;
  readonly sourceFile: string;
  readonly sourceFormat: ImportSourceFormat;
  readonly productsImported: number;
  readonly productsFailed: number;
  readonly catalogVersionId: number | null;
  readonly startedAt: string;
  readonly completedAt: string | null;
}

const toListEntry = (record: ImportRunRecord): ImportRunListEntry => ({
  runId: record.runId,
  lenderId: record.lenderId,
  status: record.status,
  sourceFile: record.sourceFile,
  sourceFormat: record.sourceFormat,
  productsImported: record.productsImported,
  productsFailed: record.productsFailed,
  catalogVersionId: record.catalogVersionId,
  startedAt: record.startedAt,
  completedAt: record.completedAt,
});

/**
 * Lists import runs in chronological order (most recent last). When
 * `lenderId` is provided, narrows to runs for that lender; otherwise lists
 * every run across all lenders.
 */
export const listImportRunsAction = (
  manager: DatabaseManager,
  input: ListImportRunsInput,
): string => {
  const raw =
    input.lenderId !== undefined
      ? manager.importRuns.findByLender(input.lenderId)
      : manager.importRuns.findAll();
  const all = [...raw].sort((a, b) => a.startedAt.localeCompare(b.startedAt));

  if (input.output === "json") {
    return renderJson(all.map(toListEntry));
  }
  if (all.length === 0) {
    const scope = input.lenderId !== undefined ? ` for lender "${input.lenderId}"` : "";
    return `No import runs${scope}.`;
  }
  const lines: string[] = [];
  for (const record of all) {
    const counts =
      record.status === "success"
        ? `${record.productsImported} ok`
        : record.status === "partial"
          ? `${record.productsImported} ok / ${record.productsFailed} failed`
          : record.status === "failed"
            ? `${record.productsFailed} failed`
            : "pending";
    lines.push(`${record.runId} — ${record.lenderId} [${record.status}] (${counts})`);
    lines.push(`  Source:   ${record.sourceFile} (${record.sourceFormat})`);
    lines.push(`  Started:  ${record.startedAt}`);
    if (record.completedAt !== null) {
      lines.push(`  Finished: ${record.completedAt}`);
    }
    if (record.catalogVersionId !== null) {
      lines.push(`  Catalog:  version id ${record.catalogVersionId}`);
    }
  }
  return lines.join("\n");
};
