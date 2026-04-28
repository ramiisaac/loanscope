import type { Command } from "commander";
import { withManager } from "../db-helpers";
import {
  deleteComparisonAction,
  listComparisonsAction,
  renameComparisonAction,
  showComparisonAction,
} from "./index";
import { DEFAULT_DB_PATH } from "./constants";

export const registerComparisonCommands = (db: Command): void => {
  db.command("list-comparisons")
    .description("List all saved comparisons")
    .option("--path <file>", "Database file path", DEFAULT_DB_PATH)
    .option("--json", "Output as JSON", false)
    .action((options: { path: string; json: boolean }) => {
      return withManager(options.path, (manager) => {
        const rendered = listComparisonsAction(manager, { output: options.json ? "json" : "text" });
        console.log(rendered);
      });
    });

  // loanscope db show-comparison
  db.command("show-comparison")
    .description("Show metadata (and optionally the result payload) for a saved comparison")
    .argument("<comparisonId>", "Comparison id")
    .option("--json", "Emit full record as JSON, including the result payload", false)
    .option("--path <file>", "Database file path", DEFAULT_DB_PATH)
    .action((comparisonId: string, options: { json: boolean; path: string }) => {
      return withManager(options.path, (manager) => {
        const rendered = showComparisonAction(manager, {
          comparisonId,
          output: options.json ? "json" : "text",
        });
        console.log(rendered);
      });
    });

  // loanscope db rename-comparison
  db.command("rename-comparison")
    .description("Rename a saved comparison")
    .argument("<comparisonId>", "Comparison id")
    .requiredOption("--name <name>", "New comparison name")
    .option("--path <file>", "Database file path", DEFAULT_DB_PATH)
    .action((comparisonId: string, options: { name: string; path: string }) => {
      return withManager(options.path, (manager) => {
        const message = renameComparisonAction(manager, {
          comparisonId,
          name: options.name,
        });
        console.log(message);
      });
    });

  // loanscope db delete-comparison
  db.command("delete-comparison")
    .description("Delete a saved comparison")
    .argument("<comparisonId>", "Comparison id")
    .option("--path <file>", "Database file path", DEFAULT_DB_PATH)
    .action((comparisonId: string, options: { path: string }) => {
      return withManager(options.path, (manager) => {
        const message = deleteComparisonAction(manager, { comparisonId });
        console.log(message);
      });
    });
};
