import type { Command } from "commander";
import { seedLenders } from "@loanscope/db";
import type { LenderDefinitionInput } from "@loanscope/lenders";
import { getUWMLenderInput } from "@loanscope/lenders";
import { getAllLenders, uwmLender } from "@loanscope/products";
import { renderJson } from "../../output";
import { withManager } from "../db-helpers";
import { DEFAULT_DB_PATH } from "./constants";

const builtinLenderInputs = (): LenderDefinitionInput[] => {
  const channelLenders = getAllLenders()
    .filter((lender) => lender.id !== uwmLender.id)
    .map<LenderDefinitionInput>((lender) => ({
      id: lender.id,
      name: lender.name,
      products: lender.products,
      presets: [],
    }));

  return [...channelLenders, getUWMLenderInput()];
};

export const registerLenderCommands = (db: Command): void => {
  db.command("init")
    .description("Initialize the database (create schema)")
    .option("--path <file>", "Database file path", DEFAULT_DB_PATH)
    .action((options: { path: string }) => {
      const dbPath = options.path;
      return withManager(dbPath, (manager) => {
        console.log(`Database initialized at ${dbPath}`);
        const stats = manager.stats();
        console.log(
          `Tables ready. Current state: ${stats.lenders} lenders, ${stats.scenarios} scenarios`,
        );
      });
    });

  // loanscope db seed
  db.command("seed")
    .description("Seed all builtin lender catalogs into the database")
    .option("--path <file>", "Database file path", DEFAULT_DB_PATH)
    .action((options: { path: string }) => {
      const dbPath = options.path;
      return withManager(dbPath, (manager) => {
        seedLenders(manager.db, builtinLenderInputs());
        console.log("Seeded builtin lenders:");
        for (const id of manager.lenders.lenderIds()) {
          const products = manager.lenders.getProducts(id);
          const presets = manager.lenders.getPresets(id);
          console.log(`  ${id}: ${products.length} products, ${presets.length} presets`);
        }
      });
    });

  // loanscope db status
  db.command("status")
    .description("Show database status and statistics")
    .option("--path <file>", "Database file path", DEFAULT_DB_PATH)
    .option("--json", "Output as JSON", false)
    .action((options: { path: string; json: boolean }) => {
      const dbPath = options.path;
      return withManager(dbPath, (manager) => {
        const stats = manager.stats();
        if (options.json) {
          console.log(renderJson(stats));
        } else {
          console.log(`Database: ${dbPath}`);
          console.log(`  Lenders:             ${stats.lenders}`);
          console.log(`  Scenarios:           ${stats.scenarios}`);
          console.log(`  Scenario versions:   ${stats.scenarioVersions}`);
          console.log(`  Comparisons:         ${stats.comparisons}`);
          console.log(`  Simulations:         ${stats.simulations}`);
          console.log(`  Custom product sets: ${stats.customProductSets}`);
          console.log(`  Import runs:         ${stats.importRuns}`);
          console.log(`  Audit sessions:      ${stats.auditSessions}`);
        }
      });
    });

  // loanscope db list-lenders
  db.command("list-lenders")
    .description("List all lenders in the database")
    .option("--path <file>", "Database file path", DEFAULT_DB_PATH)
    .option("--json", "Output as JSON", false)
    .action((options: { path: string; json: boolean }) => {
      const dbPath = options.path;
      return withManager(dbPath, (manager) => {
        const allLenders = manager.lenders.getAllLenders();
        if (options.json) {
          console.log(
            JSON.stringify(
              allLenders.map((l) => ({
                id: l.id,
                name: l.name,
                productCount: l.products.length,
              })),
              null,
              2,
            ),
          );
        } else {
          if (allLenders.length === 0) {
            console.log("No lenders found. Run `loanscope db seed` first.");
            return;
          }
          for (const lender of allLenders) {
            const presets = manager.lenders.getPresets(lender.id);
            console.log(`${lender.id} — ${lender.name}`);
            console.log(`  Products: ${lender.products.length}`);
            console.log(`  Presets:  ${presets.length}`);
            for (const preset of presets) {
              console.log(
                `    ${preset.id}: ${preset.name} (${preset.productIds.length} products)`,
              );
            }
          }
        }
      });
    });
};
