import type { ProductSourceSelection } from "@loanscope/domain";
import type { ProductDefinition } from "@loanscope/domain";
import { assertNever } from "@loanscope/domain";
import { CliValidationError } from "../cli-error";
import { parseCliList } from "../cli-parsers";
/**
 * Typed CLI flags that control product-source resolution.
 *
 * `lender` is the singular form used by quote/evaluate (--lender);
 * `lenders` is the plural form used by compare (--lenders).
 * Both are optional; at most one should be supplied per invocation.
 */
export interface ProductSourceFlags {
  lender?: string;
  lenders?: string;
  products?: string;
  productSource?: string;
}

/**
 * Derive a single lender id string from the flags.
 * Prefers singular --lender; falls back to the first entry of --lenders.
 */
const extractLenderId = (flags: ProductSourceFlags): string | undefined => {
  if (flags.lender) return flags.lender;
  if (flags.lenders) {
    const ids = parseCliList(flags.lenders);
    return ids[0];
  }
  return undefined;
};

/**
 * Build a ProductSourceSelection from CLI flags.
 * Returns undefined when no product-source flags are provided.
 */
export const buildProductSourceFromFlags = (
  flags: ProductSourceFlags,
): ProductSourceSelection | undefined => {
  if (
    flags.productSource === undefined &&
    flags.lender === undefined &&
    flags.lenders === undefined &&
    flags.products === undefined
  ) {
    return undefined;
  }

  const kind = flags.productSource ?? "generic";

  if (kind === "custom") {
    if (!flags.products) {
      throw new CliValidationError(
        "Product source 'custom' requires --products to specify product ids.",
      );
    }
    const productIds = parseCliList(flags.products);
    const lenderId = extractLenderId(flags);
    return {
      kind: "custom",
      ...(lenderId !== undefined ? { lenderId } : {}),
      products: productIds,
    };
  }

  if (kind === "preset") {
    const lenderId = extractLenderId(flags);
    if (!lenderId) {
      throw new CliValidationError(
        "Product source 'preset' requires --lender/--lenders to identify the lender.",
      );
    }
    return {
      kind: "preset",
      lenderId,
      presetId: "default",
    };
  }

  if (kind !== "generic") {
    throw new CliValidationError(
      `Invalid --product-source value: "${kind}". Must be generic, preset, or custom.`,
    );
  }

  return { kind: "generic" };
};

/**
 * Filter a product list according to a resolved ProductSourceSelection.
 * For 'generic', all display products are returned.
 * For 'preset', products are filtered by lender id.
 * For 'custom', products are filtered to only the specified ids.
 */
export const filterByProductSource = (
  products: ProductDefinition[],
  source: ProductSourceSelection,
): ProductDefinition[] => {
  switch (source.kind) {
    case "generic":
      return products;

    case "preset": {
      const filtered = products.filter((p) => p.lenderId === source.lenderId);
      if (filtered.length === 0) {
        throw new CliValidationError(`No products found for lender "${source.lenderId}".`);
      }
      return filtered;
    }

    case "custom": {
      const requestedIds = source.products.map((p) =>
        typeof p === "string" ? p : ((p as { id?: string }).id ?? ""),
      );
      const filtered = products.filter((p) => requestedIds.includes(p.id));
      if (filtered.length === 0) {
        throw new CliValidationError(
          `None of the specified product ids matched available products.`,
        );
      }
      return filtered;
    }
    default:
      return assertNever(source);
  }
};

/**
 * Resolve the effective product source: CLI flags take priority,
 * then config-level productSource, falling back to generic.
 */
export const resolveProductSource = (
  flagSource: ProductSourceSelection | undefined,
  configSource: ProductSourceSelection | undefined,
): ProductSourceSelection => {
  if (flagSource) return flagSource;
  if (configSource) return configSource;
  return { kind: "generic" };
};
