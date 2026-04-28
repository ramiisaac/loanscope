import { Command } from "commander";
import { CliValidationError } from "../cli-error";
import { resolvePayloadFormat } from "./db-helpers/resolve-payload-format";
import { withOptionalManager } from "./db-helpers";
import {
  exportScenarioAction,
  type ExportScenarioInput,
  type ExportScenarioSource,
} from "./export-actions";

interface ExportScenarioOptions {
  config?: string;
  fromDb?: string;
  output?: string;
  out?: string;
  rate?: string;
  term?: string;
  program?: string;
  armFixed?: string;
  path: string;
}

export const registerExportScenarioCommand = (program: Command): void => {
  program
    .command("export-scenario")
    .description(
      "Emit a resolved, re-loadable scenario config payload (post-override) to stdout or a file",
    )
    .option("--config <file>", "Config file path")
    .option("--from-db <scenarioId>", "Load scenario from the database instead of --config")
    .option("--output <format>", "Output format: yaml or json (default: yaml)")
    .option("--out <path>", "Write the exported payload to this file instead of stdout")
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
    .option("--path <file>", "Database file path", "loanscope.db")
    .action((options: ExportScenarioOptions, command: Command) => {
      // Root-level options with the same long flag as a subcommand option
      // are routed by commander to the parent when the flag appears after
      // the subcommand name. Read both layers and prefer the explicit
      // subcommand value, then fall through to the root value.
      const parentOpts =
        (command.parent?.opts() as { output?: string; config?: string } | undefined) ?? {};
      const configPath = options.config ?? parentOpts.config;

      if (options.fromDb !== undefined && configPath !== undefined) {
        throw new CliValidationError("--from-db and --config are mutually exclusive.");
      }

      const format = resolvePayloadFormat(options.output, command);

      // The DatabaseManager is only required for the --from-db source;
      // `withOptionalManager` is a no-op when `dbPath` is undefined and
      // otherwise guarantees the sqlite connection is closed after the
      // export completes, on both success and error.
      const dbPath = options.fromDb !== undefined ? options.path : undefined;

      withOptionalManager(dbPath, (manager) => {
        const source: ExportScenarioSource =
          options.fromDb !== undefined
            ? {
                kind: "db",
                manager: manager!,
                scenarioId: options.fromDb,
              }
            : configPath !== undefined
              ? { kind: "config", filePath: configPath }
              : { kind: "default" };

        const input: ExportScenarioInput = {
          source,
          overrides: {
            ...(options.rate !== undefined ? { rate: options.rate } : {}),
            ...(options.term !== undefined ? { term: options.term } : {}),
            ...(options.program !== undefined ? { program: options.program } : {}),
            ...(options.armFixed !== undefined ? { armFixed: options.armFixed } : {}),
          },
          format,
          ...(options.out !== undefined ? { outPath: options.out } : {}),
        };

        const result = exportScenarioAction(input);

        if (result.outPath !== null) {
          console.log(`Exported scenario to ${result.outPath}`);
        } else {
          console.log(result.rendered);
        }
      });
    });
};
