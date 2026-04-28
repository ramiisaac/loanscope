import type { importRuns } from "../schema";
import type { ImportRunRecord } from "../repositories/import-run-repository";

/**
 * Deserializes the stored `errorLog` JSON array from an import run row.
 * Returns `null` when no error log was recorded. The persistence boundary
 * trusts payloads it previously serialized via `JSON.stringify`.
 */
export const parseImportRunErrorLog = (raw: string | null): readonly string[] | null => {
  if (raw === null) return null;
  return JSON.parse(raw) as string[];
};

/**
 * Serializes an `errorLog` list for storage in the `importRuns.errorLog`
 * column. Paired with `parseImportRunErrorLog` for round-trip stability.
 */
export const serializeImportRunErrorLog = (errorLog: readonly string[]): string =>
  JSON.stringify(errorLog);

/**
 * Converts an `importRuns` row into a domain `ImportRunRecord`, including
 * JSON deserialization of the `errorLog` column.
 */
export const toImportRunRecord = (row: typeof importRuns.$inferSelect): ImportRunRecord => ({
  id: row.id,
  runId: row.runId,
  lenderId: row.lenderId,
  sourceFile: row.sourceFile,
  sourceFormat: row.sourceFormat,
  contentHash: row.contentHash,
  status: row.status,
  productsImported: row.productsImported,
  productsFailed: row.productsFailed,
  errorLog: parseImportRunErrorLog(row.errorLog),
  catalogVersionId: row.catalogVersionId,
  startedAt: row.startedAt,
  completedAt: row.completedAt,
});
