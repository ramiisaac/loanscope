import { eq, and } from "drizzle-orm";
import type { LoanScopeDB } from "../connection";
import { lenderPresets } from "../schema";
import { toPresetRecord, serializePresetProductIds } from "../mappers/preset-mapper";

export interface PresetRecord {
  readonly id: number;
  readonly lenderId: string;
  readonly presetId: string;
  readonly name: string;
  readonly productIds: readonly string[];
}

export interface CreatePresetInput {
  readonly lenderId: string;
  readonly presetId: string;
  readonly name: string;
  readonly productIds: readonly string[];
}

export interface PresetRepository {
  create(input: CreatePresetInput): PresetRecord;
  findByLender(lenderId: string): readonly PresetRecord[];
  findByPresetId(lenderId: string, presetId: string): PresetRecord | undefined;
  delete(lenderId: string, presetId: string): void;
}

export const createPresetRepository = (db: LoanScopeDB): PresetRepository => ({
  create(input: CreatePresetInput): PresetRecord {
    const row = db
      .insert(lenderPresets)
      .values({
        lenderId: input.lenderId,
        presetId: input.presetId,
        name: input.name,
        productIds: serializePresetProductIds(input.productIds),
      })
      .returning()
      .get();
    return toPresetRecord(row);
  },

  findByLender(lenderId: string): readonly PresetRecord[] {
    return db
      .select()
      .from(lenderPresets)
      .where(eq(lenderPresets.lenderId, lenderId))
      .all()
      .map(toPresetRecord);
  },

  findByPresetId(lenderId: string, presetId: string): PresetRecord | undefined {
    const row = db
      .select()
      .from(lenderPresets)
      .where(and(eq(lenderPresets.lenderId, lenderId), eq(lenderPresets.presetId, presetId)))
      .get();
    return row ? toPresetRecord(row) : undefined;
  },

  delete(lenderId: string, presetId: string): void {
    db.delete(lenderPresets)
      .where(and(eq(lenderPresets.lenderId, lenderId), eq(lenderPresets.presetId, presetId)))
      .run();
  },
});
