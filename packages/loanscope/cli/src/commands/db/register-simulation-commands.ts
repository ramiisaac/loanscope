import type { Command } from "commander";
import { withManager } from "../db-helpers";
import {
  deleteSimulationAction,
  listSimulationsAction,
  renameSimulationAction,
  showSimulationAction,
} from "./index";
import { DEFAULT_DB_PATH } from "./constants";

export const registerSimulationCommands = (db: Command): void => {
  db.command("list-simulations")
    .description("List all saved simulations")
    .option("--path <file>", "Database file path", DEFAULT_DB_PATH)
    .option("--json", "Output as JSON", false)
    .action((options: { path: string; json: boolean }) => {
      return withManager(options.path, (manager) => {
        const rendered = listSimulationsAction(manager, { output: options.json ? "json" : "text" });
        console.log(rendered);
      });
    });

  // loanscope db show-simulation
  db.command("show-simulation")
    .description("Show metadata (and optionally the result payload) for a saved simulation")
    .argument("<simulationId>", "Simulation id")
    .option("--json", "Emit full record as JSON, including the result payload", false)
    .option("--path <file>", "Database file path", DEFAULT_DB_PATH)
    .action((simulationId: string, options: { json: boolean; path: string }) => {
      return withManager(options.path, (manager) => {
        const rendered = showSimulationAction(manager, {
          simulationId,
          output: options.json ? "json" : "text",
        });
        console.log(rendered);
      });
    });

  // loanscope db rename-simulation
  db.command("rename-simulation")
    .description("Rename a saved simulation")
    .argument("<simulationId>", "Simulation id")
    .requiredOption("--name <name>", "New simulation name")
    .option("--path <file>", "Database file path", DEFAULT_DB_PATH)
    .action((simulationId: string, options: { name: string; path: string }) => {
      return withManager(options.path, (manager) => {
        const message = renameSimulationAction(manager, {
          simulationId,
          name: options.name,
        });
        console.log(message);
      });
    });

  // loanscope db delete-simulation
  db.command("delete-simulation")
    .description("Delete a saved simulation")
    .argument("<simulationId>", "Simulation id")
    .option("--path <file>", "Database file path", DEFAULT_DB_PATH)
    .action((simulationId: string, options: { path: string }) => {
      return withManager(options.path, (manager) => {
        const message = deleteSimulationAction(manager, { simulationId });
        console.log(message);
      });
    });
};
