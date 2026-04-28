import path from "node:path";
import type { DatabaseManager, ImportRunRecord, ImportSourceFormat } from "@loanscope/db";
import { CliValidationError } from "../../cli-error";

/**
 * Narrowed subset of {@link ImportSourceFormat} that the CLI currently
 * accepts. CSV is deferred until the column schema is fixed; Excel is not
 * planned. The narrower type is enforced at the CLI boundary; the repository
 * still accepts the full `ImportSourceFormat` for forward compatibility.
 */
export type SupportedImportFormat = Extract<ImportSourceFormat, "yaml" | "json">;

const SUPPORTED_FORMATS: readonly SupportedImportFormat[] = ["yaml", "json"];

/**
 * Resolves the effective import format. When an explicit `raw` is supplied,
 * it must be one of the supported formats. Otherwise the file extension is
 * used: `.yaml`/`.yml` → yaml, `.json` → json. Any other extension with no
 * explicit format raises a `CliValidationError`.
 */
export const parseCatalogImportFormat = (
  raw: string | undefined,
  filePath: string,
): SupportedImportFormat => {
  if (raw !== undefined) {
    if (raw === "yaml" || raw === "json") return raw;
    throw new CliValidationError(
      `Invalid --format "${raw}". Valid values: ${SUPPORTED_FORMATS.join(", ")} ` +
        "(CSV is not yet supported by the CLI).",
    );
  }
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".yaml" || ext === ".yml") return "yaml";
  if (ext === ".json") return "json";
  throw new CliValidationError(
    `Unable to infer catalog import format from extension "${ext || "(none)"}". ` +
      `Pass --format explicitly. Supported: ${SUPPORTED_FORMATS.join(", ")}.`,
  );
};

/**
 * Loads an import run by id or raises `CliValidationError`. Exported for
 * reuse by downstream commands (e.g. audit-run linkage).
 */
export const requireImportRun = (manager: DatabaseManager, runId: string): ImportRunRecord => {
  const found = manager.importRuns.findById(runId);
  if (!found) {
    throw new CliValidationError(`Unknown import run: "${runId}".`);
  }
  return found;
};
