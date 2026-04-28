import { and, desc, eq, sql } from "drizzle-orm";
import type { LoanScopeDB } from "../connection";
import { scenarioVersions } from "../schema";
import { toScenarioVersionRecord } from "../mappers/scenario-version-mapper";

export type ScenarioVersionChangeKind = "create" | "update" | "restore";

export interface ScenarioVersionRecord {
  readonly id: number;
  readonly scenarioId: string;
  readonly version: number;
  readonly configPayload: unknown;
  readonly changeNote: string | null;
  readonly changeKind: ScenarioVersionChangeKind;
  readonly restoredFromVersion: number | null;
  readonly createdAt: string;
}

export interface CreateScenarioVersionInput {
  readonly scenarioId: string;
  readonly version: number;
  readonly configPayload: unknown;
  readonly changeKind: ScenarioVersionChangeKind;
  readonly changeNote?: string;
  readonly restoredFromVersion?: number;
}

export interface ScenarioVersionRepository {
  append(input: CreateScenarioVersionInput): ScenarioVersionRecord;
  findVersion(scenarioId: string, version: number): ScenarioVersionRecord | undefined;
  getLatestVersion(scenarioId: string): ScenarioVersionRecord | undefined;
  findHistory(scenarioId: string): readonly ScenarioVersionRecord[];
  countVersions(scenarioId: string): number;
}

export const createScenarioVersionRepository = (db: LoanScopeDB): ScenarioVersionRepository => ({
  append(input: CreateScenarioVersionInput): ScenarioVersionRecord {
    const row = db
      .insert(scenarioVersions)
      .values({
        scenarioId: input.scenarioId,
        version: input.version,
        configPayload: JSON.stringify(input.configPayload),
        changeKind: input.changeKind,
        changeNote: input.changeNote ?? null,
        restoredFromVersion: input.restoredFromVersion ?? null,
        createdAt: new Date().toISOString(),
      })
      .returning()
      .get();
    return toScenarioVersionRecord(row);
  },

  findVersion(scenarioId: string, version: number): ScenarioVersionRecord | undefined {
    const row = db
      .select()
      .from(scenarioVersions)
      .where(
        and(eq(scenarioVersions.scenarioId, scenarioId), eq(scenarioVersions.version, version)),
      )
      .get();
    return row ? toScenarioVersionRecord(row) : undefined;
  },

  getLatestVersion(scenarioId: string): ScenarioVersionRecord | undefined {
    const row = db
      .select()
      .from(scenarioVersions)
      .where(eq(scenarioVersions.scenarioId, scenarioId))
      .orderBy(desc(scenarioVersions.version))
      .limit(1)
      .get();
    return row ? toScenarioVersionRecord(row) : undefined;
  },

  findHistory(scenarioId: string): readonly ScenarioVersionRecord[] {
    return db
      .select()
      .from(scenarioVersions)
      .where(eq(scenarioVersions.scenarioId, scenarioId))
      .orderBy(desc(scenarioVersions.version))
      .all()
      .map(toScenarioVersionRecord);
  },

  countVersions(scenarioId: string): number {
    const row = db
      .select({ count: sql<number>`count(*)` })
      .from(scenarioVersions)
      .where(eq(scenarioVersions.scenarioId, scenarioId))
      .get();
    return row?.count ?? 0;
  },
});
