import type { Command } from "commander";
import { withManager } from "../db-helpers";
import {
  createCustomProductSetAction,
  deleteCustomProductSetAction,
  listCustomProductSetsAction,
  showCustomProductSetAction,
  validateCustomProductSetAction,
} from "../custom-product";
import { DEFAULT_DB_PATH } from "./constants";

export const registerCustomProductCommands = (db: Command): void => {
  const cp = db.command("custom-product").description("Manage custom product sets");

  // loanscope db custom-product create
  cp.command("create")
    .description("Create a custom product set from a YAML or JSON product file")
    .requiredOption(
      "--file <path>",
      "Path to a .yaml, .yml, or .json file with a top-level `products` array",
    )
    .requiredOption("--name <name>", "Human-readable set name")
    .option(
      "--set-id <slug>",
      "Explicit set id (default: derived from --name plus a timestamp suffix)",
    )
    .option("--lender <id>", "Optional lender id to associate with the set")
    .option("--path <file>", "Database file path", DEFAULT_DB_PATH)
    .action(
      (options: { file: string; name: string; setId?: string; lender?: string; path: string }) => {
        return withManager(options.path, (manager) => {
          const result = createCustomProductSetAction(manager, {
            filePath: options.file,
            name: options.name,
            ...(options.setId !== undefined ? { setId: options.setId } : {}),
            ...(options.lender !== undefined ? { lenderId: options.lender } : {}),
          });
          console.log(
            `Created custom product set "${result.name}" with id ${result.setId} ` +
              `(${result.productCount} products, status: ${result.validationStatus}).`,
          );
        });
      },
    );

  // loanscope db custom-product list
  cp.command("list")
    .description("List all custom product sets")
    .option("--json", "Output as JSON", false)
    .option("--path <file>", "Database file path", DEFAULT_DB_PATH)
    .action((options: { json: boolean; path: string }) => {
      return withManager(options.path, (manager) => {
        const rendered = listCustomProductSetsAction(manager, {
          output: options.json ? "json" : "text",
        });
        console.log(rendered);
      });
    });

  // loanscope db custom-product show
  cp.command("show")
    .description("Show metadata (and optionally the products) for a custom product set")
    .argument("<setId>", "Custom product set id")
    .option("--json", "Emit full record as JSON, including the product payload", false)
    .option("--path <file>", "Database file path", DEFAULT_DB_PATH)
    .action((setId: string, options: { json: boolean; path: string }) => {
      return withManager(options.path, (manager) => {
        const rendered = showCustomProductSetAction(manager, {
          setId,
          output: options.json ? "json" : "text",
        });
        console.log(rendered);
      });
    });

  // loanscope db custom-product validate
  cp.command("validate")
    .description("Re-run structural validation for a custom product set and persist the status")
    .argument("<setId>", "Custom product set id")
    .option("--path <file>", "Database file path", DEFAULT_DB_PATH)
    .action((setId: string, options: { path: string }) => {
      return withManager(options.path, (manager) => {
        const result = validateCustomProductSetAction(manager, { setId });
        console.log(result.message);
      });
    });

  // loanscope db custom-product delete
  cp.command("delete")
    .description("Delete a custom product set")
    .argument("<setId>", "Custom product set id")
    .option("--path <file>", "Database file path", DEFAULT_DB_PATH)
    .action((setId: string, options: { path: string }) => {
      return withManager(options.path, (manager) => {
        const message = deleteCustomProductSetAction(manager, { setId });
        console.log(message);
      });
    });
};
