import type { ProductDefinition } from "@loanscope/domain";
import type { customProductSets } from "../schema";
import type { CustomProductSetRecord } from "../repositories/custom-product-set-repository";

/**
 * Deserializes the stored custom-product-set payload into domain
 * `ProductDefinition` values. The persistence boundary trusts payloads it
 * previously serialized via `JSON.stringify`; callers validate semantics via
 * `validateProductStructure` when needed.
 */
export const parseCustomProductSetPayload = (raw: string): readonly ProductDefinition[] => {
  return JSON.parse(raw) as ProductDefinition[];
};

/**
 * Serializes a product list for storage in the `customProductSets.payload`
 * column. Paired with `parseCustomProductSetPayload` for round-trip stability.
 */
export const serializeCustomProductSetPayload = (products: readonly ProductDefinition[]): string =>
  JSON.stringify(products);

/**
 * Converts a `customProductSets` row into a domain `CustomProductSetRecord`,
 * including JSON deserialization of the product payload.
 */
export const toCustomProductSetRecord = (
  row: typeof customProductSets.$inferSelect,
): CustomProductSetRecord => ({
  id: row.id,
  setId: row.setId,
  name: row.name,
  lenderId: row.lenderId,
  products: parseCustomProductSetPayload(row.payload),
  validationStatus: row.validationStatus,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});
