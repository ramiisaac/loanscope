import { Command } from "commander";
import { printGoalSeekResult, resolveGoalSeekOutput } from "./print";
import {
  runMaxLoanAmount,
  runMaxLoanByDti,
  runMaxLoanByLtv,
  runMaxPurchasePrice,
  runMinDownPayment,
  runMinFico,
  runMinReserves,
  type MaxLoanByDtiOptions,
  type MaxLoanByLtvOptions,
  type MaxLoanOptions,
  type MaxPriceOptions,
  type MinDownOptions,
  type MinFicoOptions,
  type MinReservesOptions,
} from "./solvers";

/**
 * Resolve `--config` from the subcommand first, then fall through to the
 * root command. Goalseek subcommands nest one level below the `goalseek`
 * group, so the root options live on `cmd.parent?.parent`.
 */
const resolveConfigPath = (options: { config?: string }, cmd: Command): string | undefined => {
  const rootOpts = (cmd.parent?.parent?.opts() as { config?: string } | undefined) ?? {};
  return options.config ?? rootOpts.config;
};

export const registerGoalseekCommand = (program: Command): void => {
  const command = program.command("goalseek").description("Goal seek a threshold");

  command
    .command("max-loan")
    .requiredOption("--product <id>", "Product id")
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
    .option("--min <amount>", "Min loan amount", "100000")
    .option("--max <amount>", "Max loan amount", "2000000")
    .option("--tolerance <value>", "Convergence tolerance")
    .option("--max-iterations <count>", "Maximum iterations")
    .option("--output <format>", "Output format: table, json, or csv")
    .action((options: MaxLoanOptions, cmd: Command) => {
      printGoalSeekResult(
        runMaxLoanAmount(options, resolveConfigPath(options, cmd)),
        resolveGoalSeekOutput(options, cmd),
      );
    });

  command
    .command("max-loan-ltv")
    .requiredOption("--product <id>", "Product id")
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
    .requiredOption("--ltv <ratio>", "Target LTV")
    .option("--min <amount>", "Min loan amount", "100000")
    .option("--max <amount>", "Max loan amount", "2000000")
    .option("--tolerance <value>", "Convergence tolerance")
    .option("--max-iterations <count>", "Maximum iterations")
    .option("--output <format>", "Output format: table, json, or csv")
    .action((options: MaxLoanByLtvOptions, cmd: Command) => {
      printGoalSeekResult(
        runMaxLoanByLtv(options, resolveConfigPath(options, cmd)),
        resolveGoalSeekOutput(options, cmd),
      );
    });

  command
    .command("max-loan-dti")
    .requiredOption("--product <id>", "Product id")
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
    .requiredOption("--dti <ratio>", "Target DTI")
    .option("--min <amount>", "Min loan amount", "100000")
    .option("--max <amount>", "Max loan amount", "2000000")
    .option("--tolerance <value>", "Convergence tolerance")
    .option("--max-iterations <count>", "Maximum iterations")
    .option("--output <format>", "Output format: table, json, or csv")
    .action((options: MaxLoanByDtiOptions, cmd: Command) => {
      printGoalSeekResult(
        runMaxLoanByDti(options, resolveConfigPath(options, cmd)),
        resolveGoalSeekOutput(options, cmd),
      );
    });

  command
    .command("min-down")
    .requiredOption("--product <id>", "Product id")
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
    .option("--min <amount>", "Min down payment", "0")
    .option("--max <amount>", "Max down payment", "500000")
    .option("--tolerance <value>", "Convergence tolerance")
    .option("--max-iterations <count>", "Maximum iterations")
    .option("--output <format>", "Output format: table, json, or csv")
    .action((options: MinDownOptions, cmd: Command) => {
      printGoalSeekResult(
        runMinDownPayment(options, resolveConfigPath(options, cmd)),
        resolveGoalSeekOutput(options, cmd),
      );
    });

  command
    .command("min-fico")
    .requiredOption("--product <id>", "Product id")
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
    .option("--min <score>", "Min FICO", "300")
    .option("--max <score>", "Max FICO", "850")
    .option("--tolerance <value>", "Convergence tolerance")
    .option("--max-iterations <count>", "Maximum iterations")
    .option("--output <format>", "Output format: table, json, or csv")
    .action((options: MinFicoOptions, cmd: Command) => {
      printGoalSeekResult(
        runMinFico(options, resolveConfigPath(options, cmd)),
        resolveGoalSeekOutput(options, cmd),
      );
    });

  command
    .command("max-price")
    .requiredOption("--product <id>", "Product id")
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
    .option("--min <amount>", "Min price", "100000")
    .option("--max <amount>", "Max price", "2000000")
    .option("--tolerance <value>", "Convergence tolerance")
    .option("--max-iterations <count>", "Maximum iterations")
    .option("--output <format>", "Output format: table, json, or csv")
    .action((options: MaxPriceOptions, cmd: Command) => {
      printGoalSeekResult(
        runMaxPurchasePrice(options, resolveConfigPath(options, cmd)),
        resolveGoalSeekOutput(options, cmd),
      );
    });

  command
    .command("min-reserves")
    .requiredOption("--product <id>", "Product id")
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
    .option("--min <amount>", "Min reserves", "0")
    .option("--max <amount>", "Max reserves", "200000")
    .option("--tolerance <value>", "Convergence tolerance")
    .option("--max-iterations <count>", "Maximum iterations")
    .option("--output <format>", "Output format: table, json, or csv")
    .action((options: MinReservesOptions, cmd: Command) => {
      printGoalSeekResult(
        runMinReserves(options, resolveConfigPath(options, cmd)),
        resolveGoalSeekOutput(options, cmd),
      );
    });
};
