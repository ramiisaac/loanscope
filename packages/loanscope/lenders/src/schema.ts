import type { ProductDefinition, LenderDefinition } from "@loanscope/domain";

// ---------------------------------------------------------------------------
// Lender ingestion types
// ---------------------------------------------------------------------------

/** Preset: a named subset of a lender's product catalog. */
export interface LenderPreset {
  readonly id: string;
  readonly name: string;
  readonly productIds: readonly string[];
}

/**
 * Raw lender input before registry validation. Mirrors LenderDefinition
 * from domain but adds optional presets for product-source flows.
 */
export interface LenderDefinitionInput {
  readonly id: string;
  readonly name: string;
  readonly products: readonly ProductDefinition[];
  readonly presets?: readonly LenderPreset[];
}

// ---------------------------------------------------------------------------
// Validated lender (post-ingestion)
// ---------------------------------------------------------------------------

/** A lender that has passed schema validation and is safe to register. */
export interface ValidatedLender {
  readonly id: string;
  readonly name: string;
  readonly products: readonly ProductDefinition[];
  readonly presets: readonly LenderPreset[];
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

const LENDER_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

export class LenderValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LenderValidationError";
  }
}

/** Validates a lender ID: non-empty, alphanumeric plus dash/underscore. */
function validateLenderId(id: string): void {
  if (!id || id.trim().length === 0) {
    throw new LenderValidationError("Lender ID must be non-empty");
  }
  if (!LENDER_ID_PATTERN.test(id)) {
    throw new LenderValidationError(
      `Lender ID "${id}" contains invalid characters. Only alphanumeric, dash, and underscore are allowed.`,
    );
  }
}

/** Validates that a product array is non-empty and all products have IDs. */
function validateProducts(products: readonly ProductDefinition[], lenderId: string): void {
  if (products.length === 0) {
    throw new LenderValidationError(`Lender "${lenderId}" must have at least one product`);
  }
  const seen = new Set<string>();
  for (const product of products) {
    if (!product.id || product.id.trim().length === 0) {
      throw new LenderValidationError(`Lender "${lenderId}" contains a product with an empty ID`);
    }
    if (seen.has(product.id)) {
      throw new LenderValidationError(
        `Lender "${lenderId}" contains duplicate product ID "${product.id}"`,
      );
    }
    seen.add(product.id);
  }
}

/** Validates presets reference only known product IDs within the lender. */
function validatePresets(
  presets: readonly LenderPreset[],
  productIds: ReadonlySet<string>,
  lenderId: string,
): void {
  const seenPresetIds = new Set<string>();
  for (const preset of presets) {
    if (!preset.id || preset.id.trim().length === 0) {
      throw new LenderValidationError(`Lender "${lenderId}" contains a preset with an empty ID`);
    }
    if (!LENDER_ID_PATTERN.test(preset.id)) {
      throw new LenderValidationError(
        `Preset ID "${preset.id}" in lender "${lenderId}" contains invalid characters`,
      );
    }
    if (seenPresetIds.has(preset.id)) {
      throw new LenderValidationError(
        `Lender "${lenderId}" contains duplicate preset ID "${preset.id}"`,
      );
    }
    seenPresetIds.add(preset.id);

    if (preset.productIds.length === 0) {
      throw new LenderValidationError(
        `Preset "${preset.id}" in lender "${lenderId}" must reference at least one product`,
      );
    }
    for (const pid of preset.productIds) {
      if (!productIds.has(pid)) {
        throw new LenderValidationError(
          `Preset "${preset.id}" in lender "${lenderId}" references unknown product "${pid}"`,
        );
      }
    }
  }
}

/**
 * Validates a raw lender input and returns a validated lender.
 * Throws LenderValidationError on any schema violation.
 */
export function validateLenderInput(input: LenderDefinitionInput): ValidatedLender {
  validateLenderId(input.id);
  validateProducts(input.products, input.id);

  const productIds = new Set(input.products.map((p) => p.id));
  const presets = input.presets ?? [];
  validatePresets(presets, productIds, input.id);

  return {
    id: input.id,
    name: input.name,
    products: input.products,
    presets,
  };
}

/** Converts a ValidatedLender to the domain LenderDefinition shape. */
export function toLenderDefinition(lender: ValidatedLender): LenderDefinition {
  return {
    id: lender.id,
    name: lender.name,
    products: [...lender.products],
  };
}
