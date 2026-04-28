import { Command } from "commander";
import { buildScopedResponse, evaluate, evaluateAll } from "@loanscope/engine";
import { loadConfigFile, loadYamlFile, parseConfig } from "@loanscope/config";
import { renderEvaluationCSV, renderEvaluationTable, renderJson } from "../output";
import { renderScopeAnalysis } from "../output";
import { runInteractive } from "../interactive";
import type { ProductSourceSelection, Transaction } from "@loanscope/domain";
import { CliValidationError } from "../cli-error";
import { loadTransaction, findDefaultScenario } from "../config-loaders";
import { parseCliOutputFormat } from "../format-parsers";
import { withOptionalManager } from "./db-helpers";
import { applyScenarioOverrides } from "./scenario-overrides";
import { selectProductsForTransaction } from "./select-products";
import {
  buildQuickQuoteConfigPayloadFromTransaction,
  loadScenarioFromDb,
  persistScenarioResult,
} from "./db";
import {
  buildAuditErrorSummary,
  buildEvaluateAuditSummary,
  completeAuditError,
  completeAuditSuccess,
  startAudit,
} from "./audit-actions";

interface EvaluateOptions {
  config?: string;
  verbose?: boolean;
  output?: string;
  quiet?: boolean;
  interactive?: boolean;
  rate?: string;
  term?: string;
  program?: string;
  armFixed?: string;
  lender?: string;
  products?: string;
  productSource?: string;
  save?: string;
  id?: string;
  description?: string;
  fromDb?: string;
  audit?: boolean;
  path: string;
}

export const registerEvaluateCommand = (program: Command): void => {
  program
    .command("evaluate")
    .description("Evaluate a full underwriting scenario")
    .option("--config <file>", "Config file path")
    .option("--verbose", "Verbose output", false)
    .option("--output <format>", "Output format: table, json, or csv")
    .option("--quiet", "Suppress scope output", false)
    .option("--interactive", "Run interactive prompts", false)
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
    .option("--lender <id>", "Filter by lender id")
    .option("--products <list>", "Comma-separated product ids to include")
    .option("--product-source <kind>", "Product source: generic, preset, or custom")
    .option("--save <name>", "Save evaluation to the database with this human-readable name")
    .option(
      "--id <slug>",
      "Explicit saved-scenario id (default: derived from --save plus a timestamp)",
    )
    .option("--description <text>", "Description for the saved scenario")
    .option(
      "--from-db <scenarioId>",
      "Load scenario from the database instead of --config or --interactive",
    )
    .option("--audit", "Record an audit_sessions row capturing args and result summary", false)
    .option("--path <file>", "Database file path", "loanscope.db")
    .action(async (options: EvaluateOptions, command: Command) => {
      const parentOpts =
        (command.parent?.opts() as
          | {
              config?: string;
              output?: string;
              verbose?: boolean;
              quiet?: boolean;
            }
          | undefined) ?? {};
      const configPath = options.config ?? parentOpts.config;

      // -----------------------------------------------------------------
      // Guards (contract decisions from the implementation plan)
      // -----------------------------------------------------------------
      if (options.fromDb !== undefined && configPath !== undefined) {
        throw new CliValidationError("--from-db and --config are mutually exclusive.");
      }
      if (options.fromDb !== undefined && options.interactive === true) {
        throw new CliValidationError("--from-db and --interactive are mutually exclusive.");
      }
      if (
        options.save !== undefined &&
        options.fromDb === undefined &&
        configPath === undefined &&
        options.interactive !== true
      ) {
        throw new CliValidationError("--save requires --config, --from-db, or --interactive.");
      }

      // -----------------------------------------------------------------
      // Open the DatabaseManager at most once per invocation. Lifecycle
      // (including explicit close on both success and error) is delegated
      // to `withOptionalManager` so the sqlite connection is released
      // deterministically regardless of outcome.
      // -----------------------------------------------------------------
      const needsDb =
        options.save !== undefined || options.fromDb !== undefined || options.audit === true;
      const dbPath = needsDb ? options.path : undefined;

      await withOptionalManager(dbPath, async (manager) => {
        // ---------------------------------------------------------------
        // Start audit session (if --audit) before any evaluation work. The
        // args payload is captured here so even an evaluation-phase throw
        // leaves a record of what was requested.
        // ---------------------------------------------------------------
        const argsPayload = {
          configPath,
          overrides: {
            rate: options.rate,
            term: options.term,
            program: options.program,
            armFixed: options.armFixed,
            lender: options.lender,
            products: options.products,
            productSource: options.productSource,
          },
          interactive: options.interactive === true,
          save: options.save,
          id: options.id,
          description: options.description,
          fromDb: options.fromDb,
        };
        const auditSessionId =
          options.audit === true && manager !== undefined
            ? startAudit(manager, {
                command: "evaluate",
                argsPayload,
                ...(options.fromDb !== undefined ? { scenarioId: options.fromDb } : {}),
              }).sessionId
            : undefined;

        // Everything from scenario load through persistence is wrapped so
        // the audit row's phase reflects exactly where the failure
        // originated.
        let phase: "evaluation" | "persistence" = "evaluation";
        try {
          // -------------------------------------------------------------
          // Transaction loading branches
          // -------------------------------------------------------------
          let loadedTransaction: Transaction;
          let configPayloadForPersist: unknown | undefined;
          let configProductSource: ProductSourceSelection | undefined;

          if (options.fromDb !== undefined) {
            // --from-db: read stored configPayload, reconstruct Transaction
            const loaded = loadScenarioFromDb(manager!, options.fromDb);
            loadedTransaction = loaded.transaction;
            configPayloadForPersist = loaded.configPayload;
            configProductSource = parseConfig(loaded.configPayload).productSource;
          } else if (options.interactive === true) {
            // --interactive: build transaction via prompts
            loadedTransaction = await runInteractive();
            if (options.save !== undefined) {
              configPayloadForPersist =
                buildQuickQuoteConfigPayloadFromTransaction(loadedTransaction);
            }
          } else {
            // --config (explicit) or default scenario
            loadedTransaction = loadTransaction(configPath);
            if (configPath !== undefined) {
              if (options.save !== undefined) {
                configPayloadForPersist = loadYamlFile(configPath);
              }
              const parsed = loadConfigFile(configPath);
              configProductSource = parsed.productSource;
            } else {
              try {
                const defaultPath = findDefaultScenario();
                const parsed = loadConfigFile(defaultPath);
                configProductSource = parsed.productSource;
                if (options.save !== undefined) {
                  configPayloadForPersist = loadYamlFile(defaultPath);
                }
              } catch (_err: unknown) {
                /* Default scenario may not exist; proceed without config-level source. */
                void _err;
              }
            }
          }

          const transaction = applyScenarioOverrides(loadedTransaction, options);

          const { products, effectiveSource } = selectProductsForTransaction(
            transaction,
            {
              ...(options.lender !== undefined ? { lender: options.lender } : {}),
              ...(options.products !== undefined ? { products: options.products } : {}),
              ...(options.productSource !== undefined
                ? { productSource: options.productSource }
                : {}),
            },
            configProductSource,
          );

          const groups = evaluateAll(transaction, products);
          const output = parseCliOutputFormat(options.output ?? parentOpts.output ?? "table");
          const verbose = options.verbose ?? parentOpts.verbose ?? false;
          const quiet = options.quiet ?? parentOpts.quiet ?? false;

          const variant = transaction.variants[0];
          const sampleProduct = products[0];
          const scoped =
            variant && sampleProduct
              ? buildScopedResponse(
                  transaction,
                  [sampleProduct],
                  evaluate(transaction, variant, sampleProduct),
                )
              : undefined;

          // -------------------------------------------------------------
          // Persistence (--save) — runs before output so any failure
          // surfaces before the user sees a success-shaped render.
          // Transitioning into the persistence phase here ensures an
          // audit throw tags the right phase regardless of which branch
          // (updateResult vs persistScenario) threw.
          // -------------------------------------------------------------
          let persistedScenarioId: string | undefined;
          if (options.save !== undefined) {
            phase = "persistence";
            const resultPayload = {
              groups,
              scope: scoped,
              productSource: effectiveSource,
              capturedAt: new Date().toISOString(),
            };
            if (options.fromDb !== undefined) {
              // Update the existing saved-scenario row's result payload.
              manager!.scenarios.updateResult(options.fromDb, resultPayload);
              persistedScenarioId = options.fromDb;
            } else {
              if (configPayloadForPersist === undefined) {
                // Defensive — guards above should make this unreachable.
                throw new CliValidationError(
                  "Internal error: --save could not capture a config payload.",
                );
              }
              const persisted = persistScenarioResult(manager!, {
                name: options.save,
                ...(options.id !== undefined ? { id: options.id } : {}),
                ...(options.description !== undefined ? { description: options.description } : {}),
                configPayload: configPayloadForPersist,
                resultPayload,
              });
              persistedScenarioId = persisted.scenarioId;
            }
          }

          if (output === "json") {
            console.log(renderJson({ groups, scope: scoped, productSource: effectiveSource }));
          } else if (output === "csv") {
            console.log(renderEvaluationCSV(groups));
          } else {
            console.log(renderEvaluationTable(groups, Boolean(verbose)));
            if (!quiet && scoped) {
              console.log(renderScopeAnalysis(scoped));
            }
          }

          if (persistedScenarioId !== undefined) {
            console.log(`Saved evaluation to scenario "${persistedScenarioId}".`);
          }

          // -------------------------------------------------------------
          // Audit success completion — runs after both the core
          // evaluation and the persistence write (if any) so
          // `persistedScenarioId` is threaded into the summary.
          // -------------------------------------------------------------
          if (auditSessionId !== undefined && manager !== undefined) {
            completeAuditSuccess(
              manager,
              auditSessionId,
              buildEvaluateAuditSummary({
                groups,
                ...(persistedScenarioId !== undefined ? { persistedScenarioId } : {}),
              }),
            );
          }
        } catch (err) {
          if (auditSessionId !== undefined && manager !== undefined) {
            completeAuditError(manager, auditSessionId, buildAuditErrorSummary(phase, err));
          }
          throw err;
        }
      });
    });
};
