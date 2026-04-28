import inquirer from "inquirer";
import { Occupancy, LoanPurpose, PropertyType } from "@loanscope/domain";
import type { QuickQuoteInput, Transaction } from "@loanscope/domain";
import { buildScopedResponse, evaluate, quickQuoteToTransaction } from "@loanscope/engine";
import { filterDisplayProducts, getAllProducts } from "@loanscope/products";
import { renderScopeAnalysis } from "./output/scope";
import { parseCliOccupancy, parseCliLoanPurpose, parseCliPropertyType } from "./cli-parsers/enums";
import { parseCliFico, parseCliMoney } from "./cli-parsers/numeric";
const occupancyChoices = Object.values(Occupancy);
const propertyChoices = Object.values(PropertyType);
const purposeChoices = Object.values(LoanPurpose);

/** Validate a numeric prompt result, returning the branded Money or throwing. */
const validateMoneyPrompt = (raw: unknown, label: string) => {
  const str = String(raw);
  return parseCliMoney(str, label);
};

/** Validate FICO from prompt input. */
const validateFicoPrompt = (raw: unknown) => {
  const str = String(raw);
  return parseCliFico(str);
};

export const runInteractive = async (): Promise<Transaction> => {
  const products = filterDisplayProducts(getAllProducts());
  const basic = await inquirer.prompt([
    {
      name: "loanAmount",
      type: "number",
      message: "Loan amount",
      default: 500000,
    },
    {
      name: "purchasePrice",
      type: "number",
      message: "Purchase price",
      default: 625000,
    },
    {
      name: "fico",
      type: "number",
      message: "FICO score",
      default: 720,
    },
    {
      name: "occupancy",
      type: "list",
      message: "Occupancy",
      choices: occupancyChoices,
    },
    {
      name: "propertyType",
      type: "list",
      message: "Property type",
      choices: propertyChoices,
    },
    {
      name: "loanPurpose",
      type: "list",
      message: "Loan purpose",
      choices: purposeChoices,
    },
  ]);

  const occupancy = parseCliOccupancy(String(basic.occupancy));
  const propertyType = parseCliPropertyType(String(basic.propertyType));
  const loanPurpose = parseCliLoanPurpose(String(basic.loanPurpose));
  const loanAmount = validateMoneyPrompt(basic.loanAmount, "loan amount");
  const purchasePrice = validateMoneyPrompt(basic.purchasePrice, "purchase price");
  const fico = validateFicoPrompt(basic.fico);

  const baseInput: QuickQuoteInput = {
    loanAmount,
    purchasePrice,
    fico,
    occupancy,
    propertyType,
    loanPurpose,
  };
  const baseTransaction = quickQuoteToTransaction(baseInput);
  const baseVariant = baseTransaction.variants[0];
  const baseProduct = products[0];
  if (baseVariant && baseProduct) {
    const scoped = buildScopedResponse(
      baseTransaction,
      [baseProduct],
      evaluate(baseTransaction, baseVariant, baseProduct),
    );
    console.log(renderScopeAnalysis(scoped));
  }

  const askMore = await inquirer.prompt([
    {
      name: "includeIncome",
      type: "confirm",
      message: "Add income/debt details?",
      default: false,
    },
  ]);

  const details: {
    monthlyIncome?: number;
    monthlyDebts?: number;
    annualTaxes?: number;
    annualInsurance?: number;
    monthlyHoa?: number;
  } = askMore.includeIncome
    ? await inquirer.prompt([
        {
          name: "monthlyIncome",
          type: "number",
          message: "Monthly income",
          default: 20000,
        },
        {
          name: "monthlyDebts",
          type: "number",
          message: "Monthly debts",
          default: 2000,
        },
        {
          name: "annualTaxes",
          type: "number",
          message: "Annual property taxes",
          default: 6000,
        },
        {
          name: "annualInsurance",
          type: "number",
          message: "Annual insurance",
          default: 1500,
        },
        {
          name: "monthlyHoa",
          type: "number",
          message: "Monthly HOA",
          default: 0,
        },
      ])
    : {};

  const input: QuickQuoteInput = {
    ...baseInput,
    ...(details.monthlyIncome != null
      ? {
          monthlyIncome: validateMoneyPrompt(details.monthlyIncome, "monthly income"),
        }
      : {}),
    ...(details.monthlyDebts != null
      ? {
          monthlyDebts: validateMoneyPrompt(details.monthlyDebts, "monthly debts"),
        }
      : {}),
    ...(details.annualTaxes != null
      ? {
          annualTaxes: validateMoneyPrompt(details.annualTaxes, "annual taxes"),
        }
      : {}),
    ...(details.annualInsurance != null
      ? {
          annualInsurance: validateMoneyPrompt(details.annualInsurance, "annual insurance"),
        }
      : {}),
    ...(details.monthlyHoa != null
      ? { monthlyHoa: validateMoneyPrompt(details.monthlyHoa, "monthly HOA") }
      : {}),
  };

  const transaction = quickQuoteToTransaction(input);
  const variant = transaction.variants[0];
  const product = products[0];
  if (variant && product) {
    const scoped = buildScopedResponse(
      transaction,
      [product],
      evaluate(transaction, variant, product),
    );
    console.log(renderScopeAnalysis(scoped));
  }
  return transaction;
};
