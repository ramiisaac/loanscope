import {
  AmortizationType,
  ProgramKind,
  type ProductDefinition,
  type Transaction,
} from "@loanscope/domain";
import { CliValidationError } from "../cli-error";
const getScenarioAmortizationType = (transaction: Transaction): AmortizationType => {
  const rateNote = transaction.scenario.rateNote;
  if (rateNote.productKind === ProgramKind.InterestOnly || (rateNote.interestOnlyMonths ?? 0) > 0) {
    return AmortizationType.InterestOnly;
  }

  if (rateNote.productKind === ProgramKind.ARM) {
    return AmortizationType.ARM;
  }

  return AmortizationType.FullyAmortizing;
};

const isProductCompatibleWithScenario = (
  product: ProductDefinition,
  transaction: Transaction,
): boolean => {
  const rateNote = transaction.scenario.rateNote;
  const amortizationType = getScenarioAmortizationType(transaction);

  return product.variants.some((variant) => {
    if (variant.amortization.type !== amortizationType) {
      return false;
    }

    if (rateNote.productKind !== undefined && variant.programKind !== rateNote.productKind) {
      return false;
    }

    if (
      amortizationType === AmortizationType.ARM &&
      rateNote.arm?.initialFixedMonths !== undefined &&
      variant.armDetails?.initialFixedMonths !== rateNote.arm.initialFixedMonths
    ) {
      return false;
    }

    return variant.terms.includes(rateNote.amortizationMonths ?? 360);
  });
};

export const filterProductsByScenarioCompatibility = (
  products: ProductDefinition[],
  transaction: Transaction,
): ProductDefinition[] => {
  return products.filter((product) => isProductCompatibleWithScenario(product, transaction));
};

const describeScenarioProgram = (transaction: Transaction): string => {
  const rateNote = transaction.scenario.rateNote;
  if (rateNote.productKind === ProgramKind.ARM) {
    const fixedMonths = rateNote.arm?.initialFixedMonths;
    return fixedMonths !== undefined ? `ARM ${fixedMonths}` : "ARM";
  }

  return rateNote.productKind ?? ProgramKind.Fixed;
};

export const assertCompatibleProducts = (
  products: ProductDefinition[],
  transaction: Transaction,
): ProductDefinition[] => {
  if (products.length > 0) {
    return products;
  }

  const term = transaction.scenario.rateNote.amortizationMonths ?? 360;
  throw new CliValidationError(
    `No products match the current scenario (${describeScenarioProgram(transaction)}, ${term}-month term). Adjust scenario overrides or product filters.`,
  );
};
