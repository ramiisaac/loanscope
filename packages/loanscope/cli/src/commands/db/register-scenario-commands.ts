import type { Command } from "commander";
import { CliValidationError } from "../../cli-error";
import { withManager } from "../db-helpers";
import { resolvePayloadFormat } from "../db-helpers";
import {
  deleteScenarioAction,
  loadScenarioAction,
  renameScenarioAction,
  saveScenarioAction,
  showScenarioAction,
} from "./index";
import {
  restoreScenarioVersionAction,
  scenarioHistoryAction,
  showScenarioVersionAction,
  updateScenarioAction,
} from "../scenario-version-actions";
import { DEFAULT_DB_PATH } from "./constants";
export const registerScenarioCommands = (db: Command): void => {
  db.command("list-scenarios")
    .description("List all saved scenarios")
    .option("--path <file>", "Database file path", DEFAULT_DB_PATH)
    .option("--json", "Output as JSON", false)
    .action((options: { path: string; json: boolean }) => {
      const dbPath = options.path;
      return withManager(dbPath, (manager) => {
        const scenarios = manager.scenarios.findAll();
        if (options.json) {
          console.log(
            JSON.stringify(
              scenarios.map((s) => ({
                scenarioId: s.scenarioId,
                name: s.name,
                description: s.description,
                hasResult: s.resultPayload !== null,
                createdAt: s.createdAt,
              })),
              null,
              2,
            ),
          );
        } else {
          if (scenarios.length === 0) {
            console.log("No saved scenarios.");
            return;
          }
          for (const s of scenarios) {
            const resultTag = s.resultPayload !== null ? " [evaluated]" : "";
            console.log(`${s.scenarioId} — ${s.name}${resultTag}`);
            if (s.description) console.log(`  ${s.description}`);
            console.log(`  Created: ${s.createdAt}`);
          }
        }
      });
    });

  // loanscope db save-scenario
  db.command("save-scenario")
    .description("Persist a YAML scenario config to the database")
    .option(
      "--config <file>",
      "Scenario YAML config file path (falls back to the root --config option)",
    )
    .requiredOption("--name <name>", "Human-readable scenario name")
    .option("--description <text>", "Optional description")
    .option(
      "--id <slug>",
      "Explicit scenario id (default: derived from --name plus a timestamp suffix)",
    )
    .option("--path <file>", "Database file path", DEFAULT_DB_PATH)
    .action(
      (
        options: {
          config?: string;
          name: string;
          description?: string;
          id?: string;
          path: string;
        },
        command: Command,
      ) => {
        const rootOpts = (command.parent?.parent?.opts() as { config?: string } | undefined) ?? {};
        const configPath = options.config ?? rootOpts.config;
        if (configPath === undefined) {
          throw new CliValidationError("Missing required --config <file> for db save-scenario.");
        }
        return withManager(options.path, (manager) => {
          const result = saveScenarioAction(manager, {
            configPath,
            name: options.name,
            ...(options.description !== undefined ? { description: options.description } : {}),
            ...(options.id !== undefined ? { id: options.id } : {}),
          });
          console.log(`Saved scenario "${result.name}" with id ${result.scenarioId}.`);
        });
      },
    );

  // loanscope db load-scenario
  db.command("load-scenario")
    .description("Emit a saved scenario's stored config payload")
    .argument("<scenarioId>", "Scenario id")
    .option(
      "--output <format>",
      "Output format: yaml or json (falls back to the root --output option, then yaml)",
    )
    .option("--path <file>", "Database file path", DEFAULT_DB_PATH)
    .action((scenarioId: string, options: { output?: string; path: string }, command: Command) => {
      const format = resolvePayloadFormat(options.output, command);
      return withManager(options.path, (manager) => {
        const rendered = loadScenarioAction(manager, { scenarioId, format });
        console.log(rendered);
      });
    });

  // loanscope db show-scenario
  db.command("show-scenario")
    .description("Show metadata (and optionally the result payload) for a saved scenario")
    .argument("<scenarioId>", "Scenario id")
    .option("--json", "Emit full record as JSON, including the result payload", false)
    .option("--path <file>", "Database file path", DEFAULT_DB_PATH)
    .action((scenarioId: string, options: { json: boolean; path: string }) => {
      return withManager(options.path, (manager) => {
        const rendered = showScenarioAction(manager, {
          scenarioId,
          output: options.json ? "json" : "text",
        });
        console.log(rendered);
      });
    });

  // loanscope db delete-scenario
  db.command("delete-scenario")
    .description("Delete a saved scenario")
    .argument("<scenarioId>", "Scenario id")
    .option("--path <file>", "Database file path", DEFAULT_DB_PATH)
    .action((scenarioId: string, options: { path: string }) => {
      return withManager(options.path, (manager) => {
        const message = deleteScenarioAction(manager, { scenarioId });
        console.log(message);
      });
    });

  // loanscope db rename-scenario
  db.command("rename-scenario")
    .description("Rename a saved scenario")
    .argument("<scenarioId>", "Scenario id")
    .requiredOption("--name <name>", "New scenario name")
    .option("--path <file>", "Database file path", DEFAULT_DB_PATH)
    .action((scenarioId: string, options: { name: string; path: string }) => {
      return withManager(options.path, (manager) => {
        const message = renameScenarioAction(manager, {
          scenarioId,
          name: options.name,
        });
        console.log(message);
      });
    });

  // -----------------------------------------------------------------------
  // Scenario versioning commands
  // -----------------------------------------------------------------------

  // loanscope db update-scenario
  db.command("update-scenario")
    .description(
      "Replace a saved scenario's config payload from a YAML file and append a new version row",
    )
    .argument("<scenarioId>", "Scenario id")
    .option(
      "--config <file>",
      "Scenario YAML config file path (falls back to the root --config option)",
    )
    .option("--note <text>", "Optional change note recorded with the new version")
    .option("--path <file>", "Database file path", DEFAULT_DB_PATH)
    .action(
      (
        scenarioId: string,
        options: { config?: string; note?: string; path: string },
        command: Command,
      ) => {
        const rootOpts = (command.parent?.parent?.opts() as { config?: string } | undefined) ?? {};
        const configPath = options.config ?? rootOpts.config;
        if (configPath === undefined) {
          throw new CliValidationError("Missing required --config <file> for db update-scenario.");
        }
        return withManager(options.path, (manager) => {
          const result = updateScenarioAction(manager, {
            scenarioId,
            configPath,
            ...(options.note !== undefined ? { note: options.note } : {}),
          });
          console.log(`Updated scenario "${result.scenarioId}" to v${result.version}.`);
        });
      },
    );

  // loanscope db scenario-history
  db.command("scenario-history")
    .description("List the full edit history for a saved scenario")
    .argument("<scenarioId>", "Scenario id")
    .option("--json", "Output as JSON", false)
    .option("--path <file>", "Database file path", DEFAULT_DB_PATH)
    .action((scenarioId: string, options: { json: boolean; path: string }) => {
      return withManager(options.path, (manager) => {
        const rendered = scenarioHistoryAction(manager, {
          scenarioId,
          output: options.json ? "json" : "text",
        });
        console.log(rendered);
      });
    });

  // loanscope db show-scenario-version
  db.command("show-scenario-version")
    .description("Emit the historical config payload for a specific scenario version")
    .argument("<scenarioId>", "Scenario id")
    .argument("<version>", "Version number (e.g. 3 or v3)")
    .option(
      "--output <format>",
      "Output format: yaml or json (falls back to the root --output option, then yaml)",
    )
    .option("--path <file>", "Database file path", DEFAULT_DB_PATH)
    .action(
      (
        scenarioId: string,
        version: string,
        options: { output?: string; path: string },
        command: Command,
      ) => {
        const format = resolvePayloadFormat(options.output, command);
        return withManager(options.path, (manager) => {
          const rendered = showScenarioVersionAction(manager, {
            scenarioId,
            version,
            format,
          });
          console.log(rendered);
        });
      },
    );

  // loanscope db restore-scenario-version
  db.command("restore-scenario-version")
    .description(
      "Roll a saved scenario's live config payload back to a prior version (appended as a new version)",
    )
    .argument("<scenarioId>", "Scenario id")
    .argument("<version>", "Source version number to restore (e.g. 3 or v3)")
    .option("--note <text>", "Optional change note recorded with the new version")
    .option("--path <file>", "Database file path", DEFAULT_DB_PATH)
    .action((scenarioId: string, version: string, options: { note?: string; path: string }) => {
      return withManager(options.path, (manager) => {
        const result = restoreScenarioVersionAction(manager, {
          scenarioId,
          version,
          ...(options.note !== undefined ? { note: options.note } : {}),
        });
        console.log(
          `Restored scenario "${result.scenarioId}" to v${result.restoredFromVersion} ` +
            `(appended as v${result.newVersion}).`,
        );
      });
    });
};
