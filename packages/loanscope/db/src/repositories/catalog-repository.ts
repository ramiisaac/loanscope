import { eq, desc } from "drizzle-orm";
import type { ProductDefinition } from "@loanscope/domain";
import type { LoanScopeDB } from "../connection";
import { catalogVersions, productCatalogs } from "../schema";
import { toCatalogVersionRecord, parseProductPayload } from "../mappers/catalog-mapper";

export interface CatalogVersionRecord {
  readonly id: number;
  readonly lenderId: string;
  readonly version: number;
  readonly payloadVersion: number;
  readonly sourceFile: string | null;
  readonly contentHash: string;
  readonly importedAt: string;
}

export interface ImportCatalogInput {
  readonly lenderId: string;
  readonly version: number;
  readonly payloadVersion?: number;
  readonly products: readonly ProductDefinition[];
  readonly sourceFile?: string;
  readonly contentHash: string;
}

export interface CatalogRepository {
  importCatalog(input: ImportCatalogInput): CatalogVersionRecord;
  getLatestVersion(lenderId: string): CatalogVersionRecord | undefined;
  getVersionHistory(lenderId: string): readonly CatalogVersionRecord[];
  getProducts(catalogVersionId: number): readonly ProductDefinition[];
  getLatestProducts(lenderId: string): readonly ProductDefinition[];
}

export const createCatalogRepository = (db: LoanScopeDB): CatalogRepository => ({
  importCatalog(input: ImportCatalogInput): CatalogVersionRecord {
    const versionRow = db
      .insert(catalogVersions)
      .values({
        lenderId: input.lenderId,
        version: input.version,
        payloadVersion: input.payloadVersion ?? 1,
        sourceFile: input.sourceFile ?? null,
        contentHash: input.contentHash,
        importedAt: new Date().toISOString(),
      })
      .returning()
      .get();

    for (const product of input.products) {
      db.insert(productCatalogs)
        .values({
          catalogVersionId: versionRow.id,
          productId: product.id,
          productName: product.name,
          payload: JSON.stringify(product),
        })
        .run();
    }

    return toCatalogVersionRecord(versionRow);
  },

  getLatestVersion(lenderId: string): CatalogVersionRecord | undefined {
    const row = db
      .select()
      .from(catalogVersions)
      .where(eq(catalogVersions.lenderId, lenderId))
      .orderBy(desc(catalogVersions.version))
      .limit(1)
      .get();
    return row ? toCatalogVersionRecord(row) : undefined;
  },

  getVersionHistory(lenderId: string): readonly CatalogVersionRecord[] {
    return db
      .select()
      .from(catalogVersions)
      .where(eq(catalogVersions.lenderId, lenderId))
      .orderBy(desc(catalogVersions.version))
      .all()
      .map(toCatalogVersionRecord);
  },

  getProducts(catalogVersionId: number): readonly ProductDefinition[] {
    return db
      .select()
      .from(productCatalogs)
      .where(eq(productCatalogs.catalogVersionId, catalogVersionId))
      .all()
      .map((row) => parseProductPayload(row.payload));
  },

  getLatestProducts(lenderId: string): readonly ProductDefinition[] {
    const latest = this.getLatestVersion(lenderId);
    if (!latest) return [];
    return this.getProducts(latest.id);
  },
});
