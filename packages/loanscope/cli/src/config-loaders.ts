// Scenario / transaction / simulation-plan loaders for the CLI.
//
// All three loaders share the same fallback strategy: if no explicit
// `--config` path is provided, locate the bundled `default.yaml` via
// `findDefaultScenario` so smoke commands work out of the box.

import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { quickQuoteToTransaction } from "@loanscope/engine";
import { loadConfigFile } from "@loanscope/config";
import type { SimulationPlanSchema } from "@loanscope/config";
import type { Transaction } from "@loanscope/domain";
import { CliValidationError } from "./cli-error";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const findDefaultScenario = (): string => {
  const candidates = [
    path.resolve(__dirname, "..", "..", "scenarios", "default.yaml"),
    path.resolve(__dirname, "..", "scenarios", "default.yaml"),
    path.resolve(process.cwd(), "packages", "mortgage", "scenarios", "default.yaml"),
    path.resolve(process.cwd(), "scenarios", "default.yaml"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new CliValidationError(`Default scenario not found. Tried: ${candidates.join(", ")}`);
};

export const loadTransaction = (configPath?: string): Transaction => {
  const finalPath = configPath ?? findDefaultScenario();
  const parsed = loadConfigFile(finalPath);
  const transaction =
    parsed.transaction ??
    (parsed.quickQuote ? quickQuoteToTransaction(parsed.quickQuote) : undefined);
  if (!transaction) {
    throw new CliValidationError(
      `Config file at ${finalPath} must include 'transaction' or 'quickQuote'`,
    );
  }
  return transaction;
};

export const loadSimulationPlan = (configPath?: string): SimulationPlanSchema => {
  const finalPath = configPath ?? findDefaultScenario();
  const parsed = loadConfigFile(finalPath);
  if (!parsed.simulation) {
    throw new CliValidationError(`Config file at ${finalPath} must include 'simulation' plan`);
  }
  return parsed.simulation;
};
