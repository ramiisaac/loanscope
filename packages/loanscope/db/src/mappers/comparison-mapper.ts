import type { savedComparisons } from "../schema";
import type { SavedComparisonRecord } from "../repositories/comparison-repository";

/**
 * Converts a `savedComparisons` row into a domain `SavedComparisonRecord`,
 * including JSON deserialization of `configPayload` and (optional)
 * `resultPayload`. The persistence boundary trusts payloads it previously
 * serialized via `JSON.stringify`.
 */
export const toSavedComparisonRecord = (
  row: typeof savedComparisons.$inferSelect,
): SavedComparisonRecord => ({
  id: row.id,
  comparisonId: row.comparisonId,
  name: row.name,
  scenarioId: row.scenarioId,
  configPayload: JSON.parse(row.configPayload) as unknown,
  resultPayload: row.resultPayload ? (JSON.parse(row.resultPayload) as unknown) : null,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});
