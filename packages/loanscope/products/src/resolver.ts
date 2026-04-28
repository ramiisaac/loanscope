import type { ProductDefinition } from "@loanscope/domain";
import { mergeRules, toProgramRules } from "@loanscope/program-rules";

/**
 * Resolves a product's `extends` chain by merging base constraints up
 * the chain via `mergeRules`. The returned definition carries the
 * flattened `baseConstraints`; variant / occupancy / tier overrides are
 * NOT applied here -- those are runtime concerns owned by
 * `@loanscope/engine#getEffectiveConstraints`.
 *
 * `visited` guards against circular `extends` chains; the first
 * recursion seeds it implicitly.
 */
export const resolveProductDefinition = (
  product: ProductDefinition,
  catalog: Map<string, ProductDefinition>,
  visited: Set<string> = new Set(),
): ProductDefinition => {
  if (!product.extends) return product;

  if (visited.has(product.id)) {
    const chain = [...visited, product.id].join(" -> ");
    throw new Error(`Circular extends chain detected: ${chain}`);
  }
  visited.add(product.id);

  const base = catalog.get(product.extends);
  if (!base) {
    throw new Error(`Base product ${product.extends} not found for ${product.id}`);
  }

  const resolvedBase = resolveProductDefinition(base, catalog, visited);
  const baseConstraints = resolvedBase.baseConstraints;
  const childConstraints = product.baseConstraints;

  const resolvedBaseRules = baseConstraints
    ? toProgramRules(baseConstraints, `product ${resolvedBase.id}`)
    : undefined;

  const resolvedChildRules = childConstraints
    ? resolvedBaseRules
      ? childConstraints
      : toProgramRules(childConstraints, `product ${product.id}`)
    : undefined;

  const mergedConstraints =
    resolvedBaseRules && childConstraints
      ? mergeRules(resolvedBaseRules, childConstraints)
      : (resolvedChildRules ?? resolvedBaseRules);

  // Don't inherit base flag -- only the product itself can set it
  const { metadata: baseMetadata, ...restBase } = resolvedBase;
  const mergedMetadata = product.metadata ?? (baseMetadata?.base ? undefined : baseMetadata);

  return {
    ...restBase,
    ...product,
    ...(mergedConstraints ? { baseConstraints: mergedConstraints } : {}),
    ...(mergedMetadata ? { metadata: mergedMetadata } : {}),
  };
};

/** Resolves the full product catalog, flattening all inheritance chains. */
export const resolveAllProducts = (products: ProductDefinition[]): ProductDefinition[] => {
  const catalog = new Map(products.map((p) => [p.id, p]));
  return products.map((p) => resolveProductDefinition(p, catalog));
};

/** Filters out base/abstract products not intended for display. */
export const filterDisplayProducts = (products: ProductDefinition[]): ProductDefinition[] => {
  return products.filter((p) => p.metadata?.base !== true);
};

// Re-export the canonical variant resolver for downstream consumers that
// historically imported it from `@loanscope/products`. The single source
// of truth lives in `@loanscope/program-rules`.
export { resolveVariant } from "@loanscope/program-rules";
