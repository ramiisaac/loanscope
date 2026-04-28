import { sql } from "drizzle-orm";
import type { LoanScopeDB } from "./connection";

/**
 * Applies the full schema to a fresh database. Uses CREATE TABLE IF NOT EXISTS
 * so it is safe to call multiple times (idempotent).
 *
 * For production migrations with incremental schema changes, use drizzle-kit
 * generate/migrate. This function is for bootstrapping new databases and tests.
 */
export const applySchema = (db: LoanScopeDB): void => {
  db.run(sql`
    CREATE TABLE IF NOT EXISTS lenders (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      source_kind TEXT NOT NULL CHECK(source_kind IN ('builtin', 'imported', 'custom')),
      version INTEGER NOT NULL DEFAULT 1,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  db.run(sql`
    CREATE TABLE IF NOT EXISTS catalog_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lender_id TEXT NOT NULL REFERENCES lenders(id),
      version INTEGER NOT NULL,
      payload_version INTEGER NOT NULL DEFAULT 1,
      source_file TEXT,
      content_hash TEXT NOT NULL,
      imported_at TEXT NOT NULL
    )
  `);

  db.run(sql`
    CREATE TABLE IF NOT EXISTS product_catalogs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      catalog_version_id INTEGER NOT NULL REFERENCES catalog_versions(id),
      product_id TEXT NOT NULL,
      product_name TEXT NOT NULL,
      payload TEXT NOT NULL
    )
  `);

  db.run(sql`
    CREATE TABLE IF NOT EXISTS lender_presets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lender_id TEXT NOT NULL REFERENCES lenders(id),
      preset_id TEXT NOT NULL,
      name TEXT NOT NULL,
      product_ids TEXT NOT NULL
    )
  `);

  db.run(sql`
    CREATE TABLE IF NOT EXISTS custom_product_sets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      set_id TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      lender_id TEXT REFERENCES lenders(id),
      payload TEXT NOT NULL,
      validation_status TEXT NOT NULL DEFAULT 'unchecked'
        CHECK(validation_status IN ('valid', 'invalid', 'unchecked')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  db.run(sql`
    CREATE TABLE IF NOT EXISTS saved_scenarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scenario_id TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT,
      config_payload TEXT NOT NULL,
      result_payload TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  db.run(sql`
    CREATE TABLE IF NOT EXISTS scenario_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scenario_id TEXT NOT NULL REFERENCES saved_scenarios(scenario_id) ON DELETE CASCADE,
      version INTEGER NOT NULL,
      config_payload TEXT NOT NULL,
      change_note TEXT,
      change_kind TEXT NOT NULL CHECK(change_kind IN ('create', 'update', 'restore')),
      restored_from_version INTEGER,
      created_at TEXT NOT NULL
    )
  `);

  db.run(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_scenario_versions_scenario_version
      ON scenario_versions (scenario_id, version)
  `);

  db.run(sql`
    CREATE TABLE IF NOT EXISTS saved_comparisons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      comparison_id TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      scenario_id TEXT REFERENCES saved_scenarios(scenario_id),
      config_payload TEXT NOT NULL,
      result_payload TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  db.run(sql`
    CREATE TABLE IF NOT EXISTS saved_simulations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      simulation_id TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      scenario_id TEXT REFERENCES saved_scenarios(scenario_id),
      config_payload TEXT NOT NULL,
      result_payload TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  db.run(sql`
    CREATE TABLE IF NOT EXISTS import_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id TEXT NOT NULL UNIQUE,
      lender_id TEXT NOT NULL REFERENCES lenders(id),
      source_file TEXT NOT NULL,
      source_format TEXT NOT NULL CHECK(source_format IN ('yaml', 'json', 'csv')),
      content_hash TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('pending', 'success', 'failed', 'partial')),
      products_imported INTEGER NOT NULL DEFAULT 0,
      products_failed INTEGER NOT NULL DEFAULT 0,
      error_log TEXT,
      catalog_version_id INTEGER REFERENCES catalog_versions(id),
      started_at TEXT NOT NULL,
      completed_at TEXT
    )
  `);

  db.run(sql`
    CREATE TABLE IF NOT EXISTS audit_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL UNIQUE,
      command TEXT NOT NULL,
      args_payload TEXT NOT NULL,
      scenario_id TEXT REFERENCES saved_scenarios(scenario_id),
      result_summary TEXT,
      exit_status TEXT NOT NULL DEFAULT 'running' CHECK(exit_status IN ('running', 'success', 'error')),
      started_at TEXT NOT NULL,
      completed_at TEXT
    )
  `);
};
