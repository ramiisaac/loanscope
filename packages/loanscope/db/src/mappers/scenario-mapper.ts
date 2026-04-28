import type { savedScenarios } from "../schema";
import type { SavedScenarioRecord } from "../repositories/scenario-repository";

/**
 * Converts a `savedScenarios` row into a domain `SavedScenarioRecord`,
 * including JSON deserialization of `configPayload` and (optional)
 * `resultPayload`. The persistence boundary trusts payloads it previously
 * serialized via `JSON.stringify`.
 */
export const toSavedScenarioRecord = (
  row: typeof savedScenarios.$inferSelect,
): SavedScenarioRecord => ({
  id: row.id,
  scenarioId: row.scenarioId,
  name: row.name,
  description: row.description,
  configPayload: JSON.parse(row.configPayload) as unknown,
  resultPayload: row.resultPayload ? (JSON.parse(row.resultPayload) as unknown) : null,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});
