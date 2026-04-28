import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

/**
 * Typed Drizzle ORM handle for the LoanScope schema.
 *
 * The `$client` intersection is preserved from drizzle's own return type so
 * callers that own the lifecycle of the underlying SQLite connection (tests,
 * long-lived CLI sessions) can reach the `better-sqlite3` `Database` to
 * `.close()` it explicitly. Stripping the intersection — which `drizzle(...)`
 * adds at the call site — would silently break that contract for every
 * downstream consumer, so the alias is widened here rather than patched at
 * each use site.
 */
export type LoanScopeDB = BetterSQLite3Database<typeof schema> & {
  readonly $client: Database.Database;
};

/**
 * Structural subset of `LoanScopeDB` that covers the query surface used by
 * every repository (`insert`, `select`, `update`, `delete`, `run`, the
 * `drizzle` helpers). Omits the `$client` intersection because Drizzle's
 * transaction handle does not carry a `better-sqlite3` connection — the
 * connection is owned by the outer database. Repositories work against
 * this narrower type; both `LoanScopeDB` and the transaction passed to
 * `db.transaction((tx) => ...)` satisfy it structurally.
 *
 * Exported as the canonical parameter type for repository factories that
 * must run inside a transaction. See `withTx` for the boundary helper.
 */
export type TxDatabase = BetterSQLite3Database<typeof schema>;

/**
 * Executes `fn` inside a Drizzle transaction and presents its handle as a
 * `LoanScopeDB`. Centralizes the single boundary cast required because
 * Drizzle's transaction type (`SQLiteTransaction<...>`) shares the
 * `BaseSQLiteDatabase` query surface with `BetterSQLite3Database` but is
 * not assignable to it by name.
 *
 * The cast is sound in practice: every repository constructed here only
 * exercises methods defined on `BaseSQLiteDatabase`, which the transaction
 * handle implements. Callers must not invoke `$client` on the provided
 * handle (doing so would escape the transaction scope) — the helper
 * deliberately does not expose a type that permits it at the call site,
 * and the cast is performed once here rather than at every repository
 * construction site.
 */
export const withTx = <T>(db: LoanScopeDB, fn: (tx: LoanScopeDB) => T): T =>
  db.transaction((tx) => {
    // Boundary adapter: narrow to the transactional query surface, then
    // widen back to `LoanScopeDB` so existing repository factories
    // (`createCatalogRepository(db: LoanScopeDB)`, etc.) continue to work
    // unchanged. `$client` is never touched inside the transaction.
    const txDb: TxDatabase = tx;
    return fn(txDb as LoanScopeDB);
  });

/**
 * Creates a new Drizzle database instance backed by SQLite.
 *
 * @param path - File path for the SQLite database. Use ":memory:" for
 *               ephemeral in-memory databases (tests, CI).
 * @returns A typed Drizzle ORM instance with the LoanScope schema.
 */
export const createDatabase = (path: string): LoanScopeDB => {
  const sqlite = new Database(path);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  return drizzle(sqlite, { schema });
};

/**
 * Creates an in-memory database. Convenience wrapper for tests.
 */
export const createMemoryDatabase = (): LoanScopeDB => {
  return createDatabase(":memory:");
};
