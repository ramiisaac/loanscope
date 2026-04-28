import type { ProductDefinition, Transaction, TransactionVariant } from "@loanscope/domain";
import type { UnderwritingResult } from "@loanscope/domain";
import { evaluateProduct } from "./evaluate-product";

export interface EvaluationGroup {
  variantId: string;
  variantLabel: string;
  results: UnderwritingResult[];
}

export const evaluateAllProducts = (
  transaction: Transaction,
  variant: TransactionVariant,
  products: ProductDefinition[],
): UnderwritingResult[] =>
  products.map((product) => evaluateProduct(transaction, variant, product));

export const evaluateAll = (
  transaction: Transaction,
  products: ProductDefinition[],
): EvaluationGroup[] => {
  return transaction.variants.map((variant) => ({
    variantId: variant.id,
    variantLabel: variant.label,
    results: evaluateAllProducts(transaction, variant, products),
  }));
};
