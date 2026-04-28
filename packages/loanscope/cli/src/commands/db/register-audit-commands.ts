import type { Command } from "commander";
import { withManager } from "../db-helpers";
import { listAuditSessionsAction, showAuditSessionAction } from "../audit-actions";
import { DEFAULT_DB_PATH } from "./constants";

export const registerAuditCommands = (db: Command): void => {
  const audit = db
    .command("audit")
    .description("Inspect audit_sessions rows captured by --audit runs");

  // loanscope db audit list
  audit
    .command("list")
    .description("List audit sessions, optionally filtered by command")
    .option(
      "--command <name>",
      "Filter to a specific command (evaluate, compare, simulate, goalseek, quote)",
    )
    .option("--json", "Output as JSON", false)
    .option("--path <file>", "Database file path", DEFAULT_DB_PATH)
    .action((options: { command?: string; json: boolean; path: string }) => {
      return withManager(options.path, (manager) => {
        const rendered = listAuditSessionsAction(manager, {
          ...(options.command !== undefined ? { command: options.command } : {}),
          output: options.json ? "json" : "text",
        });
        console.log(rendered);
      });
    });

  // loanscope db audit show
  audit
    .command("show")
    .description("Show full detail for an audit session (args, result summary, timing)")
    .argument("<sessionId>", "Audit session id")
    .option("--json", "Emit full record as JSON", false)
    .option("--path <file>", "Database file path", DEFAULT_DB_PATH)
    .action((sessionId: string, options: { json: boolean; path: string }) => {
      return withManager(options.path, (manager) => {
        const rendered = showAuditSessionAction(manager, {
          sessionId,
          output: options.json ? "json" : "text",
        });
        console.log(rendered);
      });
    });
};
