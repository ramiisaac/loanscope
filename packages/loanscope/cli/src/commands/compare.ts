import { Command } from "commander";
import type { ProductSourceSelection, Transaction } from "@loanscope/domain";
import { ComparisonGridBuilder, executeGrid, gridToCSV, summarizeGrid } from "@loanscope/compare";
import { getAllProducts, filterDisplayProducts } from "@loanscope/products";
import { loadConfigFile, loadYamlFile, parseConfig } from "@loanscope/config";
import { renderGridTable, renderJson } from "../output";
import { CliValidationError } from "../cli-error";
import { loadTransaction, findDefaultScenario } from "../config-loaders";
import { parseCliOutputFormat } from "../format-parsers";
import { withOptionalManager } from "./db-helpers";
import { parseCompareGridOptions, type CompareGridOptionFlags } from "./compare-grid-options";
import { applyScenarioOverrides } from "./scenario-overrides";
import {
  buildProductSourceFromFlags,
  filterByProductSource,
  resolveProductSource,
} from "./product-source";
import {
  assertCompatibleProducts,
  filterProductsByScenarioCompatibility,
} from "./scenario-compatibility";
import { loadScenarioFromDb, persistComparisonResult } from "./db";
import {
  buildAuditErrorSummary,
  buildCompareAuditSummary,
  completeAuditError,
  completeAuditSuccess,
  startAudit,
} from "./audit-actions";

interface CompareOptions extends CompareGridOptionFlags {
  config?: string;
  rate?: string;
  term?: string;
  program?: string;
  armFixed?: string;
  productSource?: string;
  output?: string;
  save?: string;
  id?: string;
  fromDb?: string;
  audit?: boolean;
  path: string;
}

export const registerCompareCommand = (program: Command): void => {
  program
    .command("compare")
    .description("Compare products over a grid of inputs")
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
    .option("--terms <list>", "Comma-separated terms in months")
    .option("--rates <list>", "Comma-separated rates")
    .option("--ltv <range>", "LTV range min:max:step")
    .option("--loan-amount <range>", "Loan amount range min:max:step")
    .option("--occupancy <list>", "Comma-separated occupancies")
    .option("--fico <list>", "Comma-separated FICO scores")
    .option("--down-payment <range>", "Down payment range min:max:step")
    .option("--property-type <list>", "Comma-separated property types")
    .option("--purpose <list>", "Comma-separated loan purposes")
    .option("--products <list>", "Comma-separated product ids")
    .option("--lenders <list>", "Comma-separated lender ids")
    .option("--product-source <kind>", "Product source: generic, preset, or custom")
    .option(
      "--borrowers <set>",
      'Borrower id sets (repeatable, ids separated by "," or "|")',
      (value: string, previous: string[]) => [...previous, value],
      [] as string[],
    )
    .option("--output <format>", "Output format: table, json, or csv")
    .option("--save <name>", "Save comparison grid to the database with this human-readable name")
    .option(
      "--id <slug>",
      "Explicit saved-comparison id (default: derived from --save plus a timestamp)",
    )
    .option("--from-db <scenarioId>", "Base comparison on a saved scenario from the database")
    .option("--audit", "Record an audit_sessions row capturing args and result summary", false)
    .option("--path <file>", "Database file path", "loanscope.db")
    .action((options: CompareOptions, command: Command) => {
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
        throw new CliValidationError("--save on compare requires --config or --from-db.");
      }

      // -----------------------------------------------------------------
      // Open DatabaseManager once if needed. Lifecycle (including
      // explicit close on both success and error) is delegated to
      // `withOptionalManager` so the sqlite connection is released
      // deterministically regardless of outcome.
      // -----------------------------------------------------------------
      const needsDb =
        options.save !== undefined || options.fromDb !== undefined || options.audit === true;
      const dbPath = needsDb ? options.path : undefined;

      withOptionalManager(dbPath, (manager) => {
        // ---------------------------------------------------------------
        // Start audit session (if --audit) before any comparison work.
        // ---------------------------------------------------------------
        const argsPayload = {
          configPath,
          overrides: {
            rate: options.rate,
            term: options.term,
            program: options.program,
            armFixed: options.armFixed,
          },
          grid: {
            terms: options.terms,
            rates: options.rates,
            ltv: options.ltv,
            loanAmount: options.loanAmount,
            occupancy: options.occupancy,
            fico: options.fico,
            downPayment: options.downPayment,
            propertyType: options.propertyType,
            purpose: options.purpose,
            borrowers: options.borrowers,
            products: options.products,
            lenders: options.lenders,
            productSource: options.productSource,
          },
          save: options.save,
          id: options.id,
          fromDb: options.fromDb,
        };
        const auditSessionId =
          options.audit === true && manager !== undefined
            ? startAudit(manager, {
                command: "compare",
                argsPayload,
                ...(options.fromDb !== undefined ? { scenarioId: options.fromDb } : {}),
              }).sessionId
            : undefined;

        let phase: "evaluation" | "persistence" = "evaluation";
        try {
          // -------------------------------------------------------------
          // Transaction loading branches
          // -------------------------------------------------------------
          let loadedTransaction: Transaction;
          let configPayloadForPersist: unknown | undefined;
          let configProductSource: ProductSourceSelection | undefined;

          if (options.fromDb !== undefined) {
            const loaded = loadScenarioFromDb(manager!, options.fromDb);
            loadedTransaction = loaded.transaction;
            configPayloadForPersist = loaded.configPayload;
            configProductSource = parseConfig(loaded.configPayload).productSource;
          } else {
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
                void _err;
              }
            }
          }

          const transaction = applyScenarioOverrides(loadedTransaction, options);

          const flagSource = buildProductSourceFromFlags(options);
          const effectiveSource = resolveProductSource(flagSource, configProductSource);

          const allDisplayProducts = filterDisplayProducts(getAllProducts());

          const sourceFilteredProducts = assertCompatibleProducts(
            filterProductsByScenarioCompatibility(
              filterByProductSource(allDisplayProducts, effectiveSource),
              transaction,
            ),
            transaction,
          );

          const allProductIds = sourceFilteredProducts.map((p) => p.id);
          const allLenderIds = [
            ...new Set(sourceFilteredProducts.map((p) => p.lenderId).filter(Boolean)),
          ] as string[];

          const builder = ComparisonGridBuilder.fromTransaction(transaction);
          const gridSpec = parseCompareGridOptions({
            options,
            allProductIds,
            allLenderIds,
            hasFlagSource: flagSource !== undefined,
          });
          for (const dimension of gridSpec) {
            builder.withDimension(dimension);
          }

          const grid = builder.build();
          const products = sourceFilteredProducts;
          const result = executeGrid(grid, products);
          const output = parseCliOutputFormat(options.output ?? parentOpts.output ?? "table");

          // -------------------------------------------------------------
          // Persistence (--save)
          // -------------------------------------------------------------
          let persistedComparisonId: string | undefined;
          const summary = summarizeGrid(result);
          if (options.save !== undefined) {
            phase = "persistence";
            const gridFlags = {
              terms: options.terms,
              rates: options.rates,
              ltv: options.ltv,
              loanAmount: options.loanAmount,
              occupancy: options.occupancy,
              fico: options.fico,
              downPayment: options.downPayment,
              propertyType: options.propertyType,
              purpose: options.purpose,
              borrowers: options.borrowers,
              products: options.products,
              lenders: options.lenders,
              productSource: options.productSource,
            };
            const configPayload = {
              scenario: configPayloadForPersist,
              gridFlags,
            };
            const resultPayload = {
              result,
              summary,
              capturedAt: new Date().toISOString(),
            };
            const persisted = persistComparisonResult(manager!, {
              name: options.save,
              ...(options.id !== undefined ? { id: options.id } : {}),
              ...(options.fromDb !== undefined ? { scenarioId: options.fromDb } : {}),
              configPayload,
              resultPayload,
            });
            persistedComparisonId = persisted.comparisonId;
          }

          if (output === "json") {
            console.log(renderJson({ ...result, productSource: effectiveSource }));
          } else if (output === "csv") {
            console.log(gridToCSV(result));
          } else {
            console.log(renderGridTable(result));
          }

          if (persistedComparisonId !== undefined) {
            console.log(`Saved comparison with id "${persistedComparisonId}".`);
          }

          // -------------------------------------------------------------
          // Audit success completion
          // -------------------------------------------------------------
          if (auditSessionId !== undefined && manager !== undefined) {
            completeAuditSuccess(
              manager,
              auditSessionId,
              buildCompareAuditSummary(summary, persistedComparisonId, options.fromDb),
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
