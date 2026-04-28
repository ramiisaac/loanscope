import { eq } from "drizzle-orm";
import type { LoanScopeDB } from "../connection";
import { savedSimulations } from "../schema";
import { toSavedSimulationRecord } from "../mappers/simulation-mapper";

export interface SavedSimulationRecord {
  readonly id: number;
  readonly simulationId: string;
  readonly name: string;
  readonly scenarioId: string | null;
  readonly configPayload: unknown;
  readonly resultPayload: unknown | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CreateSimulationInput {
  readonly simulationId: string;
  readonly name: string;
  readonly scenarioId?: string;
  readonly configPayload: unknown;
}

export interface SavedSimulationRepository {
  create(input: CreateSimulationInput): SavedSimulationRecord;
  findById(simulationId: string): SavedSimulationRecord | undefined;
  findAll(): readonly SavedSimulationRecord[];
  updateResult(simulationId: string, resultPayload: unknown): void;
  updateName(simulationId: string, name: string): void;
  delete(simulationId: string): void;
}

export const createSimulationRepository = (db: LoanScopeDB): SavedSimulationRepository => ({
  create(input: CreateSimulationInput): SavedSimulationRecord {
    const now = new Date().toISOString();
    const row = db
      .insert(savedSimulations)
      .values({
        simulationId: input.simulationId,
        name: input.name,
        scenarioId: input.scenarioId ?? null,
        configPayload: JSON.stringify(input.configPayload),
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();
    return toSavedSimulationRecord(row);
  },

  findById(simulationId: string): SavedSimulationRecord | undefined {
    const row = db
      .select()
      .from(savedSimulations)
      .where(eq(savedSimulations.simulationId, simulationId))
      .get();
    return row ? toSavedSimulationRecord(row) : undefined;
  },

  findAll(): readonly SavedSimulationRecord[] {
    return db.select().from(savedSimulations).all().map(toSavedSimulationRecord);
  },

  updateResult(simulationId: string, resultPayload: unknown): void {
    db.update(savedSimulations)
      .set({
        resultPayload: JSON.stringify(resultPayload),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(savedSimulations.simulationId, simulationId))
      .run();
  },

  updateName(simulationId: string, name: string): void {
    db.update(savedSimulations)
      .set({ name, updatedAt: new Date().toISOString() })
      .where(eq(savedSimulations.simulationId, simulationId))
      .run();
  },

  delete(simulationId: string): void {
    db.delete(savedSimulations).where(eq(savedSimulations.simulationId, simulationId)).run();
  },
});
