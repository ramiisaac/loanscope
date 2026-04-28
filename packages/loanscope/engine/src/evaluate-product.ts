import type { EvaluationResult } from "@loanscope/graph";
import type {
  AssetAllocationResult,
  DerivedMetrics,
  Money,
  Ratio,
  UnderwritingResult,
  ProductDefinition,
  Transaction,
  TransactionVariant,
} from "@loanscope/domain";
import { money, ratio } from "@loanscope/domain";
import { AmortizationType, ProgramKind } from "@loanscope/domain";
import { evaluate } from "./evaluate";
import {
  computeEligibility,
  extractChecksFromGraph,
  extractFailureReasons,
  extractWarnings,
} from "./aggregators";
import { getAllEdges } from "@loanscope/calculations";
import { resolveVariant } from "./tier-resolver";
import { isProductConfigurationError, VariantResolutionError } from "./errors";

const edgeRegistry = new Map(getAllEdges().map((edge) => [edge.id, edge]));

/**
 * Retrieves a value from the new EvaluationResult shape.
 * Checks result.inputs first, then result.computed.
 */
const getValue = <T>(result: EvaluationResult, nodeId: string): T | undefined => {
  const fromInputs = result.inputs[nodeId];
  if (fromInputs !== undefined) return fromInputs.value as T;
  const fromComputed = result.computed[nodeId];
  if (fromComputed !== undefined) return fromComputed.value as T;
  return undefined;
};

const setIfDefined = <T>(value: T | undefined, setter: (value: T) => void): void => {
  if (value !== undefined) {
    setter(value);
  }
};

const emptyDerived = (loanAmount: Money): DerivedMetrics => ({
  loanAmount,
  cashFlow: {
    qualifyingIncomeMonthly: money(0),
    liabilitiesMonthly: money(0),
    pitiMonthly: money(0),
    dtiBackEndRatio: ratio(0),
  },
  assetAllocation: {
    fundsToCloseRequired: money(0),
    payoffsRequired: money(0),
    totalRequired: money(0),
    used: [],
    remainingReservesDollars: money(0),
  },
});

/** Pre-flight variant resolution to fast-fail before graph evaluation. */
const preflightVariantCheck = (transaction: Transaction, product: ProductDefinition): void => {
  const scenario = transaction.scenario;
  const amortizationType =
    scenario.rateNote.productKind === ProgramKind.InterestOnly ||
    (scenario.rateNote.interestOnlyMonths ?? 0) > 0
      ? AmortizationType.InterestOnly
      : scenario.rateNote.productKind === ProgramKind.ARM
        ? AmortizationType.ARM
        : AmortizationType.FullyAmortizing;
  const programKindForVariant =
    scenario.rateNote.productKind === ProgramKind.ARM ? ProgramKind.ARM : ProgramKind.Fixed;

  try {
    resolveVariant(
      product,
      scenario.rateNote.amortizationMonths ?? 360,
      scenario.occupancy,
      amortizationType,
      programKindForVariant,
      scenario.rateNote.arm?.initialFixedMonths,
    );
  } catch (err: unknown) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new VariantResolutionError(product.id, detail);
  }
};

export const evaluateProduct = (
  transaction: Transaction,
  variant: TransactionVariant,
  product: ProductDefinition,
): UnderwritingResult => {
  try {
    preflightVariantCheck(transaction, product);
  } catch (err: unknown) {
    if (isProductConfigurationError(err)) {
      return {
        productId: product.id,
        productName: product.name,
        variantId: variant.id,
        eligible: false,
        checks: [],
        failureReasons: [err.detail],
        warnings: [],
        derived: emptyDerived(transaction.scenario.requestedLoanAmount),
      };
    }
    throw err;
  }

  let graphResult: EvaluationResult;
  try {
    graphResult = evaluate(transaction, variant, product);
  } catch (err: unknown) {
    if (isProductConfigurationError(err)) {
      return {
        productId: product.id,
        productName: product.name,
        variantId: variant.id,
        eligible: false,
        checks: [],
        failureReasons: [err instanceof Error ? err.message : String(err)],
        warnings: [],
        derived: emptyDerived(transaction.scenario.requestedLoanAmount),
      };
    }
    throw err;
  }

  const checks = extractChecksFromGraph(graphResult);
  const eligible = computeEligibility(graphResult, edgeRegistry);

  const derived: DerivedMetrics = {
    loanAmount: transaction.scenario.requestedLoanAmount,
    cashFlow: {
      qualifyingIncomeMonthly: getValue<Money>(graphResult, "qualifyingIncomeMonthly") ?? money(0),
      liabilitiesMonthly: getValue<Money>(graphResult, "monthlyLiabilities") ?? money(0),
      pitiMonthly: getValue<Money>(graphResult, "pitiMonthly") ?? money(0),
      dtiBackEndRatio: getValue<Ratio>(graphResult, "dti") ?? ratio(0),
    },
    assetAllocation: getValue<AssetAllocationResult>(graphResult, "assetAllocation") ?? {
      fundsToCloseRequired: money(0),
      payoffsRequired: money(0),
      totalRequired: money(0),
      used: [],
      remainingReservesDollars: money(0),
    },
  };
  setIfDefined(getValue<Ratio>(graphResult, "ltv"), (value) => {
    derived.ltvRatio = value;
  });
  setIfDefined(getValue<Ratio>(graphResult, "cltv"), (value) => {
    derived.cltvRatio = value;
  });
  setIfDefined(getValue<Money>(graphResult, "requiredReservesDollars"), (value) => {
    derived.requiredReservesDollars = value;
  });
  setIfDefined(getValue<Money>(graphResult, "qualifyingPayment"), (value) => {
    derived.qualifyingPayment = value;
  });

  return {
    productId: product.id,
    productName: product.name,
    variantId: variant.id,
    eligible,
    checks,
    failureReasons: extractFailureReasons(checks),
    warnings: extractWarnings(checks),
    derived,
  };
};
