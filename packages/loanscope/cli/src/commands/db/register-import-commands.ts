import type { Command } from "commander";
import { withManager } from "../db-helpers";
import { CliValidationError } from "../../cli-error";
import { renderJson } from "../../output";
import {
  importCatalogAction,
  listCatalogHistoryAction,
  listImportRunsAction,
  showImportRunAction,
  type SupportedImportFormat,
} from "../import";
import { DEFAULT_DB_PATH } from "./constants";

export const registerImportCommands = (db: Command): void => {
  db.command("import")
    .description(
      "Import a lender product catalog from a YAML or JSON file. Writes " +
        "import_runs + catalog_versions + product_catalogs atomically.",
    )
    .requiredOption("--lender <id>", "Target lender id (must already exist)")
    .requiredOption(
      "--file <path>",
      "Path to a .yaml, .yml, or .json file with a top-level `products` array",
    )
    .option(
      "--format <format>",
      "Explicit input format: yaml or json (default: inferred from file extension)",
    )
    .option("--json", "Emit the import summary as JSON", false)
    .option("--path <file>", "Database file path", DEFAULT_DB_PATH)
    .action(
      (options: { lender: string; file: string; format?: string; json: boolean; path: string }) => {
        let format: SupportedImportFormat | undefined;
        if (options.format !== undefined) {
          if (options.format !== "yaml" && options.format !== "json") {
            throw new CliValidationError(
              `Invalid --format "${options.format}". Valid values: yaml, json.`,
            );
          }
          format = options.format;
        }
        return withManager(options.path, (manager) => {
          const result = importCatalogAction(manager, {
            lenderId: options.lender,
            filePath: options.file,
            ...(format !== undefined ? { format } : {}),
          });
          if (options.json) {
            console.log(renderJson(result));
            return;
          }
          console.log(
            `Import ${result.status} — run ${result.runId} ` +
              `(${result.productsImported} imported, ${result.productsFailed} failed).`,
          );
          if (result.version !== null) {
            console.log(
              `  Catalog version v${result.version} [id ${result.catalogVersionId ?? "?"}]`,
            );
          }
          console.log(`  Source: ${result.sourceFile} (${result.sourceFormat})`);
          console.log(`  Hash:   ${result.contentHash}`);
          if (result.errorLog.length > 0) {
            console.log("  Errors:");
            for (const entry of result.errorLog) {
              console.log(`    - ${entry}`);
            }
          }
        });
      },
    );

  // loanscope db list-import-runs
  db.command("list-import-runs")
    .description("List catalog import runs, optionally filtered by lender")
    .option("--lender <id>", "Filter to a specific lender id")
    .option("--json", "Output as JSON", false)
    .option("--path <file>", "Database file path", DEFAULT_DB_PATH)
    .action((options: { lender?: string; json: boolean; path: string }) => {
      return withManager(options.path, (manager) => {
        const rendered = listImportRunsAction(manager, {
          ...(options.lender !== undefined ? { lenderId: options.lender } : {}),
          output: options.json ? "json" : "text",
        });
        console.log(rendered);
      });
    });

  // loanscope db show-import-run
  db.command("show-import-run")
    .description("Show full detail for a catalog import run, including errors")
    .argument("<runId>", "Import run id")
    .option("--json", "Emit full record as JSON", false)
    .option("--path <file>", "Database file path", DEFAULT_DB_PATH)
    .action((runId: string, options: { json: boolean; path: string }) => {
      return withManager(options.path, (manager) => {
        const rendered = showImportRunAction(manager, {
          runId,
          output: options.json ? "json" : "text",
        });
        console.log(rendered);
      });
    });

  // loanscope db catalog-history
  db.command("catalog-history")
    .description("List every persisted catalog version for a lender")
    .requiredOption("--lender <id>", "Lender id")
    .option("--json", "Output as JSON", false)
    .option("--path <file>", "Database file path", DEFAULT_DB_PATH)
    .action((options: { lender: string; json: boolean; path: string }) => {
      return withManager(options.path, (manager) => {
        const rendered = listCatalogHistoryAction(manager, {
          lenderId: options.lender,
          output: options.json ? "json" : "text",
        });
        console.log(rendered);
      });
    });
};
