import { eq } from "drizzle-orm";
import type { LoanScopeDB } from "../connection";
import { auditSessions } from "../schema";
import { toAuditSessionRecord } from "../mappers/audit-session-mapper";

export type AuditExitStatus = "running" | "success" | "error";

export interface AuditSessionRecord {
  readonly id: number;
  readonly sessionId: string;
  readonly command: string;
  readonly argsPayload: unknown;
  readonly scenarioId: string | null;
  readonly resultSummary: unknown | null;
  readonly exitStatus: AuditExitStatus;
  readonly startedAt: string;
  readonly completedAt: string | null;
}

export interface CreateAuditSessionInput {
  readonly sessionId: string;
  readonly command: string;
  readonly argsPayload: unknown;
  readonly scenarioId?: string;
}

export interface AuditSessionRepository {
  create(input: CreateAuditSessionInput): AuditSessionRecord;
  findById(sessionId: string): AuditSessionRecord | undefined;
  findAll(): readonly AuditSessionRecord[];
  findByCommand(command: string): readonly AuditSessionRecord[];
  markSuccess(sessionId: string, resultSummary?: unknown): void;
  markError(sessionId: string, resultSummary?: unknown): void;
}

export const createAuditSessionRepository = (db: LoanScopeDB): AuditSessionRepository => ({
  create(input: CreateAuditSessionInput): AuditSessionRecord {
    const now = new Date().toISOString();
    const row = db
      .insert(auditSessions)
      .values({
        sessionId: input.sessionId,
        command: input.command,
        argsPayload: JSON.stringify(input.argsPayload),
        scenarioId: input.scenarioId ?? null,
        startedAt: now,
      })
      .returning()
      .get();
    return toAuditSessionRecord(row);
  },

  findById(sessionId: string): AuditSessionRecord | undefined {
    const row = db.select().from(auditSessions).where(eq(auditSessions.sessionId, sessionId)).get();
    return row ? toAuditSessionRecord(row) : undefined;
  },

  findAll(): readonly AuditSessionRecord[] {
    return db.select().from(auditSessions).all().map(toAuditSessionRecord);
  },

  findByCommand(command: string): readonly AuditSessionRecord[] {
    return db
      .select()
      .from(auditSessions)
      .where(eq(auditSessions.command, command))
      .all()
      .map(toAuditSessionRecord);
  },

  markSuccess(sessionId: string, resultSummary?: unknown): void {
    db.update(auditSessions)
      .set({
        exitStatus: "success",
        resultSummary: resultSummary !== undefined ? JSON.stringify(resultSummary) : null,
        completedAt: new Date().toISOString(),
      })
      .where(eq(auditSessions.sessionId, sessionId))
      .run();
  },

  markError(sessionId: string, resultSummary?: unknown): void {
    db.update(auditSessions)
      .set({
        exitStatus: "error",
        resultSummary: resultSummary !== undefined ? JSON.stringify(resultSummary) : null,
        completedAt: new Date().toISOString(),
      })
      .where(eq(auditSessions.sessionId, sessionId))
      .run();
  },
});
