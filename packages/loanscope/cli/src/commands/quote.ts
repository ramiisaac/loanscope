import { Command } from "commander";
import {
  quickQuoteToTransaction,
  evaluate,
  evaluateAll,
  buildScopedResponse,
} from "@loanscope/engine";
import { renderEvaluationCSV, renderEvaluationTable, renderJson } from "../output";
import { renderScopeAnalysis } from "../output";
import type { QuickQuoteInput } from "@loanscope/domain";
import { CliValidationError } from "../cli-error";
import {
  parseCliProgramKind,
  parseCliArmFixedPeriod,
  parseCliOccupancy,
  parseCliLoanPurpose,
  parseCliPropertyType,
} from "../cli-parsers";
import { parseCliMoney, parseCliFico, parseCliRatePct, parseCliMonths } from "../cli-parsers";
import { parseCliOutputFormat } from "../format-parsers";
import { Occupancy, LoanPurpose, ProgramKind, PropertyType } from "@loanscope/domain";
import { selectProductsForTransaction } from "./select-products";

export const registerQuoteCommand = (program: Command): void => {
  program
    .command("quote")
    .description("Quick quote for loan scenario")
    .requiredOption("--loan <amount>", "Loan amount")
    .requiredOption("--price <amount>", "Purchase price")
    .requiredOption("--fico <score>", "FICO score")
    .option("--income <amount>", "Monthly income")
    .option("--debts <amount>", "Monthly debts")
    .option("--taxes <amount>", "Annual property taxes")
    .option("--insurance <amount>", "Annual insurance")
    .option("--hoa <amount>", "Monthly HOA")
    .option("--rate <rate>", "Note rate")
    .option("--term <months>", "Amortization term in months", "360")
    .option("--program <kind>", "Program kind (Fixed|ARM|InterestOnly). ARM requires --arm-fixed.")
    .option(
      "--arm-fixed <months>",
      "ARM fixed period in months (60|84|120). Requires --program ARM.",
    )
    .option("--occupancy <type>", "Occupancy", Occupancy.Primary)
    .option("--purpose <type>", "Loan purpose", LoanPurpose.Purchase)
    .option("--property <type>", "Property type", PropertyType.SFR)
    .option("--lender <id>", "Filter by lender id")
    .option("--products <list>", "Comma-separated product ids to include")
    .option("--product-source <kind>", "Product source: generic, preset, or custom")
    .option("--output <format>", "Output format: table, json, or csv")
    .option("--quiet", "Suppress scope output", false)
    .action((options, command) => {
      const parentOpts = command.parent?.opts() ?? {};

      const loanAmount = parseCliMoney(options.loan, "loan amount");
      const purchasePrice = parseCliMoney(options.price, "purchase price");

      if (Number(purchasePrice) === 0) {
        throw new CliValidationError("Purchase price must be greater than zero.");
      }
      if (Number(loanAmount) > Number(purchasePrice)) {
        throw new CliValidationError(
          `Loan amount ($${Number(loanAmount).toLocaleString()}) exceeds purchase price ($${Number(purchasePrice).toLocaleString()}). LTV cannot exceed 100%.`,
        );
      }
      const fico = parseCliFico(options.fico);
      const occupancy = parseCliOccupancy(options.occupancy);
      const loanPurpose = parseCliLoanPurpose(options.purpose);
      const propertyType = parseCliPropertyType(options.property);
      const termMonths = parseCliMonths(options.term, "term");
      const programKind = options.program ? parseCliProgramKind(options.program) : undefined;
      const armInitialFixedMonths = options.armFixed
        ? parseCliArmFixedPeriod(options.armFixed)
        : undefined;

      if (armInitialFixedMonths !== undefined && programKind === undefined) {
        throw new CliValidationError("ARM fixed period requires --program ARM.");
      }

      if (programKind === ProgramKind.ARM && armInitialFixedMonths === undefined) {
        throw new CliValidationError("ARM program requires --arm-fixed 60|84|120.");
      }

      if (
        armInitialFixedMonths !== undefined &&
        programKind !== undefined &&
        programKind !== ProgramKind.ARM
      ) {
        throw new CliValidationError("ARM fixed period can only be used with --program ARM.");
      }

      const input: QuickQuoteInput = {
        loanAmount,
        purchasePrice,
        fico,
        occupancy,
        propertyType,
        loanPurpose,
        ...(options.income
          ? { monthlyIncome: parseCliMoney(options.income, "monthly income") }
          : {}),
        ...(options.debts ? { monthlyDebts: parseCliMoney(options.debts, "monthly debts") } : {}),
        ...(options.taxes ? { annualTaxes: parseCliMoney(options.taxes, "annual taxes") } : {}),
        ...(options.insurance
          ? {
              annualInsurance: parseCliMoney(options.insurance, "annual insurance"),
            }
          : {}),
        ...(options.hoa ? { monthlyHoa: parseCliMoney(options.hoa, "monthly HOA") } : {}),
        ...(options.rate ? { noteRatePct: parseCliRatePct(options.rate, "note rate") } : {}),
        amortizationMonths: termMonths,
        ...(programKind ? { programKind } : {}),
        ...(armInitialFixedMonths ? { armInitialFixedMonths } : {}),
      };

      const transaction = quickQuoteToTransaction(input);

      const { products, effectiveSource } = selectProductsForTransaction(transaction, {
        lender: options.lender,
        products: options.products,
        productSource: options.productSource,
        requireUnflaggedGenericNarrowing: true,
      });

      const groups = evaluateAll(transaction, products);
      const output = parseCliOutputFormat(options.output ?? parentOpts.output ?? "table");
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

      if (output === "json") {
        console.log(renderJson({ groups, scope: scoped, productSource: effectiveSource }));
      } else if (output === "csv") {
        console.log(renderEvaluationCSV(groups));
      } else {
        console.log(renderEvaluationTable(groups, false));
        if (!quiet && scoped) {
          console.log(renderScopeAnalysis(scoped));
        }
      }
    });
};
