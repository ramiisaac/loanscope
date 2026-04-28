import type { savedSimulations } from "../schema";
import type { SavedSimulationRecord } from "../repositories/simulation-repository";

/**
 * Converts a `savedSimulations` row into a domain `SavedSimulationRecord`,
 * including JSON deserialization of `configPayload` and (optional)
 * `resultPayload`. The persistence boundary trusts payloads it previously
 * serialized via `JSON.stringify`.
 */
export const toSavedSimulationRecord = (
  row: typeof savedSimulations.$inferSelect,
): SavedSimulationRecord => ({
  id: row.id,
  simulationId: row.simulationId,
  name: row.name,
  scenarioId: row.scenarioId,
  configPayload: JSON.parse(row.configPayload) as unknown,
  resultPayload: row.resultPayload ? (JSON.parse(row.resultPayload) as unknown) : null,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});
