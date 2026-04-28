import { buildId } from "../../ids";
import { CliValidationError } from "../../cli-error";
import { loadProductsFromFile } from "./shared";

import type { DatabaseManager, ValidationStatus } from "@loanscope/db";

export interface CreateCustomProductSetInput {
  readonly filePath: string;
  readonly name: string;
  readonly setId?: string;
  readonly lenderId?: string;
  readonly now?: Date;
}

export interface CreateCustomProductSetResult {
  readonly setId: string;
  readonly name: string;
  readonly productCount: number;
  readonly validationStatus: ValidationStatus;
}

/**
 * Loads a custom product file, validates every product structurally, and
 * persists the set via {@link DatabaseManager#customProducts}. The `setId` is
 * derived deterministically from `--name` plus a UTC timestamp suffix unless
 * an explicit override is supplied.
 */
export const createCustomProductSetAction = (
  manager: DatabaseManager,
  input: CreateCustomProductSetInput,
): CreateCustomProductSetResult => {
  const trimmedName = input.name.trim();
  if (trimmedName.length === 0) {
    throw new CliValidationError("Invalid custom product set name: value must not be empty.");
  }

  const products = loadProductsFromFile(input.filePath);
  const setId = buildId(input.setId, trimmedName, {
    ...(input.now !== undefined ? { now: input.now } : {}),
    fallback: "product-set",
  });

  try {
    const record = manager.customProducts.createSet({
      setId,
      name: trimmedName,
      ...(input.lenderId !== undefined ? { lenderId: input.lenderId } : {}),
      products,
    });

    return {
      setId: record.setId,
      name: record.name,
      productCount: record.products.length,
      validationStatus: record.validationStatus,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new CliValidationError(`Failed to create custom product set "${setId}": ${message}`);
  }
};
