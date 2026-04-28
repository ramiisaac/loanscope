import type { ProductDefinition } from "@loanscope/domain";
import type { catalogVersions } from "../schema";
import type { CatalogVersionRecord } from "../repositories/catalog-repository";

/**
 * Current payload schema version. Bump only on a breaking shape change to
 * the persisted ProductDefinition JSON. Reading code maintains backward
 * compatibility for `CURRENT_PAYLOAD_VERSION - 1` (one breaking shape
 * change behind); everything older surfaces as `unsupported-prior`.
 */
export const CURRENT_PAYLOAD_VERSION = 1;

/**
 * Classification of a stored `payload_version` relative to the host code's
 * `CURRENT_PAYLOAD_VERSION`. Drives the read-time warning surface.
 *
 * - `current`             — stored version equals the host code's current.
 * - `compatible-prior`    — stored is exactly one major behind; host can
 *                           still deserialize without migration.
 * - `unsupported-prior`   — stored is two or more majors behind; the host
 *                           no longer guarantees a clean read.
 * - `future`              — stored is ahead of the host code; payload was
 *                           written by a newer build than the one reading
 *                           it, so unknown fields may exist.
 */
export type PayloadVersionAssessment =
  | {
      readonly kind: "current";
      readonly stored: number;
      readonly current: number;
    }
  | {
      readonly kind: "compatible-prior";
      readonly stored: number;
      readonly current: number;
      readonly message: string;
    }
  | {
      readonly kind: "unsupported-prior";
      readonly stored: number;
      readonly current: number;
      readonly message: string;
    }
  | {
      readonly kind: "future";
      readonly stored: number;
      readonly current: number;
      readonly message: string;
    };

/**
 * Classifies a stored `payload_version` against the host's
 * `CURRENT_PAYLOAD_VERSION` (or an explicit `current` for tests). Pure
 * function; emits no side effects. Callers decide whether to log, throw,
 * or silently proceed based on the returned `kind`.
 */
export const assessPayloadVersion = (
  stored: number,
  current: number = CURRENT_PAYLOAD_VERSION,
): PayloadVersionAssessment => {
  if (!Number.isInteger(stored) || stored < 0) {
    throw new RangeError(`payload_version must be a non-negative integer, got ${stored}`);
  }
  if (!Number.isInteger(current) || current < 1) {
    throw new RangeError(`current payload_version must be a positive integer, got ${current}`);
  }
  if (stored === current) {
    return { kind: "current", stored, current };
  }
  if (stored === current - 1) {
    return {
      kind: "compatible-prior",
      stored,
      current,
      message: `Catalog payload v${stored} is one shape behind the current v${current}; reading with backward-compatible adapter.`,
    };
  }
  if (stored < current - 1) {
    return {
      kind: "unsupported-prior",
      stored,
      current,
      message: `Catalog payload v${stored} is more than one shape behind the current v${current}; clean read is not guaranteed. Re-import the catalog at the current shape.`,
    };
  }
  return {
    kind: "future",
    stored,
    current,
    message: `Catalog payload v${stored} is ahead of the host code's current v${current}; payload may contain unknown fields. Update the loanscope build before treating this read as authoritative.`,
  };
};

/**
 * Converts a `catalogVersions` row into a domain `CatalogVersionRecord`.
 */
export const toCatalogVersionRecord = (
  row: typeof catalogVersions.$inferSelect,
): CatalogVersionRecord => ({
  id: row.id,
  lenderId: row.lenderId,
  version: row.version,
  payloadVersion: row.payloadVersion,
  sourceFile: row.sourceFile,
  contentHash: row.contentHash,
  importedAt: row.importedAt,
});

/**
 * Convenience adapter: classify a `CatalogVersionRecord`'s payload version
 * against the host code's current shape. Equivalent to calling
 * `assessPayloadVersion(record.payloadVersion)` but threads the lender id
 * and catalog version into the message for richer logging.
 */
export const assessCatalogPayloadVersion = (
  record: Pick<CatalogVersionRecord, "lenderId" | "version" | "payloadVersion">,
  current: number = CURRENT_PAYLOAD_VERSION,
): PayloadVersionAssessment => {
  const base = assessPayloadVersion(record.payloadVersion, current);
  if (base.kind === "current") return base;
  return {
    ...base,
    message: `Lender "${record.lenderId}" catalog v${record.version}: ${base.message}`,
  };
};

/**
 * Deserializes a stored product catalog JSON payload into a `ProductDefinition`.
 * Validation of the parsed shape is the caller's responsibility; the persistence
 * boundary trusts payloads it previously serialized via `JSON.stringify`.
 */
export const parseProductPayload = (payload: string): ProductDefinition => {
  return JSON.parse(payload) as ProductDefinition;
};
