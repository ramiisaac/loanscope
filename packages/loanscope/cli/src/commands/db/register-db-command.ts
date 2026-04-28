import type { Command } from "commander";
import { registerLenderCommands } from "./register-lender-commands";
import { registerScenarioCommands } from "./register-scenario-commands";
import { registerComparisonCommands } from "./register-comparison-commands";
import { registerSimulationCommands } from "./register-simulation-commands";
import { registerCustomProductCommands } from "./register-custom-product-commands";
import { registerImportCommands } from "./register-import-commands";
import { registerAuditCommands } from "./register-audit-commands";

/**
 * Top-level registrar for the `loanscope db` command tree. Constructs
 * the parent `db` command on `program` and delegates each sub-tree
 * (lenders / scenarios / comparisons / simulations / custom-products /
 * imports / audits) to its own registrar so each lives in a focused
 * file rather than a single 900-LOC monolith.
 */
export const registerDbCommand = (program: Command): void => {
  const db = program.command("db").description("Database management commands");

  registerLenderCommands(db);
  registerScenarioCommands(db);
  registerComparisonCommands(db);
  registerSimulationCommands(db);
  registerCustomProductCommands(db);
  registerImportCommands(db);
  registerAuditCommands(db);
};
