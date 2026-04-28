import type { lenderPresets } from "../schema";
import type { PresetRecord } from "../repositories/preset-repository";

/**
 * Deserializes the stored `productIds` JSON array. The persistence boundary
 * trusts payloads it previously serialized via `JSON.stringify`.
 */
export const parsePresetProductIds = (raw: string): readonly string[] => {
  return JSON.parse(raw) as string[];
};

/**
 * Serializes a `productIds` list for storage in the `lenderPresets.productIds`
 * column. Paired with `parsePresetProductIds` to guarantee round-trip stability.
 */
export const serializePresetProductIds = (productIds: readonly string[]): string =>
  JSON.stringify(productIds);

/**
 * Converts a `lenderPresets` row into a domain `PresetRecord`, including
 * deserialization of the `productIds` JSON column.
 */
export const toPresetRecord = (row: typeof lenderPresets.$inferSelect): PresetRecord => ({
  id: row.id,
  lenderId: row.lenderId,
  presetId: row.presetId,
  name: row.name,
  productIds: parsePresetProductIds(row.productIds),
});
