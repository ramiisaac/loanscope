/**
 * Default file path for the LoanScope SQLite database. Used as the
 * fallback for every `db` subcommand's `--path` option so a user can run
 * `pnpm loanscope db status` without arguments and have it resolve
 * deterministically.
 */
export const DEFAULT_DB_PATH = "loanscope.db";
