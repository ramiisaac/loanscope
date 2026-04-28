import fs from "node:fs";
import { createHash } from "node:crypto";
import type { ProductDefinition } from "@loanscope/domain";
import { loadYamlFile } from "@loanscope/config";
import type { CatalogVersionRecord, DatabaseManager, ImportRunStatus } from "@loanscope/db";
import { withTx } from "@loanscope/db";
import {
  createCatalogRepository,
  createImportRunRepository,
  validateProductStructure,
} from "@loanscope/db";
import { buildId } from "../../ids";
import { CliValidationError } from "../../cli-error";
import { type SupportedImportFormat, parseCatalogImportFormat } from "./shared";
/* ------------------------------------------------------------------ */
/*  File loading + payload extraction                                 */
/* ------------------------------------------------------------------ */

const hasObjectShape = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Reads the raw file contents (used both for parsing and for content
 * hashing). Always UTF-8; binary catalog payloads are unsupported.
 */
const readFileContents = (filePath: string): string => {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new CliValidationError(`Failed to read catalog file "${filePath}": ${message}`);
  }
};

/**
 * Parses raw file contents according to the resolved format. Surfaces parse
 * failures as `CliValidationError` so the top-level CLI handler renders a
 * clean message rather than a stack trace.
 */
const parseRawContents = (
  raw: string,
  filePath: string,
  format: SupportedImportFormat,
): unknown => {
  if (format === "yaml") {
    // Reuse the canonical `js-yaml`-backed loader for consistency with every
    // other YAML surface in the loanscope graph. Going through a tmp-less
    // path requires a second loader entry; instead, we parse the string by
    // writing to a helper. To avoid that, we read+hash first, then yaml-load
    // via the filesystem loader, which re-reads. The duplicate read is fine
    // for CLI import sizes and keeps the YAML path single-sourced.
    try {
      return loadYamlFile(filePath);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new CliValidationError(`Failed to parse YAML catalog file "${filePath}": ${message}`);
    }
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new CliValidationError(`Failed to parse JSON catalog file "${filePath}": ${message}`);
  }
};

/**
 * Extracts the `products` array from a parsed catalog payload. The CLI
 * contract is a top-level object with a `products: ProductDefinition[]`
 * key, matching the shape used by the custom product set surface.
 */
const extractProducts = (parsed: unknown): ProductDefinition[] => {
  if (!hasObjectShape(parsed)) {
    throw new CliValidationError(
      "Catalog file must be an object with a top-level `products` array.",
    );
  }
  const productsField = parsed.products;
  if (!Array.isArray(productsField)) {
    throw new CliValidationError("Catalog file is missing a top-level `products` array.");
  }
  if (productsField.length === 0) {
    throw new CliValidationError("Catalog file `products` array must contain at least one entry.");
  }
  for (const [index, entry] of productsField.entries()) {
    if (!hasObjectShape(entry)) {
      throw new CliValidationError(`Catalog product at index ${index} must be an object.`);
    }
  }
  return productsField as ProductDefinition[];
};

/* ------------------------------------------------------------------ */
/*  Structural validation (boundary)                                  */
/* ------------------------------------------------------------------ */

interface PartitionedProducts {
  readonly valid: readonly ProductDefinition[];
  readonly errorLog: readonly string[];
  readonly failedCount: number;
}

/**
 * Runs {@link validateProductStructure} across every product in the source
 * payload and partitions the input into a `valid` list (structurally sound
 * definitions) and an `errorLog` capturing per-product failure messages.
 *
 * The errorLog entries are human-readable and include a locator — product
 * id when present, else the source index — so operators can triage partial
 * imports without re-inspecting the source file.
 */
const partitionValidProducts = (products: readonly ProductDefinition[]): PartitionedProducts => {
  const valid: ProductDefinition[] = [];
  const errorLog: string[] = [];
  let failedCount = 0;
  for (const [index, product] of products.entries()) {
    const errors = validateProductStructure(product);
    if (errors.length === 0) {
      valid.push(product);
      continue;
    }
    failedCount += 1;
    const locator =
      typeof product.id === "string" && product.id.trim().length > 0
        ? `"${product.id}"`
        : `index ${index}`;
    for (const message of errors) {
      errorLog.push(`product ${locator}: ${message}`);
    }
  }
  return { valid, errorLog, failedCount };
};

/* ------------------------------------------------------------------ */
/*  Content hashing                                                   */
/* ------------------------------------------------------------------ */

const sha256 = (contents: string): string => createHash("sha256").update(contents).digest("hex");

/* ------------------------------------------------------------------ */
/*  import                                                             */
/* ------------------------------------------------------------------ */

export interface ImportCatalogCliInput {
  readonly lenderId: string;
  readonly filePath: string;
  readonly format?: SupportedImportFormat;
  readonly now?: Date;
}

export interface ImportCatalogCliOutput {
  readonly runId: string;
  readonly lenderId: string;
  readonly version: number | null;
  readonly catalogVersionId: number | null;
  readonly status: ImportRunStatus;
  readonly productsImported: number;
  readonly productsFailed: number;
  readonly contentHash: string;
  readonly sourceFile: string;
  readonly sourceFormat: SupportedImportFormat;
  readonly errorLog: readonly string[];
}

/**
 * Executes a catalog import end-to-end:
 *
 * 1. Resolve the effective format (explicit `--format` or extension inferred).
 * 2. Read and SHA-256 hash the raw file contents.
 * 3. Parse per-format and extract the top-level `products` array.
 * 4. Assert the target lender exists and is active.
 * 5. Inside a single better-sqlite3 transaction:
 *    - Create the `import_runs` row in status `pending`.
 *    - Partition products by {@link validateProductStructure}.
 *    - If every product is invalid → `markFailed` and roll back any partial
 *      catalog writes (in practice no catalog rows are written in this path).
 *    - Otherwise write a new `catalog_versions` row (version = latest + 1)
 *      plus one `product_catalogs` row per valid product.
 *    - Finalize the run via `markSuccess` (all valid) or `markPartial`
 *      (mixed valid/invalid).
 *
 * The whole sequence is transactional so a crash, validation failure, or
 * throw cannot leave a dangling `pending` row. The CLI returns a structured
 * summary regardless of success / partial / fail.
 */
export const importCatalogAction = (
  manager: DatabaseManager,
  input: ImportCatalogCliInput,
): ImportCatalogCliOutput => {
  // 1. Format resolution.
  const format = parseCatalogImportFormat(input.format, input.filePath);

  // 2. Read + hash (single disk read for hashing; YAML loader will re-read
  //    through `loadYamlFile` for parser semantics consistency).
  const raw = readFileContents(input.filePath);
  const contentHash = sha256(raw);

  // 3. Parse + extract.
  const parsed = parseRawContents(raw, input.filePath, format);
  const products = extractProducts(parsed);

  // 4. Lender existence + active gate (before opening a transaction so we
  //    never register a pending import for an unknown lender).
  if (!manager.lenders.hasLender(input.lenderId)) {
    const registered = manager.lenders.lenderIds();
    throw new CliValidationError(
      `Unknown lender "${input.lenderId}". ` +
        `Registered lenders: ${registered.length > 0 ? registered.join(", ") : "(none — run `db seed`)"}.`,
    );
  }

  // 5. Derive runId up front so it is visible in error messages too.
  const runId = buildId(undefined, `${input.lenderId}-import`, {
    ...(input.now !== undefined ? { now: input.now } : {}),
    fallback: "import",
  });

  // 6. Transactional write path. `withTx` encapsulates the documented
  //    boundary adapter from drizzle's transaction handle to `LoanScopeDB`.
  return withTx(manager.db, (txDb) => {
    const txImportRuns = createImportRunRepository(txDb);
    const txCatalog = createCatalogRepository(txDb);

    txImportRuns.create({
      runId,
      lenderId: input.lenderId,
      sourceFile: input.filePath,
      sourceFormat: format,
      contentHash,
    });

    const { valid, errorLog, failedCount } = partitionValidProducts(products);

    // All-invalid short circuit: no catalog version written.
    if (valid.length === 0) {
      txImportRuns.markFailed(runId, failedCount, errorLog);
      return {
        runId,
        lenderId: input.lenderId,
        version: null,
        catalogVersionId: null,
        status: "failed" as const,
        productsImported: 0,
        productsFailed: failedCount,
        contentHash,
        sourceFile: input.filePath,
        sourceFormat: format,
        errorLog,
      };
    }

    // Determine next version for this lender (monotonic, per-lender).
    const latest = txCatalog.getLatestVersion(input.lenderId);
    const nextVersion = (latest?.version ?? 0) + 1;

    let versionRecord: CatalogVersionRecord;
    try {
      versionRecord = txCatalog.importCatalog({
        lenderId: input.lenderId,
        version: nextVersion,
        products: valid,
        sourceFile: input.filePath,
        contentHash,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Rethrow inside the transaction so better-sqlite3 rolls back the
      // pending import_runs row along with any partial catalog writes.
      throw new CliValidationError(
        `Failed to persist catalog for lender "${input.lenderId}": ${message}`,
      );
    }

    if (errorLog.length > 0) {
      txImportRuns.markPartial(runId, valid.length, failedCount, errorLog);
      return {
        runId,
        lenderId: input.lenderId,
        version: versionRecord.version,
        catalogVersionId: versionRecord.id,
        status: "partial" as const,
        productsImported: valid.length,
        productsFailed: failedCount,
        contentHash,
        sourceFile: input.filePath,
        sourceFormat: format,
        errorLog,
      };
    }

    txImportRuns.markSuccess(runId, valid.length, versionRecord.id);
    return {
      runId,
      lenderId: input.lenderId,
      version: versionRecord.version,
      catalogVersionId: versionRecord.id,
      status: "success" as const,
      productsImported: valid.length,
      productsFailed: 0,
      contentHash,
      sourceFile: input.filePath,
      sourceFormat: format,
      errorLog: [],
    };
  });
};
