import { eq } from "drizzle-orm";
import type { LoanScopeDB } from "../connection";
import { savedScenarios } from "../schema";
import { toSavedScenarioRecord } from "../mappers/scenario-mapper";

export interface SavedScenarioRecord {
  readonly id: number;
  readonly scenarioId: string;
  readonly name: string;
  readonly description: string | null;
  readonly configPayload: unknown;
  readonly resultPayload: unknown | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CreateScenarioInput {
  readonly scenarioId: string;
  readonly name: string;
  readonly description?: string;
  readonly configPayload: unknown;
}

export interface SavedScenarioRepository {
  create(input: CreateScenarioInput): SavedScenarioRecord;
  findById(scenarioId: string): SavedScenarioRecord | undefined;
  findAll(): readonly SavedScenarioRecord[];
  updateResult(scenarioId: string, resultPayload: unknown): void;
  updateConfig(scenarioId: string, configPayload: unknown): void;
  updateName(scenarioId: string, name: string): void;
  delete(scenarioId: string): void;
}

export const createScenarioRepository = (db: LoanScopeDB): SavedScenarioRepository => ({
  create(input: CreateScenarioInput): SavedScenarioRecord {
    const now = new Date().toISOString();
    const row = db
      .insert(savedScenarios)
      .values({
        scenarioId: input.scenarioId,
        name: input.name,
        description: input.description ?? null,
        configPayload: JSON.stringify(input.configPayload),
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();
    return toSavedScenarioRecord(row);
  },

  findById(scenarioId: string): SavedScenarioRecord | undefined {
    const row = db
      .select()
      .from(savedScenarios)
      .where(eq(savedScenarios.scenarioId, scenarioId))
      .get();
    return row ? toSavedScenarioRecord(row) : undefined;
  },

  findAll(): readonly SavedScenarioRecord[] {
    return db.select().from(savedScenarios).all().map(toSavedScenarioRecord);
  },

  updateResult(scenarioId: string, resultPayload: unknown): void {
    db.update(savedScenarios)
      .set({
        resultPayload: JSON.stringify(resultPayload),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(savedScenarios.scenarioId, scenarioId))
      .run();
  },

  updateConfig(scenarioId: string, configPayload: unknown): void {
    db.update(savedScenarios)
      .set({
        configPayload: JSON.stringify(configPayload),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(savedScenarios.scenarioId, scenarioId))
      .run();
  },

  updateName(scenarioId: string, name: string): void {
    db.update(savedScenarios)
      .set({ name, updatedAt: new Date().toISOString() })
      .where(eq(savedScenarios.scenarioId, scenarioId))
      .run();
  },

  delete(scenarioId: string): void {
    db.delete(savedScenarios).where(eq(savedScenarios.scenarioId, scenarioId)).run();
  },
});
