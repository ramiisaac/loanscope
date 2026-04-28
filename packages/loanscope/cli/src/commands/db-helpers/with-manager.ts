import { DatabaseManager } from "@loanscope/db";

/**
 * Shared close-on-exit lifecycle used by {@link withManager} and
 * {@link withOptionalManager}. Opens are performed by the callers so that
 * both the eager and optional variants route through identical teardown:
 * the underlying `better-sqlite3` connection is released on both
 * synchronous return and error, and asynchronously once the settled
 * promise resolves or rejects.
 */
const runWithLifecycle = <T>(
  manager: DatabaseManager,
  fn: (manager: DatabaseManager) => T | Promise<T>,
): T | Promise<T> => {
  const close = (): void => {
    manager.db.$client.close();
  };
  let result: T | Promise<T>;
  try {
    result = fn(manager);
  } catch (err) {
    close();
    throw err;
  }
  if (result instanceof Promise) {
    return result.finally(close);
  }
  close();
  return result;
};

/**
 * Opens a {@link DatabaseManager} at `path`, runs `fn` against it, and
 * returns its result. Always closes the underlying `better-sqlite3`
 * connection on return, including when `fn` throws synchronously or the
 * promise it returns rejects. Both synchronous and `Promise`-returning
 * callbacks are supported via overloads so consumers retain their exact
 * return type without unsafe casts.
 */
export function withManager<T>(
  path: string,
  fn: (manager: DatabaseManager) => Promise<T>,
): Promise<T>;
export function withManager<T>(path: string, fn: (manager: DatabaseManager) => T): T;
export function withManager<T>(
  path: string,
  fn: (manager: DatabaseManager) => T | Promise<T>,
): T | Promise<T> {
  const manager = DatabaseManager.open(path);
  return runWithLifecycle(manager, fn);
}

/**
 * Optional-manager variant of {@link withManager} used by top-level CLI
 * commands whose database usage is conditional (e.g. `--save`, `--from-db`,
 * or `--audit`). When `path` is `undefined`, no manager is opened and `fn`
 * is invoked with `undefined`; otherwise the manager is opened and closed
 * with the same lifecycle guarantees as {@link withManager}.
 */
export function withOptionalManager<T>(
  path: string | undefined,
  fn: (manager: DatabaseManager | undefined) => Promise<T>,
): Promise<T>;
export function withOptionalManager<T>(
  path: string | undefined,
  fn: (manager: DatabaseManager | undefined) => T,
): T;
export function withOptionalManager<T>(
  path: string | undefined,
  fn: (manager: DatabaseManager | undefined) => T | Promise<T>,
): T | Promise<T> {
  if (path === undefined) {
    return fn(undefined);
  }
  const manager = DatabaseManager.open(path);
  return runWithLifecycle(manager, fn);
}
