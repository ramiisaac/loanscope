/**
 * @loanscope/db -- Drizzle schema definitions for the persistence layer.
 *
 * These tables store lender metadata, versioned product catalogs, presets,
 * and custom product sets. Complex nested structures (product definitions,
 * rule trees) are stored as JSON payloads, validated through domain adapters
 * before use, and never queried for underwriting logic.
 */
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

/* ------------------------------------------------------------------ */
/*  lenders                                                           */
/* ------------------------------------------------------------------ */

/**
 * Lender metadata. Each lender has a unique string ID, display name,
 * source kind (indicating how its products are managed), a schema
 * version for forward compatibility, and an active flag.
 */
export const lenders = sqliteTable("lenders", {
  /** Stable lender identifier (e.g. "uwm", "chase"). */
  id: text("id").primaryKey(),

  /** Human-readable lender name. */
  name: text("name").notNull(),

  /**
   * How this lender's products are sourced:
   * - "builtin": shipped with the application (e.g. UWM via @loanscope/products)
   * - "imported": ingested from external files
   * - "custom": user-defined
   */
  sourceKind: text("source_kind", {
    enum: ["builtin", "imported", "custom"],
  }).notNull(),

  /** Schema version of the lender row for forward compatibility. */
  version: integer("version").notNull().default(1),

  /** Whether this lender is active and should be included in lookups. */
  active: integer("active", { mode: "boolean" }).notNull().default(true),

  /** ISO-8601 creation timestamp. */
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),

  /** ISO-8601 last-update timestamp. */
  updatedAt: text("updated_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

/* ------------------------------------------------------------------ */
/*  catalog_versions                                                  */
/* ------------------------------------------------------------------ */

/**
 * Import provenance for product catalogs. Tracks the source file,
 * content hash, and timestamp for each catalog import so catalogs
 * can be versioned and reproduced.
 */
export const catalogVersions = sqliteTable("catalog_versions", {
  /** Auto-incrementing surrogate key. */
  id: integer("id").primaryKey({ autoIncrement: true }),

  /** FK to the lender this catalog belongs to. */
  lenderId: text("lender_id")
    .notNull()
    .references(() => lenders.id),

  /** Monotonically increasing import number per lender. */
  version: integer("version").notNull(),

  /**
   * Schema version of the `product_catalogs.payload` payloads in this
   * catalog version. Bumped only on a breaking shape change to the
   * persisted ProductDefinition JSON; defaults to 1 for all catalogs
   * written prior to the introduction of this column.
   */
  payloadVersion: integer("payload_version").notNull().default(1),

  /** Original source file name or path, if applicable. */
  sourceFile: text("source_file"),

  /** SHA-256 hash of the source payload for deduplication. */
  contentHash: text("content_hash").notNull(),

  /** ISO-8601 timestamp when this version was imported. */
  importedAt: text("imported_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

/* ------------------------------------------------------------------ */
/*  product_catalogs                                                  */
/* ------------------------------------------------------------------ */

/**
 * Versioned product definition payloads. Each row stores the full
 * JSON-serialized ProductDefinition for a single product within a
 * catalog version. The payload is validated through domain adapters
 * on read; it is never queried for underwriting logic.
 */
export const productCatalogs = sqliteTable("product_catalogs", {
  /** Auto-incrementing surrogate key. */
  id: integer("id").primaryKey({ autoIncrement: true }),

  /** FK to the catalog version this product belongs to. */
  catalogVersionId: integer("catalog_version_id")
    .notNull()
    .references(() => catalogVersions.id),

  /** The product's domain-level ID (e.g. "uwm_jumbo_pink"). */
  productId: text("product_id").notNull(),

  /** Human-readable product name. */
  productName: text("product_name").notNull(),

  /**
   * Full JSON-serialized ProductDefinition payload.
   * Validated through domain adapters before use.
   */
  payload: text("payload").notNull(),
});

/* ------------------------------------------------------------------ */
/*  lender_presets                                                    */
/* ------------------------------------------------------------------ */

/**
 * Named product subsets per lender. Each preset references a set of
 * product IDs that form a curated subset of the lender's catalog.
 */
export const lenderPresets = sqliteTable("lender_presets", {
  /** Auto-incrementing surrogate key. */
  id: integer("id").primaryKey({ autoIncrement: true }),

  /** FK to the lender this preset belongs to. */
  lenderId: text("lender_id")
    .notNull()
    .references(() => lenders.id),

  /** Unique preset identifier within the lender (e.g. "jumbo_all"). */
  presetId: text("preset_id").notNull(),

  /** Human-readable preset name. */
  name: text("name").notNull(),

  /**
   * JSON array of product IDs included in this preset.
   * Validated as string[] on read.
   */
  productIds: text("product_ids").notNull(),
});

/* ------------------------------------------------------------------ */
/*  custom_product_sets                                               */
/* ------------------------------------------------------------------ */

/**
 * User-defined product collections. These are not tied to a specific
 * lender catalog version -- they represent custom product definitions
 * created and maintained by the user.
 */
/* ------------------------------------------------------------------ */
/*  saved_scenarios                                                    */
/* ------------------------------------------------------------------ */

/**
 * Persisted scenario/session snapshots. Stores the full scenario
 * configuration (transaction, product source, options) as a JSON
 * payload, plus an optional evaluation result snapshot. Enables
 * users to save, recall, and compare underwriting scenarios.
 */
export const savedScenarios = sqliteTable("saved_scenarios", {
  /** Auto-incrementing surrogate key. */
  id: integer("id").primaryKey({ autoIncrement: true }),

  /** User-facing scenario identifier (e.g. "scenario_2024_q1"). */
  scenarioId: text("scenario_id").notNull().unique(),

  /** Human-readable scenario label. */
  name: text("name").notNull(),

  /** Optional notes or description. */
  description: text("description"),

  /**
   * JSON-serialized scenario configuration payload.
   * Contains the transaction, product source, and evaluation options.
   * Validated through domain adapters before use.
   */
  configPayload: text("config_payload").notNull(),

  /**
   * JSON-serialized evaluation result snapshot.
   * Nullable — populated after the scenario is evaluated.
   */
  resultPayload: text("result_payload"),

  /** ISO-8601 creation timestamp. */
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),

  /** ISO-8601 last-update timestamp. */
  updatedAt: text("updated_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

/* ------------------------------------------------------------------ */
/*  scenario_versions                                                  */
/* ------------------------------------------------------------------ */

/**
 * Edit history for `saved_scenarios.config_payload`. Every successful
 * `db save-scenario` (initial create) writes version 1; every successful
 * `db update-scenario` mutation appends a new row with `version = latest + 1`
 * and replaces the live `saved_scenarios.config_payload`. A restore-from-
 * history operation is itself a mutation and appends a new version row that
 * captures the restored payload, so history is strictly append-only and
 * monotonically increasing per scenario.
 *
 * The live `saved_scenarios.config_payload` always equals the latest
 * version's payload by construction. Reading a historical version requires
 * loading the matching `scenario_versions` row by `(scenarioId, version)`.
 */
export const scenarioVersions = sqliteTable("scenario_versions", {
  /** Auto-incrementing surrogate key. */
  id: integer("id").primaryKey({ autoIncrement: true }),

  /**
   * FK to the parent saved scenario's user-facing id. Cascades on delete
   * so removing a scenario removes its full edit history.
   */
  scenarioId: text("scenario_id")
    .notNull()
    .references(() => savedScenarios.scenarioId, { onDelete: "cascade" }),

  /**
   * Monotonically increasing version number per scenario. Version 1 is the
   * initial `save-scenario` write; subsequent updates produce 2, 3, ....
   * `(scenario_id, version)` is UNIQUE — enforced via the migration index.
   */
  version: integer("version").notNull(),

  /**
   * JSON-serialized historical scenario configuration payload. Same shape
   * as `saved_scenarios.config_payload`; validated through domain adapters
   * before use. Stored verbatim so the historical payload re-loads
   * byte-equivalent (subject to `js-yaml` round-trip semantics).
   */
  configPayload: text("config_payload").notNull(),

  /**
   * Optional human-authored note describing why this version was written
   * (e.g. "Bumped rate to 7.25", "Restored v3 after bad edit"). Surfaced
   * verbatim by `db scenario-history` and `db show-scenario-version`.
   */
  changeNote: text("change_note"),

  /**
   * How this version came into existence:
   * - "create": the initial `save-scenario` write
   * - "update": a subsequent `update-scenario` mutation
   * - "restore": a `restore-scenario-version` rollback (the new version
   *   captures the restored payload and references the source version in
   *   `restoredFromVersion`)
   */
  changeKind: text("change_kind", {
    enum: ["create", "update", "restore"],
  }).notNull(),

  /**
   * When `changeKind = "restore"`, the version number whose payload was
   * copied into this row. Null for `create` and `update`.
   */
  restoredFromVersion: integer("restored_from_version"),

  /** ISO-8601 creation timestamp. Always set on insert. */
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

/* ------------------------------------------------------------------ */
/*  saved_comparisons                                                  */
/* ------------------------------------------------------------------ */

/**
 * Persisted comparison grid snapshots. Stores the comparison
 * configuration (grid params, product filters) and an optional
 * result snapshot. Optionally linked to a base saved scenario.
 */
export const savedComparisons = sqliteTable("saved_comparisons", {
  /** Auto-incrementing surrogate key. */
  id: integer("id").primaryKey({ autoIncrement: true }),

  /** User-facing comparison identifier. */
  comparisonId: text("comparison_id").notNull().unique(),

  /** Human-readable comparison label. */
  name: text("name").notNull(),

  /** Optional FK to the base scenario this comparison derives from. */
  scenarioId: text("scenario_id").references(() => savedScenarios.scenarioId),

  /**
   * JSON-serialized comparison configuration payload.
   * Contains grid parameters, product filters, and sweep ranges.
   * Validated through domain adapters before use.
   */
  configPayload: text("config_payload").notNull(),

  /**
   * JSON-serialized comparison result snapshot.
   * Nullable — populated after the comparison is executed.
   */
  resultPayload: text("result_payload"),

  /** ISO-8601 creation timestamp. */
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),

  /** ISO-8601 last-update timestamp. */
  updatedAt: text("updated_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

/* ------------------------------------------------------------------ */
/*  saved_simulations                                                  */
/* ------------------------------------------------------------------ */

/**
 * Persisted simulation report snapshots. Stores the simulation
 * configuration and an optional result snapshot. Optionally linked
 * to a base saved scenario.
 */
export const savedSimulations = sqliteTable("saved_simulations", {
  /** Auto-incrementing surrogate key. */
  id: integer("id").primaryKey({ autoIncrement: true }),

  /** User-facing simulation identifier. */
  simulationId: text("simulation_id").notNull().unique(),

  /** Human-readable simulation label. */
  name: text("name").notNull(),

  /** Optional FK to the base scenario this simulation derives from. */
  scenarioId: text("scenario_id").references(() => savedScenarios.scenarioId),

  /**
   * JSON-serialized simulation configuration payload.
   * Validated through domain adapters before use.
   */
  configPayload: text("config_payload").notNull(),

  /**
   * JSON-serialized simulation result snapshot.
   * Nullable — populated after the simulation is executed.
   */
  resultPayload: text("result_payload"),

  /** ISO-8601 creation timestamp. */
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),

  /** ISO-8601 last-update timestamp. */
  updatedAt: text("updated_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

/* ------------------------------------------------------------------ */
/*  custom_product_sets                                               */
/* ------------------------------------------------------------------ */

export const customProductSets = sqliteTable("custom_product_sets", {
  /** Auto-incrementing surrogate key. */
  id: integer("id").primaryKey({ autoIncrement: true }),

  /** Unique set identifier. */
  setId: text("set_id").notNull().unique(),

  /** Human-readable set name. */
  name: text("name").notNull(),

  /** Optional lender ID this set is associated with. */
  lenderId: text("lender_id").references(() => lenders.id),

  /**
   * JSON array of ProductDefinition payloads.
   * Validated through domain adapters before use.
   */
  payload: text("payload").notNull(),

  /**
   * Validation status:
   * - "valid": all products passed domain validation
   * - "invalid": one or more products failed validation
   * - "unchecked": not yet validated
   */
  validationStatus: text("validation_status", {
    enum: ["valid", "invalid", "unchecked"],
  })
    .notNull()
    .default("unchecked"),

  /** ISO-8601 creation timestamp. */
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),

  /** ISO-8601 last-update timestamp. */
  updatedAt: text("updated_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

/* ------------------------------------------------------------------ */
/*  import_runs                                                       */
/* ------------------------------------------------------------------ */

/**
 * Tracks each product import attempt. Records the source file,
 * format, content hash, outcome status, and counts of products
 * imported vs failed. Links to the resulting catalog version on
 * success.
 */
export const importRuns = sqliteTable("import_runs", {
  /** Auto-incrementing surrogate key. */
  id: integer("id").primaryKey({ autoIncrement: true }),

  /** Unique identifier for this import run. */
  runId: text("run_id").notNull().unique(),

  /** FK to the lender this import is for. */
  lenderId: text("lender_id")
    .notNull()
    .references(() => lenders.id),

  /** File path or URL that was imported. */
  sourceFile: text("source_file").notNull(),

  /** Input format of the source file. */
  sourceFormat: text("source_format", {
    enum: ["yaml", "json", "csv"],
  }).notNull(),

  /** SHA-256 hash of the source content. */
  contentHash: text("content_hash").notNull(),

  /** Outcome of the import run. */
  status: text("status", {
    enum: ["pending", "success", "failed", "partial"],
  }).notNull(),

  /** Number of products successfully imported. */
  productsImported: integer("products_imported").notNull().default(0),

  /** Number of products that failed to import. */
  productsFailed: integer("products_failed").notNull().default(0),

  /** JSON array of error messages (nullable). */
  errorLog: text("error_log"),

  /** Linked catalog version if the import succeeded. */
  catalogVersionId: integer("catalog_version_id").references(() => catalogVersions.id),

  /** ISO-8601 timestamp when the import started. */
  startedAt: text("started_at").notNull(),

  /** ISO-8601 timestamp when the import completed (nullable until done). */
  completedAt: text("completed_at"),
});

/* ------------------------------------------------------------------ */
/*  audit_sessions                                                    */
/* ------------------------------------------------------------------ */

/**
 * Tracks CLI command executions for audit purposes. Records the
 * command name, arguments, optional scenario link, result summary,
 * and timing information.
 */
export const auditSessions = sqliteTable("audit_sessions", {
  /** Auto-incrementing surrogate key. */
  id: integer("id").primaryKey({ autoIncrement: true }),

  /** Unique session identifier. */
  sessionId: text("session_id").notNull().unique(),

  /** CLI command that was run (e.g. "evaluate", "compare", "simulate"). */
  command: text("command").notNull(),

  /** JSON of the CLI arguments/options used. */
  argsPayload: text("args_payload").notNull(),

  /** Optional link to a saved scenario. */
  scenarioId: text("scenario_id").references(() => savedScenarios.scenarioId),

  /** JSON summary of the result (nullable, populated after execution). */
  resultSummary: text("result_summary"),

  /** Exit status of the command. */
  exitStatus: text("exit_status", {
    enum: ["running", "success", "error"],
  })
    .notNull()
    .default("running"),

  /** ISO-8601 timestamp when the command started. */
  startedAt: text("started_at").notNull(),

  /** ISO-8601 timestamp when the command completed (nullable until done). */
  completedAt: text("completed_at"),
});
