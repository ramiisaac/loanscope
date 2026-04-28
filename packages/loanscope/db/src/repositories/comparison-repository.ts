import { eq } from "drizzle-orm";
import type { LoanScopeDB } from "../connection";
import { savedComparisons } from "../schema";
import { toSavedComparisonRecord } from "../mappers/comparison-mapper";

export interface SavedComparisonRecord {
  readonly id: number;
  readonly comparisonId: string;
  readonly name: string;
  readonly scenarioId: string | null;
  readonly configPayload: unknown;
  readonly resultPayload: unknown | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CreateComparisonInput {
  readonly comparisonId: string;
  readonly name: string;
  readonly scenarioId?: string;
  readonly configPayload: unknown;
}

export interface SavedComparisonRepository {
  create(input: CreateComparisonInput): SavedComparisonRecord;
  findById(comparisonId: string): SavedComparisonRecord | undefined;
  findAll(): readonly SavedComparisonRecord[];
  updateResult(comparisonId: string, resultPayload: unknown): void;
  updateName(comparisonId: string, name: string): void;
  delete(comparisonId: string): void;
}

export const createComparisonRepository = (db: LoanScopeDB): SavedComparisonRepository => ({
  create(input: CreateComparisonInput): SavedComparisonRecord {
    const now = new Date().toISOString();
    const row = db
      .insert(savedComparisons)
      .values({
        comparisonId: input.comparisonId,
        name: input.name,
        scenarioId: input.scenarioId ?? null,
        configPayload: JSON.stringify(input.configPayload),
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();
    return toSavedComparisonRecord(row);
  },

  findById(comparisonId: string): SavedComparisonRecord | undefined {
    const row = db
      .select()
      .from(savedComparisons)
      .where(eq(savedComparisons.comparisonId, comparisonId))
      .get();
    return row ? toSavedComparisonRecord(row) : undefined;
  },

  findAll(): readonly SavedComparisonRecord[] {
    return db.select().from(savedComparisons).all().map(toSavedComparisonRecord);
  },

  updateResult(comparisonId: string, resultPayload: unknown): void {
    db.update(savedComparisons)
      .set({
        resultPayload: JSON.stringify(resultPayload),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(savedComparisons.comparisonId, comparisonId))
      .run();
  },

  updateName(comparisonId: string, name: string): void {
    db.update(savedComparisons)
      .set({ name, updatedAt: new Date().toISOString() })
      .where(eq(savedComparisons.comparisonId, comparisonId))
      .run();
  },

  delete(comparisonId: string): void {
    db.delete(savedComparisons).where(eq(savedComparisons.comparisonId, comparisonId)).run();
  },
});
