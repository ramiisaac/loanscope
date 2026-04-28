import { Command } from "commander";
import { CliValidationError } from "../cli-error";
import { parseDiffKind } from "../format-parsers";
import { withManager } from "./db-helpers";
import { diffScenariosAction, diffComparisonsAction, diffSimulationsAction } from "./diff/index";

interface DiffOptions {
  json?: boolean;
  path: string;
}

const DEFAULT_DB_PATH = "loanscope.db";

export const registerDiffCommand = (program: Command): void => {
  program
    .command("diff")
    .description("Diff two stored sessions (scenario | comparison | simulation) by id.")
    .argument("<kind>", "Session kind: scenario, comparison, or simulation")
    .argument("<idA>", "First session id")
    .argument("<idB>", "Second session id")
    .option("--json", "Emit the DiffReport as JSON", false)
    .option("--path <file>", "Database file path", DEFAULT_DB_PATH)
    .action((kindRaw: string, idA: string, idB: string, options: DiffOptions) => {
      const kind = parseDiffKind(kindRaw);
      const json = options.json === true;

      const rendered = withManager(options.path, (manager): string => {
        switch (kind) {
          case "scenario":
            return diffScenariosAction(manager, { idA, idB, output: json ? "json" : "text" });
          case "comparison":
            return diffComparisonsAction(manager, { idA, idB, output: json ? "json" : "text" });
          case "simulation":
            return diffSimulationsAction(manager, { idA, idB, output: json ? "json" : "text" });
          default: {
            // Exhaustiveness guard: parseDiffKind narrows to the union above,
            // so this branch is unreachable. Retained so future additions to
            // DiffKind trigger a compile error here rather than silent miss.
            const _exhaustive: never = kind;
            throw new CliValidationError(`Unhandled diff kind: ${String(_exhaustive)}`);
          }
        }
      });

      console.log(rendered);
    });
};
