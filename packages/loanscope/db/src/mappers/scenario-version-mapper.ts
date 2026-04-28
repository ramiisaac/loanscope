import type { scenarioVersions } from "../schema";
import type {
  ScenarioVersionChangeKind,
  ScenarioVersionRecord,
} from "../repositories/scenario-version-repository";

export const toScenarioVersionRecord = (
  row: typeof scenarioVersions.$inferSelect,
): ScenarioVersionRecord => ({
  id: row.id,
  scenarioId: row.scenarioId,
  version: row.version,
  configPayload: JSON.parse(row.configPayload) as unknown,
  changeNote: row.changeNote,
  changeKind: row.changeKind as ScenarioVersionChangeKind,
  restoredFromVersion: row.restoredFromVersion,
  createdAt: row.createdAt,
});
