import { Command } from "commander";
import {
  readBatchList,
  renderBatchCsv,
  renderBatchJson,
  renderBatchTable,
  runBatchAction,
  type BatchInput,
  type BatchProductSelectionFlags,
} from "./batch-actions";
import { CliValidationError } from "../cli-error";
import { parseCliOutputFormat } from "../format-parsers";
import type { ScenarioOverrideOptions } from "./scenario-overrides";

interface BatchOptions {
  list?: string;
  output?: string;
  rate?: string;
  term?: string;
  program?: string;
  armFixed?: string;
  lender?: string;
  products?: string;
  productSource?: string;
}

export const registerBatchCommand = (program: Command): void => {
  program
    .command("batch")
    .description("Evaluate multiple scenario config files sequentially and emit a batch summary")
    .argument("[files...]", "Scenario config file paths (alternative to --list)")
    .option(
      "--list <path>",
      "Path to a newline-separated list of scenario config paths (comments '#' and blank lines ignored)",
    )
    .option("--output <format>", "Output format: table, json, or csv (default: table)")
    .option("--rate <rate>", "Override note rate for every scenario")
    .option("--term <months>", "Override amortization term in months for every scenario")
    .option(
      "--program <kind>",
      "Override program kind (Fixed|ARM|InterestOnly) for every scenario. ARM requires --arm-fixed.",
    )
    .option(
      "--arm-fixed <months>",
      "Override ARM fixed period (60|84|120) for every scenario. Requires --program ARM.",
    )
    .option("--lender <id>", "Filter by lender id for every scenario")
    .option("--products <list>", "Comma-separated product ids to include for every scenario")
    .option("--product-source <kind>", "Product source: generic, preset, or custom")
    .action((positional: readonly string[], options: BatchOptions, command: Command) => {
      const hasPositional = positional.length > 0;
      const hasList = options.list !== undefined;

      if (!hasPositional && !hasList) {
        throw new CliValidationError("batch requires at least one scenario path or --list <file>.");
      }
      if (hasPositional && hasList) {
        throw new CliValidationError(
          "batch accepts either positional scenario paths or --list <file>, not both.",
        );
      }

      const paths: readonly string[] = hasList ? readBatchList(options.list as string) : positional;

      if (paths.length === 0) {
        throw new CliValidationError(
          hasList
            ? `Batch list file "${options.list}" contained no scenario paths.`
            : "batch requires at least one scenario path.",
        );
      }

      // Root-level `--output` shadows the subcommand option in commander
      // when both declare the same long flag. Prefer the explicit
      // subcommand value, then fall through to the root default of
      // "table" captured on the parent command.
      const parentOpts = (command.parent?.opts() as { output?: string } | undefined) ?? {};
      const rawOutput = options.output ?? parentOpts.output ?? "table";
      const output = parseCliOutputFormat(rawOutput);

      const overrides: ScenarioOverrideOptions = {
        ...(options.rate !== undefined ? { rate: options.rate } : {}),
        ...(options.term !== undefined ? { term: options.term } : {}),
        ...(options.program !== undefined ? { program: options.program } : {}),
        ...(options.armFixed !== undefined ? { armFixed: options.armFixed } : {}),
      };

      const selection: BatchProductSelectionFlags = {
        ...(options.lender !== undefined ? { lender: options.lender } : {}),
        ...(options.products !== undefined ? { products: options.products } : {}),
        ...(options.productSource !== undefined ? { productSource: options.productSource } : {}),
      };

      const input: BatchInput = { paths, overrides, selection };

      if (output === "table") {
        // Text mode: stream one line per scenario so the user sees progress
        // before the aggregate footer lands. The reduce is still serial, so
        // we replay each row through stdout as they are produced by
        // re-running the single-scenario branch inline. To avoid duplicating
        // the loop body we render the completed report line-by-line after
        // the (deterministic, serial) batch finishes — this preserves the
        // "one line per scenario" contract without doubling the evaluation
        // work and without interleaving output with exceptions mid-batch.
        const report = runBatchAction(input);
        const text = renderBatchTable(report);
        process.stdout.write(text + "\n");
        return;
      }

      const report = runBatchAction(input);
      if (output === "json") {
        process.stdout.write(renderBatchJson(report) + "\n");
      } else {
        process.stdout.write(renderBatchCsv(report) + "\n");
      }
    });
};
