import { eq } from "drizzle-orm";
import type { ProductDefinition } from "@loanscope/domain";
import type { LoanScopeDB } from "../connection";
import { customProductSets } from "../schema";
import {
  toCustomProductSetRecord,
  serializeCustomProductSetPayload,
} from "../mappers/custom-product-set-mapper";

export type ValidationStatus = "valid" | "invalid" | "unchecked";

export interface CustomProductSetRecord {
  readonly id: number;
  readonly setId: string;
  readonly name: string;
  readonly lenderId: string | null;
  readonly products: readonly ProductDefinition[];
  readonly validationStatus: ValidationStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CreateCustomProductSetInput {
  readonly setId: string;
  readonly name: string;
  readonly lenderId?: string;
  readonly products: readonly ProductDefinition[];
}

export interface CustomProductSetRepository {
  create(input: CreateCustomProductSetInput): CustomProductSetRecord;
  findBySetId(setId: string): CustomProductSetRecord | undefined;
  findAll(): readonly CustomProductSetRecord[];
  updateValidationStatus(setId: string, status: ValidationStatus): void;
  delete(setId: string): void;
}

export const createCustomProductSetRepository = (db: LoanScopeDB): CustomProductSetRepository => ({
  create(input: CreateCustomProductSetInput): CustomProductSetRecord {
    const now = new Date().toISOString();
    const row = db
      .insert(customProductSets)
      .values({
        setId: input.setId,
        name: input.name,
        lenderId: input.lenderId ?? null,
        payload: serializeCustomProductSetPayload(input.products),
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();
    return toCustomProductSetRecord(row);
  },

  findBySetId(setId: string): CustomProductSetRecord | undefined {
    const row = db.select().from(customProductSets).where(eq(customProductSets.setId, setId)).get();
    return row ? toCustomProductSetRecord(row) : undefined;
  },

  findAll(): readonly CustomProductSetRecord[] {
    return db.select().from(customProductSets).all().map(toCustomProductSetRecord);
  },

  updateValidationStatus(setId: string, status: ValidationStatus): void {
    db.update(customProductSets)
      .set({
        validationStatus: status,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(customProductSets.setId, setId))
      .run();
  },

  delete(setId: string): void {
    db.delete(customProductSets).where(eq(customProductSets.setId, setId)).run();
  },
});
