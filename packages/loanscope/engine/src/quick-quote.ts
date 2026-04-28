import Decimal from "decimal.js";
import {
  ArmFixedPeriod,
  AssetType,
  Borrower,
  IncomeType,
  LiabilityType,
  QuickQuoteInput,
  Scenario,
  MonthlyHousing,
  Transaction,
  TransactionVariant,
  money,
  months,
  ratePct,
  ratio,
  ProgramKind,
} from "@loanscope/domain";
import { classifyLoanType, getEffectiveLimits } from "@loanscope/math";

const DEFAULT_QUICK_QUOTE_RATE_PCT = 6.875;

const defaultArmFixedPeriod = ArmFixedPeriod.M60;

const setIfDefined = <T extends object, K extends keyof T>(
  target: T,
  key: K,
  value: T[K] | undefined,
): void => {
  if (value !== undefined) {
    target[key] = value;
  }
};

export const quickQuoteToTransaction = (input: QuickQuoteInput): Transaction => {
  const borrowerCount = input.numberOfBorrowers ?? 1;
  const borrowers: Borrower[] = [];
  for (let i = 0; i < borrowerCount; i += 1) {
    const id = `b${i + 1}`;
    borrowers.push({
      id,
      fico: input.fico,
      incomes: input.monthlyIncome
        ? [
            {
              id: `inc${i + 1}`,
              borrowerId: id,
              type: IncomeType.W2,
              monthlyAmount: input.monthlyIncome,
            },
          ]
        : [],
    });
  }

  const variants: TransactionVariant[] = [
    {
      id: "default",
      label: "Default",
      includedBorrowerIds: borrowers.map((borrower) => borrower.id),
    },
  ];

  const loanAmount = input.loanAmount;
  const purchasePrice = input.purchasePrice;
  const downPayment =
    purchasePrice !== undefined
      ? money(new Decimal(purchasePrice).minus(loanAmount).toNumber())
      : undefined;

  const monthlyHousing: MonthlyHousing = {
    hoa: input.monthlyHoa ?? money(0),
  };
  setIfDefined(
    monthlyHousing,
    "propertyTax",
    input.annualTaxes ? money(new Decimal(input.annualTaxes).div(12).toNumber()) : undefined,
  );
  setIfDefined(
    monthlyHousing,
    "insurance",
    input.annualInsurance
      ? money(new Decimal(input.annualInsurance).div(12).toNumber())
      : undefined,
  );

  const scenario: Scenario = {
    loanPurpose: input.loanPurpose,
    occupancy: input.occupancy,
    propertyType: input.propertyType,
    requestedLoanAmount: loanAmount,
    rateNote: {
      noteRatePct: input.noteRatePct ?? ratePct(DEFAULT_QUICK_QUOTE_RATE_PCT),
      amortizationMonths: input.amortizationMonths ?? months(360),
      productKind: input.programKind ?? ProgramKind.Fixed,
    },
    monthlyHousing,
    closingCosts: {
      estimatedTotal: input.closingCosts ?? money(0),
    },
  };
  setIfDefined(scenario, "purchasePrice", purchasePrice);
  setIfDefined(scenario, "downPayment", downPayment);
  setIfDefined(scenario, "units", input.units);
  if ((input.programKind ?? ProgramKind.Fixed) === ProgramKind.ARM) {
    scenario.rateNote.arm = {
      initialFixedMonths: input.armInitialFixedMonths ?? defaultArmFixedPeriod,
    };
  }
  setIfDefined(scenario, "appraisedValue", input.appraisedValue ?? purchasePrice);
  if (input.stateCode) {
    setIfDefined(scenario, "location", { stateCode: input.stateCode });
  }

  const assets = [] as Transaction["assets"];
  if (input.totalLiquidAssets) {
    assets?.push({
      id: "liquid",
      type: AssetType.Checking,
      ownerBorrowerIds: borrowers.map((b) => b.id),
      amount: input.totalLiquidAssets,
    });
  }
  if (input.totalRetirementAssets) {
    assets?.push({
      id: "retirement",
      type: AssetType.Retirement401k,
      ownerBorrowerIds: borrowers.map((b) => b.id),
      amount: input.totalRetirementAssets,
      haircutRatio: ratio(0.6),
    });
  }

  const liabilities = input.monthlyDebts
    ? [
        {
          id: "debts",
          type: LiabilityType.CreditCard,
          borrowerIds: borrowers.map((b) => b.id),
          monthlyPayment: input.monthlyDebts,
        },
      ]
    : undefined;

  const limits = getEffectiveLimits(scenario.location);
  void classifyLoanType(loanAmount, limits.conforming, limits.highBalance, false);

  const transaction: Transaction = {
    id: "quick-quote",
    scenario,
    borrowers,
    variants,
  };
  setIfDefined(transaction, "assets", assets?.length ? assets : undefined);
  setIfDefined(transaction, "liabilities", liabilities);
  return transaction;
};

export const transactionToQuickQuote = (transaction: Transaction): QuickQuoteInput => {
  const scenario = transaction.scenario;
  const borrower = transaction.borrowers[0];
  const quote: QuickQuoteInput = {
    loanAmount: scenario.requestedLoanAmount,
    loanPurpose: scenario.loanPurpose,
    occupancy: scenario.occupancy,
    propertyType: scenario.propertyType,
    fico: borrower?.fico ?? 0,
  };
  setIfDefined(quote, "purchasePrice", scenario.purchasePrice);
  setIfDefined(quote, "appraisedValue", scenario.appraisedValue);
  setIfDefined(quote, "noteRatePct", scenario.rateNote.noteRatePct);
  setIfDefined(quote, "programKind", scenario.rateNote.productKind);
  setIfDefined(quote, "amortizationMonths", scenario.rateNote.amortizationMonths);
  setIfDefined(quote, "armInitialFixedMonths", scenario.rateNote.arm?.initialFixedMonths);
  setIfDefined(quote, "units", scenario.units);
  setIfDefined(quote, "stateCode", scenario.location?.stateCode);
  setIfDefined(quote, "monthlyIncome", borrower?.incomes[0]?.monthlyAmount);
  setIfDefined(quote, "monthlyDebts", transaction.liabilities?.[0]?.monthlyPayment);
  return quote;
};

export const normalizeInputs = (transaction: Transaction): Record<string, unknown> => {
  const scenario = transaction.scenario;
  const borrowers = transaction.borrowers;
  const assets = transaction.assets ?? [];
  const liabilities = transaction.liabilities ?? [];

  return {
    loanAmount: scenario.requestedLoanAmount,
    propertyValue: scenario.appraisedValue ?? scenario.purchasePrice,
    purchasePrice: scenario.purchasePrice,
    downPayment: scenario.downPayment,
    noteRatePct: scenario.rateNote.noteRatePct,
    amortizationMonths: scenario.rateNote.amortizationMonths,
    interestOnlyMonths: scenario.rateNote.interestOnlyMonths,
    borrowers,
    liabilities,
    assets,
    propertyTax: scenario.monthlyHousing.propertyTax,
    insurance: scenario.monthlyHousing.insurance,
    hoa: scenario.monthlyHousing.hoa,
    mi: scenario.monthlyHousing.mi,
    floodInsurance: scenario.monthlyHousing.floodInsurance,
    loanPurpose: scenario.loanPurpose,
    occupancy: scenario.occupancy,
    propertyType: scenario.propertyType,
    units: scenario.units,
    stateCode: scenario.location?.stateCode,
    closingCosts: scenario.closingCosts.estimatedTotal,
  };
};
