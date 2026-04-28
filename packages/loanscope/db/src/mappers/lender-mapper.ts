import type { lenders } from "../schema";
import type { LenderRecord } from "../repositories/lender-repository";

/**
 * Converts a `lenders` row into a domain `LenderRecord`.
 * Pure projection: no JSON parsing, no nullability coercion beyond the row shape.
 */
export const toLenderRecord = (row: typeof lenders.$inferSelect): LenderRecord => ({
  id: row.id,
  name: row.name,
  sourceKind: row.sourceKind,
  version: row.version,
  active: row.active,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});
