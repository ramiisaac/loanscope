import { eq } from "drizzle-orm";
import type { LoanScopeDB } from "../connection";
import { importRuns } from "../schema";
import { toImportRunRecord, serializeImportRunErrorLog } from "../mappers/import-run-mapper";

export type ImportSourceFormat = "yaml" | "json" | "csv";
export type ImportRunStatus = "pending" | "success" | "failed" | "partial";

export interface ImportRunRecord {
  readonly id: number;
  readonly runId: string;
  readonly lenderId: string;
  readonly sourceFile: string;
  readonly sourceFormat: ImportSourceFormat;
  readonly contentHash: string;
  readonly status: ImportRunStatus;
  readonly productsImported: number;
  readonly productsFailed: number;
  readonly errorLog: readonly string[] | null;
  readonly catalogVersionId: number | null;
  readonly startedAt: string;
  readonly completedAt: string | null;
}

export interface CreateImportRunInput {
  readonly runId: string;
  readonly lenderId: string;
  readonly sourceFile: string;
  readonly sourceFormat: ImportSourceFormat;
  readonly contentHash: string;
}

export interface ImportRunRepository {
  create(input: CreateImportRunInput): ImportRunRecord;
  findById(runId: string): ImportRunRecord | undefined;
  findByLender(lenderId: string): readonly ImportRunRecord[];
  findAll(): readonly ImportRunRecord[];
  markSuccess(runId: string, productsImported: number, catalogVersionId: number): void;
  markFailed(runId: string, productsFailed: number, errorLog: readonly string[]): void;
  markPartial(
    runId: string,
    productsImported: number,
    productsFailed: number,
    errorLog: readonly string[],
  ): void;
}

export const createImportRunRepository = (db: LoanScopeDB): ImportRunRepository => ({
  create(input: CreateImportRunInput): ImportRunRecord {
    const now = new Date().toISOString();
    const row = db
      .insert(importRuns)
      .values({
        runId: input.runId,
        lenderId: input.lenderId,
        sourceFile: input.sourceFile,
        sourceFormat: input.sourceFormat,
        contentHash: input.contentHash,
        status: "pending",
        productsImported: 0,
        productsFailed: 0,
        startedAt: now,
      })
      .returning()
      .get();
    return toImportRunRecord(row);
  },

  findById(runId: string): ImportRunRecord | undefined {
    const row = db.select().from(importRuns).where(eq(importRuns.runId, runId)).get();
    return row ? toImportRunRecord(row) : undefined;
  },

  findByLender(lenderId: string): readonly ImportRunRecord[] {
    return db
      .select()
      .from(importRuns)
      .where(eq(importRuns.lenderId, lenderId))
      .all()
      .map(toImportRunRecord);
  },

  findAll(): readonly ImportRunRecord[] {
    return db.select().from(importRuns).all().map(toImportRunRecord);
  },

  markSuccess(runId: string, productsImported: number, catalogVersionId: number): void {
    db.update(importRuns)
      .set({
        status: "success",
        productsImported,
        catalogVersionId,
        completedAt: new Date().toISOString(),
      })
      .where(eq(importRuns.runId, runId))
      .run();
  },

  markFailed(runId: string, productsFailed: number, errorLog: readonly string[]): void {
    db.update(importRuns)
      .set({
        status: "failed",
        productsFailed,
        errorLog: serializeImportRunErrorLog(errorLog),
        completedAt: new Date().toISOString(),
      })
      .where(eq(importRuns.runId, runId))
      .run();
  },

  markPartial(
    runId: string,
    productsImported: number,
    productsFailed: number,
    errorLog: readonly string[],
  ): void {
    db.update(importRuns)
      .set({
        status: "partial",
        productsImported,
        productsFailed,
        errorLog: serializeImportRunErrorLog(errorLog),
        completedAt: new Date().toISOString(),
      })
      .where(eq(importRuns.runId, runId))
      .run();
  },
});
