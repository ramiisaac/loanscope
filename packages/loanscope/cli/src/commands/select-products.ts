import type { ProductDefinition, ProductSourceSelection, Transaction } from "@loanscope/domain";
import { filterDisplayProducts, getAllProducts } from "@loanscope/products";
import { parseCliList } from "../cli-parsers";
import { validateLenderIds, validateProductIds } from "../cli-validators";
import {
  buildProductSourceFromFlags,
  filterByProductSource,
  resolveProductSource,
  type ProductSourceFlags,
} from "./product-source";
import {
  assertCompatibleProducts,
  filterProductsByScenarioCompatibility,
} from "./scenario-compatibility";

export interface ProductSelectionOptions extends ProductSourceFlags {
  requireUnflaggedGenericNarrowing?: boolean;
}

export const selectProductsForTransaction = (
  transaction: Transaction,
  options: ProductSelectionOptions,
  configProductSource?: ProductSourceSelection,
): {
  products: ProductDefinition[];
  effectiveSource: ProductSourceSelection;
} => {
  const allProducts = filterDisplayProducts(getAllProducts());
  const flagSource = buildProductSourceFromFlags(options);
  const effectiveSource = resolveProductSource(flagSource, configProductSource);

  let products = filterByProductSource(allProducts, effectiveSource);
  const requireUnflaggedGenericNarrowing = options.requireUnflaggedGenericNarrowing ?? false;

  if (
    options.lender &&
    effectiveSource.kind === "generic" &&
    (!requireUnflaggedGenericNarrowing || !flagSource)
  ) {
    const allLenderIds = [...new Set(products.map((p) => p.lenderId).filter(Boolean))] as string[];
    validateLenderIds([options.lender], allLenderIds);
    products = products.filter((p) => p.lenderId === options.lender);
  }

  if (
    options.products &&
    effectiveSource.kind === "generic" &&
    (!requireUnflaggedGenericNarrowing || !flagSource)
  ) {
    const productIds = parseCliList(options.products);
    const allProductIds = products.map((p) => p.id);
    validateProductIds(productIds, allProductIds);
    products = products.filter((p) => productIds.includes(p.id));
  }

  return {
    products: assertCompatibleProducts(
      filterProductsByScenarioCompatibility(products, transaction),
      transaction,
    ),
    effectiveSource,
  };
};
