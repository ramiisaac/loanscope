import fs from "node:fs";
import path from "node:path";
import type { ProductDefinition } from "@loanscope/domain";
import { loadYamlFile } from "@loanscope/config";
import type { CustomProductSetRecord, DatabaseManager, ValidationStatus } from "@loanscope/db";
import { validateProductStructure } from "@loanscope/db";
import { CliValidationError } from "../../cli-error";

export interface CustomProductSetMetadata {
  readonly setId: string;
  readonly name: string;
  readonly lenderId: string | null;
  readonly productCount: number;
  readonly validationStatus: ValidationStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CustomProductSetFullJson extends CustomProductSetMetadata {
  readonly products: readonly ProductDefinition[];
}

export const toCustomProductSetMetadata = (
  record: CustomProductSetRecord,
): CustomProductSetMetadata => ({
  setId: record.setId,
  name: record.name,
  lenderId: record.lenderId,
  productCount: record.products.length,
  validationStatus: record.validationStatus,
  createdAt: record.createdAt,
  updatedAt: record.updatedAt,
});

/**
 * Loads a custom product set by id or throws a `CliValidationError`. Exported
 * so follow-on commands can reuse the same unknown-id contract.
 */
export const requireCustomProductSet = (
  manager: DatabaseManager,
  setId: string,
): CustomProductSetRecord => {
  const found = manager.customProducts.getSet(setId);
  if (!found) {
    throw new CliValidationError(`Unknown custom product set: "${setId}".`);
  }
  return found;
};

/**
 * Extension-dispatched loader for a custom product file. YAML files are read
 * via the canonical `@loanscope/config` loader; JSON files are parsed with the
 * built-in parser. Any other extension is rejected at the CLI boundary.
 */
export const readProductsFile = (filePath: string): unknown => {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".yaml" || ext === ".yml") {
    return loadYamlFile(filePath);
  }
  if (ext === ".json") {
    const content = fs.readFileSync(filePath, "utf8");
    try {
      return JSON.parse(content) as unknown;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new CliValidationError(`Failed to parse JSON product file "${filePath}": ${message}`);
    }
  }

  throw new CliValidationError(
    `Unsupported product file extension: "${ext || "(none)"}". ` +
      `Expected .yaml, .yml, or .json.`,
  );
};

const hasObjectShape = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const extractProducts = (raw: unknown): ProductDefinition[] => {
  if (!hasObjectShape(raw)) {
    throw new CliValidationError(
      "Custom product file must be an object with a top-level `products` array.",
    );
  }
  const productsField = raw.products;
  if (!Array.isArray(productsField)) {
    throw new CliValidationError("Custom product file is missing a top-level `products` array.");
  }
  if (productsField.length === 0) {
    throw new CliValidationError(
      "Custom product file `products` array must contain at least one entry.",
    );
  }
  for (const [index, entry] of productsField.entries()) {
    if (!hasObjectShape(entry)) {
      throw new CliValidationError(`Custom product at index ${index} must be an object.`);
    }
  }

  return productsField as ProductDefinition[];
};

const assertStructurallyValid = (products: readonly ProductDefinition[]): void => {
  const failures: string[] = [];
  for (const [index, product] of products.entries()) {
    const errors = validateProductStructure(product);
    if (errors.length > 0) {
      const locator =
        typeof product.id === "string" && product.id.trim().length > 0
          ? `"${product.id}"`
          : `index ${index}`;
      for (const message of errors) {
        failures.push(`  - product ${locator}: ${message}`);
      }
    }
  }

  if (failures.length > 0) {
    throw new CliValidationError(
      `Custom product file failed structural validation:\n${failures.join("\n")}`,
    );
  }
};

export const loadProductsFromFile = (filePath: string): readonly ProductDefinition[] => {
  const products = extractProducts(readProductsFile(filePath));
  assertStructurallyValid(products);
  return products;
};
