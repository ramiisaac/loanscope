// Validators that confirm CLI-supplied identifiers exist in the
// catalog and that goal-seek bounds / tolerance are well-formed.
//
// All errors are surfaced as `CliValidationError` so the top-level
// handler can produce a clean exit message.

import { CliValidationError } from "./cli-error";

/** Validate that a lender ID exists among known lenders. */
export const validateLenderId = (lenderId: string, knownLenderIds: readonly string[]): void => {
  if (!knownLenderIds.includes(lenderId)) {
    throw new CliValidationError(
      `Unknown lender: "${lenderId}". Known lenders: ${knownLenderIds.join(", ")}`,
    );
  }
};

/** Validate that a product ID exists among known products. */
export const validateProductId = (productId: string, knownProductIds: readonly string[]): void => {
  if (!knownProductIds.includes(productId)) {
    throw new CliValidationError(
      `Unknown product: "${productId}". Known products: ${knownProductIds.join(", ")}`,
    );
  }
};

/** Validate a list of product IDs. */
export const validateProductIds = (
  productIds: readonly string[],
  knownProductIds: readonly string[],
): void => {
  for (const id of productIds) {
    validateProductId(id, knownProductIds);
  }
};

/** Validate a list of lender IDs. */
export const validateLenderIds = (
  lenderIds: readonly string[],
  knownLenderIds: readonly string[],
): void => {
  for (const id of lenderIds) {
    validateLenderId(id, knownLenderIds);
  }
};

/** Validate that goal-seek bounds are well-formed: min < max, both non-negative. */
export const validateGoalSeekBounds = (min: number, max: number, label: string): void => {
  if (min < 0) {
    throw new CliValidationError(`Invalid ${label} min bound: ${min} must be non-negative.`);
  }
  if (max < 0) {
    throw new CliValidationError(`Invalid ${label} max bound: ${max} must be non-negative.`);
  }
  if (min >= max) {
    throw new CliValidationError(
      `Invalid ${label} bounds: min (${min}) must be less than max (${max}).`,
    );
  }
};

/** Validate that tolerance is positive and reasonable. */
export const validateGoalSeekTolerance = (tolerance: number, label: string): void => {
  if (!Number.isFinite(tolerance) || tolerance <= 0) {
    throw new CliValidationError(
      `Invalid ${label} tolerance: must be a positive finite number, got ${tolerance}.`,
    );
  }
};
