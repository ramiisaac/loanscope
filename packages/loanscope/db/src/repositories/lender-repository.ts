import { eq } from "drizzle-orm";
import type { LoanScopeDB } from "../connection";
import { lenders } from "../schema";
import { toLenderRecord } from "../mappers/lender-mapper";

export type LenderSourceKind = "builtin" | "imported" | "custom";

export interface LenderRecord {
  readonly id: string;
  readonly name: string;
  readonly sourceKind: LenderSourceKind;
  readonly version: number;
  readonly active: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CreateLenderInput {
  readonly id: string;
  readonly name: string;
  readonly sourceKind: LenderSourceKind;
}

export interface LenderRepository {
  create(input: CreateLenderInput): LenderRecord;
  findById(id: string): LenderRecord | undefined;
  findAll(activeOnly?: boolean): readonly LenderRecord[];
  deactivate(id: string): void;
  activate(id: string): void;
}

export const createLenderRepository = (db: LoanScopeDB): LenderRepository => ({
  create(input: CreateLenderInput): LenderRecord {
    const now = new Date().toISOString();
    const row = db
      .insert(lenders)
      .values({
        id: input.id,
        name: input.name,
        sourceKind: input.sourceKind,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();
    return toLenderRecord(row);
  },

  findById(id: string): LenderRecord | undefined {
    const row = db.select().from(lenders).where(eq(lenders.id, id)).get();
    return row ? toLenderRecord(row) : undefined;
  },

  findAll(activeOnly = false): readonly LenderRecord[] {
    if (activeOnly) {
      return db.select().from(lenders).where(eq(lenders.active, true)).all().map(toLenderRecord);
    }
    return db.select().from(lenders).all().map(toLenderRecord);
  },

  deactivate(id: string): void {
    db.update(lenders)
      .set({ active: false, updatedAt: new Date().toISOString() })
      .where(eq(lenders.id, id))
      .run();
  },

  activate(id: string): void {
    db.update(lenders)
      .set({ active: true, updatedAt: new Date().toISOString() })
      .where(eq(lenders.id, id))
      .run();
  },
});
