import { createHash } from "node:crypto";
import type { LoanScopeDB } from "./connection";
import type { LenderDefinitionInput, ValidatedLender } from "@loanscope/lenders";
import { validateLenderInput } from "@loanscope/lenders";
import { createLenderRepository } from "./repositories/lender-repository";
import { createCatalogRepository } from "./repositories/catalog-repository";
import { createPresetRepository } from "./repositories/preset-repository";

/**
 * Persists a lender definition (metadata + product catalog + presets) into
 * the database. The lender input is validated through the existing domain
 * validation pipeline before any rows are written.
 *
 * If the lender already exists, this is a no-op for the lender row and
 * only imports a new catalog version if the content hash differs from the
 * latest stored version. Presets are upserted (deleted and re-created).
 *
 * @returns The validated lender that was persisted.
 */
export function seedLender(db: LoanScopeDB, input: LenderDefinitionInput): ValidatedLender {
  const validated = validateLenderInput(input);
  const lenderRepo = createLenderRepository(db);
  const catalogRepo = createCatalogRepository(db);
  const presetRepo = createPresetRepository(db);

  // ---- Lender row ----
  const existing = lenderRepo.findById(validated.id);
  if (!existing) {
    lenderRepo.create({
      id: validated.id,
      name: validated.name,
      sourceKind: "builtin",
    });
  }

  // ---- Product catalog ----
  const catalogPayload = JSON.stringify(validated.products);
  const contentHash = createHash("sha256").update(catalogPayload).digest("hex");

  const latestVersion = catalogRepo.getLatestVersion(validated.id);
  const needsImport = !latestVersion || latestVersion.contentHash !== contentHash;

  if (needsImport) {
    const nextVersion = latestVersion ? latestVersion.version + 1 : 1;
    catalogRepo.importCatalog({
      lenderId: validated.id,
      version: nextVersion,
      products: [...validated.products],
      contentHash,
    });
  }

  // ---- Presets (delete-and-recreate for idempotency) ----
  const existingPresets = presetRepo.findByLender(validated.id);
  for (const ep of existingPresets) {
    presetRepo.delete(validated.id, ep.presetId);
  }
  for (const preset of validated.presets) {
    presetRepo.create({
      lenderId: validated.id,
      presetId: preset.id,
      name: preset.name,
      productIds: preset.productIds,
    });
  }

  return validated;
}

/**
 * Seeds multiple lender definitions into the database. Convenience wrapper
 * that calls {@link seedLender} for each input.
 */
export function seedLenders(
  db: LoanScopeDB,
  inputs: readonly LenderDefinitionInput[],
): readonly ValidatedLender[] {
  return inputs.map((input) => seedLender(db, input));
}
