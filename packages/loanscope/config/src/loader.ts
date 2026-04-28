import fs from "node:fs";
import yaml from "js-yaml";
import { z } from "zod";
import { configErrorFromZod } from "./errors";
import { configFileSchema } from "./schema";
import { quickQuoteSchema, type QuickQuoteSchema } from "./schema/quick-quote";
import { transactionSchema, type TransactionSchema } from "./schema/transaction";
import { simulationPlanSchema } from "./schema/simulation";
import type { AssetSchema } from "./schema/asset";
import type { BorrowerSchema } from "./schema/borrower";
import type { IncomeSchema } from "./schema/income";
import type { LiabilitySchema } from "./schema/liability";
import type { VariantSchema } from "./schema/variant";
import type {
  ArmDetails,
  BuydownSelection,
  CashOutDetails,
  ClosingCosts,
  Location,
  MiSelection,
  MonthlyHousing,
  PropertyAttributes,
  QuickQuoteInput,
  RateNote,
  Scenario,
  Transaction,
  Units,
  Asset,
  Borrower,
  IncomeStream,
  Liability,
  TransactionVariant,
  SubordinateLien,
  AusFindings,
  ProductSourceSelection,
  VaServiceContext,
  QualifyingIncomePolicy,
  BorrowerBlendPolicy,
} from "@loanscope/domain";
import { assertNever } from "@loanscope/domain";
import type { QualifyingIncomePolicySchema } from "./schema/income";

const setIfDefined = <T>(value: T | undefined, setter: (value: T) => void): void => {
  if (value !== undefined) {
    setter(value);
  }
};

const toUnits = (value: number): Units => {
  if (value === 1 || value === 2 || value === 3 || value === 4) {
    return value;
  }
  throw new Error(`Invalid units value: ${value}`);
};

const normalizeQuickQuote = (input: QuickQuoteSchema): QuickQuoteInput => {
  const result: QuickQuoteInput = {
    loanAmount: input.loanAmount,
    loanPurpose: input.loanPurpose,
    occupancy: input.occupancy,
    propertyType: input.propertyType,
    fico: input.fico,
  };

  setIfDefined(input.purchasePrice, (value) => {
    result.purchasePrice = value;
  });
  setIfDefined(input.appraisedValue, (value) => {
    result.appraisedValue = value;
  });
  setIfDefined(input.monthlyIncome, (value) => {
    result.monthlyIncome = value;
  });
  setIfDefined(input.monthlyDebts, (value) => {
    result.monthlyDebts = value;
  });
  setIfDefined(input.annualTaxes, (value) => {
    result.annualTaxes = value;
  });
  setIfDefined(input.annualInsurance, (value) => {
    result.annualInsurance = value;
  });
  setIfDefined(input.monthlyHoa, (value) => {
    result.monthlyHoa = value;
  });
  setIfDefined(input.closingCosts, (value) => {
    result.closingCosts = value;
  });
  setIfDefined(input.totalLiquidAssets, (value) => {
    result.totalLiquidAssets = value;
  });
  setIfDefined(input.totalRetirementAssets, (value) => {
    result.totalRetirementAssets = value;
  });
  setIfDefined(input.noteRatePct, (value) => {
    result.noteRatePct = value;
  });
  setIfDefined(input.amortizationMonths, (value) => {
    result.amortizationMonths = value;
  });
  setIfDefined(input.loanType, (value) => {
    result.loanType = value;
  });
  setIfDefined(input.units, (value) => {
    result.units = toUnits(value);
  });
  setIfDefined(input.stateCode, (value) => {
    result.stateCode = value;
  });
  setIfDefined(input.isFirstTimeHomebuyer, (value) => {
    result.isFirstTimeHomebuyer = value;
  });
  setIfDefined(input.isSelfEmployed, (value) => {
    result.isSelfEmployed = value;
  });
  setIfDefined(input.numberOfBorrowers, (value) => {
    result.numberOfBorrowers = value;
  });

  return result;
};

const normalizeArmDetails = (
  input: TransactionSchema["scenario"]["rateNote"]["arm"],
): ArmDetails | undefined => {
  if (!input) return undefined;
  const result: ArmDetails = {};
  setIfDefined(input.indexName, (value) => {
    result.indexName = value;
  });
  setIfDefined(input.fullyIndexedRatePct, (value) => {
    result.fullyIndexedRatePct = value;
  });
  setIfDefined(input.marginPct, (value) => {
    result.marginPct = value;
  });
  setIfDefined(input.initialFixedMonths, (value) => {
    result.initialFixedMonths = value;
  });
  return result;
};

const normalizeRateNote = (input: TransactionSchema["scenario"]["rateNote"]): RateNote => {
  const result: RateNote = {
    noteRatePct: input.noteRatePct,
  };
  setIfDefined(input.productKind, (value) => {
    result.productKind = value;
  });
  setIfDefined(input.amortizationMonths, (value) => {
    result.amortizationMonths = value;
  });
  setIfDefined(input.interestOnlyMonths, (value) => {
    result.interestOnlyMonths = value;
  });
  setIfDefined(normalizeArmDetails(input.arm), (value) => {
    result.arm = value;
  });
  return result;
};

const normalizeMonthlyHousing = (
  input: TransactionSchema["scenario"]["monthlyHousing"],
): MonthlyHousing => {
  const result: MonthlyHousing = {};
  setIfDefined(input.propertyTax, (value) => {
    result.propertyTax = value;
  });
  setIfDefined(input.insurance, (value) => {
    result.insurance = value;
  });
  setIfDefined(input.hoa, (value) => {
    result.hoa = value;
  });
  setIfDefined(input.mi, (value) => {
    result.mi = value;
  });
  setIfDefined(input.floodInsurance, (value) => {
    result.floodInsurance = value;
  });
  return result;
};

const normalizeClosingCosts = (
  input: TransactionSchema["scenario"]["closingCosts"],
): ClosingCosts => {
  const result: ClosingCosts = {
    estimatedTotal: input.estimatedTotal,
  };
  setIfDefined(input.prepaidItems, (value) => {
    result.prepaidItems = value;
  });
  return result;
};

const normalizeCashOut = (
  input: TransactionSchema["scenario"]["cashOut"],
): CashOutDetails | undefined => {
  if (!input) return undefined;
  const result: CashOutDetails = {};
  setIfDefined(input.requestedAmount, (value) => {
    result.requestedAmount = value;
  });
  setIfDefined(input.seasoningMonths, (value) => {
    result.seasoningMonths = value;
  });
  setIfDefined(input.listedForSaleRecently, (value) => {
    result.listedForSaleRecently = value;
  });
  return result;
};

const normalizeVaServiceContext = (
  input: TransactionSchema["scenario"]["vaServiceContext"],
): VaServiceContext | undefined => {
  if (!input) return undefined;
  return {
    priorUse: input.priorUse,
    disabilityExempt: input.disabilityExempt,
    reserveOrGuard: input.reserveOrGuard,
  };
};

const normalizeLocation = (
  input: TransactionSchema["scenario"]["location"],
): Location | undefined => {
  if (!input) return undefined;
  const result: Location = {};
  setIfDefined(input.zipCode, (value) => {
    result.zipCode = value;
  });
  setIfDefined(input.countyFips, (value) => {
    result.countyFips = value;
  });
  setIfDefined(input.stateCode, (value) => {
    result.stateCode = value;
  });
  setIfDefined(input.isHighCostArea, (value) => {
    result.isHighCostArea = value;
  });
  setIfDefined(input.conformingLimitOverride, (value) => {
    result.conformingLimitOverride = value;
  });
  setIfDefined(input.highBalanceLimitOverride, (value) => {
    result.highBalanceLimitOverride = value;
  });
  return result;
};

const normalizePropertyAttributes = (
  input: TransactionSchema["scenario"]["propertyAttributes"],
): PropertyAttributes | undefined => {
  if (!input) return undefined;
  const result: PropertyAttributes = {};
  setIfDefined(input.acreage, (value) => {
    result.acreage = value;
  });
  setIfDefined(input.isAgriculturalZoning, (value) => {
    result.isAgriculturalZoning = value;
  });
  setIfDefined(input.isDecliningMarket, (value) => {
    result.isDecliningMarket = value;
  });
  setIfDefined(input.stateCode, (value) => {
    result.stateCode = value;
  });
  return result;
};

const normalizeMiSelection = (
  input: TransactionSchema["scenario"]["miSelection"],
): MiSelection | undefined => {
  if (!input) return undefined;
  const result: MiSelection = {};
  setIfDefined(input.type, (value) => {
    result.type = value;
  });
  setIfDefined(input.ratePct, (value) => {
    result.ratePct = value;
  });
  setIfDefined(input.upfrontPremium, (value) => {
    result.upfrontPremium = value;
  });
  setIfDefined(input.monthlyPremium, (value) => {
    result.monthlyPremium = value;
  });
  return result;
};

const normalizeBuydown = (
  input: TransactionSchema["scenario"]["buydown"],
): BuydownSelection | undefined => {
  if (!input) return undefined;
  const result: BuydownSelection = {};
  setIfDefined(input.type, (value) => {
    result.type = value;
  });
  setIfDefined(input.payer, (value) => {
    result.payer = value;
  });
  setIfDefined(input.cost, (value) => {
    result.cost = value;
  });
  return result;
};

const normalizeSubordinateLien = (
  input: TransactionSchema["scenario"]["subordinateFinancing"] extends (infer T)[] | undefined
    ? T
    : never,
): SubordinateLien => {
  const result: SubordinateLien = {
    id: input.id,
    lienPosition: input.lienPosition,
    amount: input.amount,
  };
  setIfDefined(input.monthlyPayment, (value) => {
    result.monthlyPayment = value;
  });
  setIfDefined(input.includeInDTI, (value) => {
    result.includeInDTI = value;
  });
  return result;
};

const normalizeQualifyingPolicy = (input: QualifyingIncomePolicySchema): QualifyingIncomePolicy => {
  switch (input.kind) {
    case "AsStated":
      return { kind: "AsStated" };
    case "AveragedMonths":
      return {
        kind: "AveragedMonths",
        monthsLookback: input.monthsLookback,
        historicalAmounts: [...input.historicalAmounts],
      };
    case "RentalGross":
      return input.vacancyFactor === undefined
        ? { kind: "RentalGross", grossRent: input.grossRent }
        : {
            kind: "RentalGross",
            grossRent: input.grossRent,
            vacancyFactor: input.vacancyFactor,
          };
    case "PercentOfStated":
      return { kind: "PercentOfStated", factor: input.factor };
    default:
      return assertNever(input);
  }
};

const normalizeIncomeStream = (input: IncomeSchema): IncomeStream => {
  const result: IncomeStream = {
    id: input.id,
    borrowerId: input.borrowerId,
    type: input.type,
    monthlyAmount: input.monthlyAmount,
  };
  setIfDefined(input.qualifying, (value) => {
    result.qualifying = value;
  });
  setIfDefined(input.qualifyingPolicy, (value) => {
    result.qualifyingPolicy = normalizeQualifyingPolicy(value);
  });
  setIfDefined(input.vestingMonths, (value) => {
    result.vestingMonths = value;
  });
  setIfDefined(input.historyMonths, (value) => {
    result.historyMonths = value;
  });
  setIfDefined(input.notes, (value) => {
    result.notes = value;
  });
  setIfDefined(input.historicalAmounts, (value) => {
    result.historicalAmounts = [...value];
  });
  return result;
};

const normalizeBorrower = (input: BorrowerSchema): Borrower => {
  const result: Borrower = {
    id: input.id,
    fico: input.fico,
    incomes: input.incomes.map((inc) => normalizeIncomeStream(inc)),
  };
  setIfDefined(input.ficoScores, (value) => {
    result.ficoScores = value;
  });
  setIfDefined(input.displayName, (value) => {
    result.displayName = value;
  });
  setIfDefined(input.isFirstTimeHomebuyer, (value) => {
    result.isFirstTimeHomebuyer = value;
  });
  setIfDefined(input.isSelfEmployed, (value) => {
    result.isSelfEmployed = value;
  });
  setIfDefined(input.isNonOccupantCoBorrower, (value) => {
    result.isNonOccupantCoBorrower = value;
  });
  return result;
};

const normalizeVariant = (input: VariantSchema): TransactionVariant => {
  const result: TransactionVariant = {
    id: input.id,
    label: input.label,
    includedBorrowerIds: input.includedBorrowerIds,
  };
  setIfDefined(input.includeAssetIds, (value) => {
    result.includeAssetIds = value;
  });
  setIfDefined(input.includeLiabilityIds, (value) => {
    result.includeLiabilityIds = value;
  });
  setIfDefined(input.forcePayoffLiabilityIds, (value) => {
    result.forcePayoffLiabilityIds = value;
  });
  setIfDefined(input.excludeAssetIds, (value) => {
    result.excludeAssetIds = value;
  });
  setIfDefined(input.actionNotes, (value) => {
    result.actionNotes = value;
  });
  return result;
};

const normalizeAsset = (input: AssetSchema): Asset => {
  const result: Asset = {
    id: input.id,
    type: input.type,
    ownerBorrowerIds: input.ownerBorrowerIds,
    amount: input.amount,
  };
  setIfDefined(input.liquidityRank, (value) => {
    result.liquidityRank = value;
  });
  setIfDefined(input.canUseForClose, (value) => {
    result.canUseForClose = value;
  });
  setIfDefined(input.canUseForReserves, (value) => {
    result.canUseForReserves = value;
  });
  setIfDefined(input.haircutRatio, (value) => {
    result.haircutRatio = value;
  });
  setIfDefined(input.accountLast4, (value) => {
    result.accountLast4 = value;
  });
  setIfDefined(input.notes, (value) => {
    result.notes = value;
  });
  return result;
};

const normalizeLiability = (input: LiabilitySchema): Liability => {
  const result: Liability = {
    id: input.id,
    type: input.type,
    borrowerIds: input.borrowerIds,
    monthlyPayment: input.monthlyPayment,
  };
  setIfDefined(input.unpaidBalance, (value) => {
    result.unpaidBalance = value;
  });
  setIfDefined(input.includeInDTI, (value) => {
    result.includeInDTI = value;
  });
  setIfDefined(input.payoffAtClose, (value) => {
    result.payoffAtClose = value;
  });
  setIfDefined(input.payoffAmount, (value) => {
    result.payoffAmount = value;
  });
  setIfDefined(input.accountLast4, (value) => {
    result.accountLast4 = value;
  });
  setIfDefined(input.notes, (value) => {
    result.notes = value;
  });
  return result;
};

const normalizeAusFindings = (
  input: NonNullable<TransactionSchema["ausFindings"]>,
): AusFindings => {
  const result: AusFindings = {};
  setIfDefined(input.engine, (value) => {
    result.engine = value;
  });
  setIfDefined(input.finding, (value) => {
    result.finding = value;
  });
  setIfDefined(input.reservesMonths, (value) => {
    result.reservesMonths = value;
  });
  setIfDefined(input.notes, (value) => {
    result.notes = value;
  });
  return result;
};

const normalizeScenario = (input: TransactionSchema["scenario"]): Scenario => {
  const scenario: Scenario = {
    loanPurpose: input.loanPurpose,
    occupancy: input.occupancy,
    propertyType: input.propertyType,
    requestedLoanAmount: input.requestedLoanAmount,
    rateNote: normalizeRateNote(input.rateNote),
    monthlyHousing: normalizeMonthlyHousing(input.monthlyHousing),
    closingCosts: normalizeClosingCosts(input.closingCosts),
  };

  setIfDefined(input.purchasePrice, (value) => {
    scenario.purchasePrice = value;
  });
  setIfDefined(input.downPayment, (value) => {
    scenario.downPayment = value;
  });
  setIfDefined(input.units, (value) => {
    scenario.units = toUnits(value);
  });
  setIfDefined(input.appraisedValue, (value) => {
    scenario.appraisedValue = value;
  });
  setIfDefined(input.subordinateFinancing, (value) => {
    scenario.subordinateFinancing = value.map((lien) => normalizeSubordinateLien(lien));
  });
  setIfDefined(normalizeCashOut(input.cashOut), (value) => {
    scenario.cashOut = value;
  });
  setIfDefined(normalizeVaServiceContext(input.vaServiceContext), (value) => {
    scenario.vaServiceContext = value;
  });
  setIfDefined(normalizeLocation(input.location), (value) => {
    scenario.location = value;
  });
  setIfDefined(normalizePropertyAttributes(input.propertyAttributes), (value) => {
    scenario.propertyAttributes = value;
  });
  setIfDefined(normalizeMiSelection(input.miSelection), (value) => {
    scenario.miSelection = value;
  });
  setIfDefined(normalizeBuydown(input.buydown), (value) => {
    scenario.buydown = value;
  });
  setIfDefined(input.subjectPropertyRental, (value) => {
    scenario.subjectPropertyRental = {
      grossMonthlyRent: value.grossMonthlyRent,
      ...(value.vacancyFactor !== undefined ? { vacancyFactor: value.vacancyFactor } : {}),
    };
  });

  return scenario;
};

const normalizeProductSource = (
  input: NonNullable<TransactionSchema["productSource"]>,
): ProductSourceSelection => {
  switch (input.kind) {
    case "generic":
      return { kind: "generic" };
    case "preset":
      return {
        kind: "preset",
        lenderId: input.lenderId,
        presetId: input.presetId,
      };
    case "custom": {
      if (input.lenderId !== undefined) {
        return {
          kind: "custom",
          lenderId: input.lenderId,
          products: input.products,
        };
      }
      return { kind: "custom", products: input.products };
    }
    default:
      return assertNever(input);
  }
};

/**
 * Pass-through normalizer for `BorrowerBlendPolicy`. The zod
 * `borrowerBlendPolicySchema` already produces a value structurally identical
 * to the domain discriminated union (no branded primitives, no aliasing), so
 * we only re-shape into a `readonly`-friendly literal here.
 */
const normalizeBorrowerBlendPolicy = (
  input: NonNullable<TransactionSchema["borrowerBlendPolicy"]>,
): BorrowerBlendPolicy => {
  switch (input.kind) {
    case "LowestMid":
      return { kind: "LowestMid" };
    case "RepresentativeFico":
      return { kind: "RepresentativeFico" };
    case "WeightedAverage":
      return {
        kind: "WeightedAverage",
        incomeWeighted: input.incomeWeighted,
      };
    case "PrimaryOnly":
      return {
        kind: "PrimaryOnly",
        primaryBorrowerId: input.primaryBorrowerId,
      };
    default:
      return assertNever(input);
  }
};

const normalizeTransaction = (input: TransactionSchema): Transaction => {
  const result: Transaction = {
    id: input.id,
    scenario: normalizeScenario(input.scenario),
    borrowers: input.borrowers.map((b) => normalizeBorrower(b)),
    variants: input.variants.map((v) => normalizeVariant(v)),
  };

  setIfDefined(input.assets, (value) => {
    result.assets = value.map((a) => normalizeAsset(a));
  });
  setIfDefined(input.liabilities, (value) => {
    result.liabilities = value.map((l) => normalizeLiability(l));
  });
  setIfDefined(input.ausFindings, (value) => {
    result.ausFindings = normalizeAusFindings(value);
  });
  setIfDefined(input.borrowerBlendPolicy, (value) => {
    result.borrowerBlendPolicy = normalizeBorrowerBlendPolicy(value);
  });
  setIfDefined(input.financedUpfrontFees, (value) => {
    result.financedUpfrontFees = value;
  });

  return result;
};

export interface ConfigParseResult {
  transaction?: Transaction;
  quickQuote?: QuickQuoteInput;
  simulation?: z.infer<typeof simulationPlanSchema>;
  productSource?: ProductSourceSelection;
}

export const loadYamlFile = (filePath: string): unknown => {
  const content = fs.readFileSync(filePath, "utf8");
  return yaml.load(content);
};

/**
 * Serializes a value to a re-parseable YAML string.
 *
 * Uses block style (no inline flow), no reference aliases, and a 2-space indent
 * so that output can be diffed and re-loaded by `loadYamlFile` / `parseConfig`
 * without semantic loss. Output is not byte-identical to author-written YAML
 * (comments and key ordering are not preserved by `js-yaml`'s round trip), but
 * it is semantically equivalent.
 */
export const dumpYaml = (value: unknown): string =>
  yaml.dump(value, {
    indent: 2,
    lineWidth: 100,
    noRefs: true,
    sortKeys: false,
  });

export const parseQuickQuote = (data: unknown): QuickQuoteInput => {
  try {
    return normalizeQuickQuote(quickQuoteSchema.parse(data));
  } catch (err) {
    if (err instanceof z.ZodError) {
      throw configErrorFromZod("quickQuote", err);
    }
    throw err;
  }
};

export const parseConfig = (data: unknown): ConfigParseResult => {
  try {
    const parsed = configFileSchema.parse(data);
    const result: ConfigParseResult = {};
    if (parsed.transaction) {
      try {
        const txnParsed = transactionSchema.parse(parsed.transaction);
        result.transaction = normalizeTransaction(txnParsed);
        if (txnParsed.productSource) {
          result.productSource = normalizeProductSource(txnParsed.productSource);
        }
      } catch (err) {
        if (err instanceof z.ZodError) {
          throw configErrorFromZod("config.transaction", err);
        }
        throw err;
      }
    }
    if (parsed.quickQuote) {
      try {
        result.quickQuote = normalizeQuickQuote(quickQuoteSchema.parse(parsed.quickQuote));
      } catch (err) {
        if (err instanceof z.ZodError) {
          throw configErrorFromZod("config.quickQuote", err);
        }
        throw err;
      }
    }
    if (parsed.simulation) {
      try {
        result.simulation = simulationPlanSchema.parse(parsed.simulation);
      } catch (err) {
        if (err instanceof z.ZodError) {
          throw configErrorFromZod("config.simulation", err);
        }
        throw err;
      }
    }
    return result;
  } catch (err) {
    if (err instanceof z.ZodError) {
      throw configErrorFromZod("config", err);
    }
    throw err;
  }
};

export const loadConfigFile = (filePath: string): ConfigParseResult => {
  const data = loadYamlFile(filePath);
  return parseConfig(data);
};
