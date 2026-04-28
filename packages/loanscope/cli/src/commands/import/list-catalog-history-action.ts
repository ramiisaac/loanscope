import type { DatabaseManager } from "@loanscope/db";
import { createCatalogRepository } from "@loanscope/db";
import { CliValidationError } from "../../cli-error";
import { renderJson, type ActionOutputFormat } from "../../output";

export interface ListCatalogHistoryInput {
  readonly lenderId: string;
  readonly output: ActionOutputFormat;
}

interface CatalogHistoryEntry {
  readonly catalogVersionId: number;
  readonly lenderId: string;
  readonly version: number;
  readonly sourceFile: string | null;
  readonly contentHash: string;
  readonly importedAt: string;
  readonly productCount: number;
}

/**
 * Lists every persisted catalog version for a lender in descending version
 * order. Includes the per-version product count so operators can spot
 * accidental empty or truncated imports at a glance.
 */
export const listCatalogHistoryAction = (
  manager: DatabaseManager,
  input: ListCatalogHistoryInput,
): string => {
  if (!manager.lenders.hasLender(input.lenderId)) {
    const registered = manager.lenders.lenderIds();
    throw new CliValidationError(
      `Unknown lender "${input.lenderId}". ` +
        `Registered lenders: ${registered.length > 0 ? registered.join(", ") : "(none — run `db seed`)"}.`,
    );
  }
  const catalogRepo = createCatalogRepository(manager.db);
  const versions = catalogRepo.getVersionHistory(input.lenderId);
  const entries: CatalogHistoryEntry[] = versions.map((record) => ({
    catalogVersionId: record.id,
    lenderId: record.lenderId,
    version: record.version,
    sourceFile: record.sourceFile,
    contentHash: record.contentHash,
    importedAt: record.importedAt,
    productCount: catalogRepo.getProducts(record.id).length,
  }));

  if (input.output === "json") {
    return renderJson(entries);
  }
  if (entries.length === 0) {
    return `No catalog versions for lender "${input.lenderId}".`;
  }
  const lines: string[] = [];
  for (const entry of entries) {
    lines.push(`v${entry.version} — ${entry.productCount} products [id ${entry.catalogVersionId}]`);
    lines.push(`  Imported: ${entry.importedAt}`);
    lines.push(`  Source:   ${entry.sourceFile ?? "(unknown)"}`);
    lines.push(`  Hash:     ${entry.contentHash}`);
  }
  return lines.join("\n");
};
