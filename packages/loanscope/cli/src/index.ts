#!/usr/bin/env node
import { Command } from "commander";
import { createRequire } from "node:module";
import { registerQuoteCommand } from "./commands/quote";
import { registerEvaluateCommand } from "./commands/evaluate";
import { registerCompareCommand } from "./commands/compare";
import { registerGoalseekCommand } from "./commands/goalseek";
import { registerSimulateCommand } from "./commands/simulate";
import { registerDbCommand } from "./commands/db";
import { registerDiffCommand } from "./commands/diff";
import { registerBatchCommand } from "./commands/batch";
import { registerExportScenarioCommand } from "./commands/export-scenario";

const require = createRequire(import.meta.url);
const pkg = require("../package.json") as { version: string };

const program = new Command();

program
  .name("loanscope")
  .description("LoanScope — Mortgage Underwriting Engine CLI")
  .version(pkg.version)
  .option("--config <file>", "Config file path")
  .option("--verbose", "Verbose output", false)
  .option("--output <format>", "Output format: table, json, or csv", "table")
  .option("--quiet", "Suppress non-essential output", false);

registerQuoteCommand(program);
registerEvaluateCommand(program);
registerCompareCommand(program);
registerGoalseekCommand(program);
registerSimulateCommand(program);
registerDbCommand(program);
registerDiffCommand(program);
registerBatchCommand(program);
registerExportScenarioCommand(program);

const argv = [...process.argv];
if (argv[2] === "--") {
  argv.splice(2, 1);
}

program.parseAsync(argv).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
