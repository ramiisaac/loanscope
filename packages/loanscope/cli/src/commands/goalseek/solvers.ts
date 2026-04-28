import {
  findMaxLoanAmount,
  findMaxLoanByLTV,
  findMaxLoanByDTI,
  findMinDownPayment,
  findMinFico,
  findMaxPurchasePrice,
  findMinReserves,
} from "@loanscope/compare";
import type { GoalSeekResult } from "@loanscope/compare";
import { getAllProducts, filterDisplayProducts } from "@loanscope/products";
import { CliValidationError } from "../../cli-error";
import { parseCliRatio } from "../../cli-parsers";
import { validateProductId } from "../../cli-validators";
import { loadTransaction } from "../../config-loaders";
import { applyScenarioOverrides } from "../scenario-overrides";
import {
  assertCompatibleProducts,
  filterProductsByScenarioCompatibility,
} from "../scenario-compatibility";
import { parseBounds, parseFicoBounds, parseMaxIterations, parseTolerance } from "./parse-bounds";

interface GoalSeekBaseOptions {
  readonly product: string;
  readonly config?: string;
  readonly rate?: string;
  readonly term?: string;
  readonly program?: string;
  readonly armFixed?: string;
  readonly output?: string;
}

interface GoalSeekBoundedOptions extends GoalSeekBaseOptions {
  readonly min: string;
  readonly max: string;
  readonly tolerance?: string;
  readonly maxIterations?: string;
}

export type MaxLoanOptions = GoalSeekBoundedOptions;

export interface MaxLoanByLtvOptions extends GoalSeekBoundedOptions {
  readonly ltv: string;
}

export interface MaxLoanByDtiOptions extends GoalSeekBoundedOptions {
  readonly dti: string;
}

export type MinDownOptions = GoalSeekBoundedOptions;

export type MinFicoOptions = GoalSeekBoundedOptions;

export type MaxPriceOptions = GoalSeekBoundedOptions;

export type MinReservesOptions = GoalSeekBoundedOptions;

const selectProduct = (productId: string, transaction: ReturnType<typeof loadTransaction>) => {
  const products = filterProductsByScenarioCompatibility(
    filterDisplayProducts(getAllProducts()),
    transaction,
  );
  assertCompatibleProducts(products, transaction);
  const knownIds = products.map((product) => product.id);
  validateProductId(productId, knownIds);
  const product = products.find((candidate) => candidate.id === productId);
  if (!product) {
    throw new CliValidationError(
      `Product not found: "${productId}". Known products: ${knownIds.join(", ")}`,
    );
  }
  return product;
};

const loadGoalSeekContext = (options: GoalSeekBaseOptions, configPath: string | undefined) => {
  const transaction = applyScenarioOverrides(loadTransaction(configPath), options);
  return {
    transaction,
    product: selectProduct(options.product, transaction),
  };
};

export const runMaxLoanAmount = (
  options: MaxLoanOptions,
  configPath: string | undefined,
): GoalSeekResult => {
  const { transaction, product } = loadGoalSeekContext(options, configPath);
  const bounds = parseBounds(options.min, options.max, "max-loan");
  const tolerance = parseTolerance(options.tolerance, "max-loan");
  const maxIterations = parseMaxIterations(options.maxIterations, "max-loan");
  return findMaxLoanAmount({
    target: "MaxLoanAmount",
    transaction,
    product,
    bounds,
    ...(tolerance !== undefined ? { tolerance } : {}),
    ...(maxIterations !== undefined ? { maxIterations } : {}),
  });
};

export const runMaxLoanByLtv = (
  options: MaxLoanByLtvOptions,
  configPath: string | undefined,
): GoalSeekResult => {
  const { transaction, product } = loadGoalSeekContext(options, configPath);
  const targetLtv = parseCliRatio(options.ltv, "target LTV");
  const bounds = parseBounds(options.min, options.max, "max-loan-ltv");
  const tolerance = parseTolerance(options.tolerance, "max-loan-ltv");
  const maxIterations = parseMaxIterations(options.maxIterations, "max-loan-ltv");
  return findMaxLoanByLTV(transaction, product, targetLtv, bounds, tolerance, maxIterations);
};

export const runMaxLoanByDti = (
  options: MaxLoanByDtiOptions,
  configPath: string | undefined,
): GoalSeekResult => {
  const { transaction, product } = loadGoalSeekContext(options, configPath);
  const targetDti = parseCliRatio(options.dti, "target DTI");
  const bounds = parseBounds(options.min, options.max, "max-loan-dti");
  const tolerance = parseTolerance(options.tolerance, "max-loan-dti");
  const maxIterations = parseMaxIterations(options.maxIterations, "max-loan-dti");
  return findMaxLoanByDTI(transaction, product, targetDti, bounds, tolerance, maxIterations);
};

export const runMinDownPayment = (
  options: MinDownOptions,
  configPath: string | undefined,
): GoalSeekResult => {
  const { transaction, product } = loadGoalSeekContext(options, configPath);
  const bounds = parseBounds(options.min, options.max, "min-down");
  const tolerance = parseTolerance(options.tolerance, "min-down");
  const maxIterations = parseMaxIterations(options.maxIterations, "min-down");
  return findMinDownPayment({
    target: "MinDownPayment",
    transaction,
    product,
    bounds,
    ...(tolerance !== undefined ? { tolerance } : {}),
    ...(maxIterations !== undefined ? { maxIterations } : {}),
  });
};

export const runMinFico = (
  options: MinFicoOptions,
  configPath: string | undefined,
): GoalSeekResult => {
  const { transaction, product } = loadGoalSeekContext(options, configPath);
  const bounds = parseFicoBounds(options.min, options.max, "min-fico");
  const tolerance = parseTolerance(options.tolerance, "min-fico");
  const maxIterations = parseMaxIterations(options.maxIterations, "min-fico");
  return findMinFico({
    target: "MinFico",
    transaction,
    product,
    bounds,
    ...(tolerance !== undefined ? { tolerance } : {}),
    ...(maxIterations !== undefined ? { maxIterations } : {}),
  });
};

export const runMaxPurchasePrice = (
  options: MaxPriceOptions,
  configPath: string | undefined,
): GoalSeekResult => {
  const { transaction, product } = loadGoalSeekContext(options, configPath);
  const bounds = parseBounds(options.min, options.max, "max-price");
  const tolerance = parseTolerance(options.tolerance, "max-price");
  const maxIterations = parseMaxIterations(options.maxIterations, "max-price");
  return findMaxPurchasePrice({
    target: "MaxPurchasePrice",
    transaction,
    product,
    bounds,
    ...(tolerance !== undefined ? { tolerance } : {}),
    ...(maxIterations !== undefined ? { maxIterations } : {}),
  });
};

export const runMinReserves = (
  options: MinReservesOptions,
  configPath: string | undefined,
): GoalSeekResult => {
  const { transaction, product } = loadGoalSeekContext(options, configPath);
  const bounds = parseBounds(options.min, options.max, "min-reserves");
  const tolerance = parseTolerance(options.tolerance, "min-reserves");
  const maxIterations = parseMaxIterations(options.maxIterations, "min-reserves");
  return findMinReserves({
    target: "MinReserves",
    transaction,
    product,
    bounds,
    ...(tolerance !== undefined ? { tolerance } : {}),
    ...(maxIterations !== undefined ? { maxIterations } : {}),
  });
};
