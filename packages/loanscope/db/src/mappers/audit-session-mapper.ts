import type { auditSessions } from "../schema";
import type { AuditSessionRecord } from "../repositories/audit-session-repository";

/**
 * Converts an `auditSessions` row into a domain `AuditSessionRecord`,
 * including JSON deserialization of `argsPayload` and (optional)
 * `resultSummary`. The persistence boundary trusts payloads it previously
 * serialized via `JSON.stringify`.
 */
export const toAuditSessionRecord = (
  row: typeof auditSessions.$inferSelect,
): AuditSessionRecord => ({
  id: row.id,
  sessionId: row.sessionId,
  command: row.command,
  argsPayload: JSON.parse(row.argsPayload) as unknown,
  scenarioId: row.scenarioId,
  resultSummary: row.resultSummary ? (JSON.parse(row.resultSummary) as unknown) : null,
  exitStatus: row.exitStatus,
  startedAt: row.startedAt,
  completedAt: row.completedAt,
});
