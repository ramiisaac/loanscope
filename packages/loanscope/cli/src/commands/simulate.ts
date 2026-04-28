import { Command } from "commander";
import ora from "ora";
import { getAllProducts, filterDisplayProducts } from "@loanscope/products";
import { simulate } from "@loanscope/sim";
import type { SimulationPlan } from "@loanscope/sim";
import { loadYamlFile, parseConfig } from "@loanscope/config";
import type { Transaction } from "@loanscope/domain";
import { renderSimulationCSV, renderSimulationReport } from "../output";
import { CliValidationError } from "../cli-error";
import { findDefaultScenario, loadSimulationPlan, loadTransaction } from "../config-loaders";
import { parseCliOutputFormat } from "../format-parsers";
import { withOptionalManager } from "./db-helpers";
import { applyScenarioOverrides } from "./scenario-overrides";
import {
  assertCompatibleProducts,
  filterProductsByScenarioCompatibility,
} from "./scenario-compatibility";
import { loadScenarioFromDb, persistSimulationResult } from "./db";
import { renderJson } from "../output";

import {
  buildAuditErrorSummary,
  buildSimulateAuditSummary,
  completeAuditError,
  completeAuditSuccess,
  startAudit,
} from "./audit-actions";

interface SimulateOptions {
  config?: string;
  rate?: string;
  term?: string;
  program?: string;
  armFixed?: string;
  output?: string;
  save?: string;
  id?: string;
  fromDb?: string;
  audit?: boolean;
  path: string;
}

/** Recursively strips keys whose values are `undefined` so optional properties are omitted rather than explicitly set. */
const stripUndefined = <T extends Record<string, unknown>>(obj: T): T => {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined) continue;
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      result[key] = stripUndefined(value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }
  return result as T;
};

export const registerSimulateCommand = (program: Command): void => {
  program
    .command("simulate")
    .description("Run simulation actions to improve eligibility")
    .option("--config <file>", "Config file path")
    .option("--rate <rate>", "Override note rate")
    .option("--term <months>", "Override amortization term in months")
    .option(
      "--program <kind>",
      "Override program kind (Fixed|ARM|InterestOnly). ARM requires --arm-fixed.",
    )
    .option(
      "--arm-fixed <months>",
      "Override ARM fixed period (60|84|120). Requires --program ARM.",
    )
    .option("--output <format>", "Output format: table, json, or csv")
    .option("--save <name>", "Save simulation report to the database with this human-readable name")
    .option(
      "--id <slug>",
      "Explicit saved-simulation id (default: derived from --save plus a timestamp)",
    )
    .option("--from-db <scenarioId>", "Base simulation on a saved scenario from the database")
    .option("--audit", "Record an audit_sessions row capturing args and result summary", false)
    .option("--path <file>", "Database file path", "loanscope.db")
    .action((options: SimulateOptions, command: Command) => {
      const parentOpts =
        (command.parent?.opts() as { config?: string; output?: string } | undefined) ?? {};
      const configPath = options.config ?? parentOpts.config;

      // -----------------------------------------------------------------
      // Guards
      // -----------------------------------------------------------------
      if (options.fromDb !== undefined && configPath !== undefined) {
        throw new CliValidationError("--from-db and --config are mutually exclusive.");
      }
      if (options.save !== undefined && options.fromDb === undefined && configPath === undefined) {
        throw new CliValidationError("--save on simulate requires --config or --from-db.");
      }

      // -----------------------------------------------------------------
      // Open DatabaseManager once if needed. Lifecycle (including explicit
      // close on both success and error) is delegated to
      // `withOptionalManager` so the sqlite connection is released
      // deterministically regardless of outcome.
      // -----------------------------------------------------------------
      const needsDb =
        options.save !== undefined || options.fromDb !== undefined || options.audit === true;
      const dbPath = needsDb ? options.path : undefined;

      withOptionalManager(dbPath, (manager) => {
        // ---------------------------------------------------------------
        // Start audit session (if --audit) before any simulation work.
        // ---------------------------------------------------------------
        const argsPayload = {
          configPath,
          overrides: {
            rate: options.rate,
            term: options.term,
            program: options.program,
            armFixed: options.armFixed,
          },
          save: options.save,
          id: options.id,
          fromDb: options.fromDb,
        };
        const auditSessionId =
          options.audit === true && manager !== undefined
            ? startAudit(manager, {
                command: "simulate",
                argsPayload,
                ...(options.fromDb !== undefined ? { scenarioId: options.fromDb } : {}),
              }).sessionId
            : undefined;

        let phase: "evaluation" | "persistence" = "evaluation";
        const spinner = ora("Running simulation...").start();
        try {
          // -------------------------------------------------------------
          // Transaction loading branches
          // -------------------------------------------------------------
          let loadedTransaction: Transaction;
          let configPayloadForPersist: unknown | undefined;
          let simulationPlanForPersist: unknown | undefined;

          if (options.fromDb !== undefined) {
            const loaded = loadScenarioFromDb(manager!, options.fromDb);
            loadedTransaction = loaded.transaction;
            configPayloadForPersist = loaded.configPayload;
            // Try to extract simulation plan from the stored config
            const parsed = parseConfig(loaded.configPayload);
            if (parsed.simulation) {
              simulationPlanForPersist = parsed.simulation;
            }
          } else {
            loadedTransaction = loadTransaction(configPath);
            if (configPath !== undefined) {
              if (options.save !== undefined) {
                configPayloadForPersist = loadYamlFile(configPath);
              }
            } else {
              // No explicit config, will use default scenario
              if (options.save !== undefined) {
                try {
                  const defaultPath = findDefaultScenario();
                  configPayloadForPersist = loadYamlFile(defaultPath);
                } catch (_err: unknown) {
                  void _err;
                }
              }
            }
          }

          const transaction = applyScenarioOverrides(loadedTransaction, options);

          // Load simulation plan - either from stored config or from file
          let plan: ReturnType<typeof loadSimulationPlan>;
          if (options.fromDb !== undefined && simulationPlanForPersist) {
            plan = simulationPlanForPersist as ReturnType<typeof loadSimulationPlan>;
          } else {
            plan = loadSimulationPlan(configPath);
          }

          if (options.save !== undefined && simulationPlanForPersist === undefined) {
            simulationPlanForPersist = plan;
          }

          const cleanPlan = stripUndefined(plan) as SimulationPlan;
          const report = simulate(
            transaction,
            assertCompatibleProducts(
              filterProductsByScenarioCompatibility(
                filterDisplayProducts(getAllProducts()),
                transaction,
              ),
              transaction,
            ),
            cleanPlan,
          );
          spinner.stop();

          // -------------------------------------------------------------
          // Persistence (--save)
          // -------------------------------------------------------------
          let persistedSimulationId: string | undefined;
          if (options.save !== undefined) {
            phase = "persistence";
            const configPayload = {
              scenario: configPayloadForPersist,
              plan: simulationPlanForPersist,
            };
            const resultPayload = {
              report,
              capturedAt: new Date().toISOString(),
            };
            const persisted = persistSimulationResult(manager!, {
              name: options.save,
              ...(options.id !== undefined ? { id: options.id } : {}),
              ...(options.fromDb !== undefined ? { scenarioId: options.fromDb } : {}),
              configPayload,
              resultPayload,
            });
            persistedSimulationId = persisted.simulationId;
          }

          const output = parseCliOutputFormat(options.output ?? parentOpts.output ?? "table");
          if (output === "json") {
            console.log(renderJson(report));
          } else if (output === "csv") {
            console.log(renderSimulationCSV(report));
          } else {
            console.log(renderSimulationReport(report));
          }

          if (persistedSimulationId !== undefined) {
            console.log(`Saved simulation with id "${persistedSimulationId}".`);
          }

          // -------------------------------------------------------------
          // Audit success completion
          // -------------------------------------------------------------
          if (auditSessionId !== undefined && manager !== undefined) {
            completeAuditSuccess(
              manager,
              auditSessionId,
              buildSimulateAuditSummary(report, persistedSimulationId, options.fromDb),
            );
          }
        } catch (err) {
          spinner.stop();
          if (auditSessionId !== undefined && manager !== undefined) {
            completeAuditError(manager, auditSessionId, buildAuditErrorSummary(phase, err));
          }
          throw err;
        }
      });
    });
};
