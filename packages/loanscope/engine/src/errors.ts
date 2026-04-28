/** Explicit engine error types for typed catch handling. */

export class EngineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EngineError";
  }
}

/** Thrown when a product does not support the requested term, amortization, or occupancy combination. */
export class UnsupportedProductError extends EngineError {
  readonly productId: string;
  readonly detail: string;

  constructor(productId: string, detail: string) {
    super(`Unsupported product configuration for ${productId}: ${detail}`);
    this.name = "UnsupportedProductError";
    this.productId = productId;
    this.detail = detail;
  }
}

/** Thrown when variant resolution fails (no matching variant, ambiguous variants, missing occupancy constraints). */
export class VariantResolutionError extends EngineError {
  readonly productId: string;
  readonly detail: string;

  constructor(productId: string, detail: string) {
    super(`Variant resolution failed for ${productId}: ${detail}`);
    this.name = "VariantResolutionError";
    this.productId = productId;
    this.detail = detail;
  }
}

/** Thrown when constraint resolution fails (missing base constraints, incompatible tier). */
export class ConstraintResolutionError extends EngineError {
  readonly productId: string;
  readonly detail: string;

  constructor(productId: string, detail: string) {
    super(`Constraint resolution failed for ${productId}: ${detail}`);
    this.name = "ConstraintResolutionError";
    this.productId = productId;
    this.detail = detail;
  }
}

/** Thrown when input validation fails before graph evaluation. */
export class ValidationError extends EngineError {
  readonly field: string;
  readonly detail: string;

  constructor(field: string, detail: string) {
    super(`Validation error on ${field}: ${detail}`);
    this.name = "ValidationError";
    this.field = field;
    this.detail = detail;
  }
}

/** Type guard: returns true for product-level configuration errors that produce ineligible results. */
export const isProductConfigurationError = (
  error: unknown,
): error is UnsupportedProductError | VariantResolutionError | ConstraintResolutionError =>
  error instanceof UnsupportedProductError ||
  error instanceof VariantResolutionError ||
  error instanceof ConstraintResolutionError;
