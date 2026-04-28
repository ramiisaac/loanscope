import type { Command } from "commander";
import { parseScenarioPayloadFormat } from "../../format-parsers";
import type { ScenarioPayloadFormat } from "../../format-parsers";
/**
 * Resolves the effective scenario payload format for a CLI subcommand by
 * walking the option-inheritance chain that Commander exposes:
 *
 *   1. The subcommand's own `--output <format>` option (if explicitly set).
 *   2. The nearest ancestor whose `--output` option names a payload format
 *      (`"yaml"` or `"json"`). The repo's root `--output` default is
 *      `"table"` for evaluate/compare/etc., which is NOT a meaningful
 *      payload format here, so values other than `"yaml"` / `"json"` are
 *      explicitly ignored when inherited from an ancestor.
 *   3. The supplied `fallback` (defaults to `"yaml"` per the documented
 *      payload-format convention for scenario load/show/export commands).
 *
 * The returned value is always validated through `parseScenarioPayloadFormat`
 * so callers receive a fully narrowed `ScenarioPayloadFormat`.
 *
 * `localOpt` is the value the subcommand parsed for its own `--output`
 * option (typically `options.output`). `command` is the subcommand's
 * `Command` instance so we can read parent / grandparent option bags.
 *
 * Centralizes three previously verbatim-duplicated inheritance blocks
 * (two in `db.ts`, one in `export-scenario.ts`) into a single seam so
 * future inheritance-rule changes (e.g. supporting additional payload
 * formats) only need to be made in one place.
 */
export const resolvePayloadFormat = (
  localOpt: string | undefined,
  command: Command,
  fallback: ScenarioPayloadFormat = "yaml",
): ScenarioPayloadFormat => {
  if (localOpt !== undefined) {
    return parseScenarioPayloadFormat(localOpt);
  }
  // Walk up the parent chain, picking the nearest ancestor whose
  // `--output` value is a recognized payload format. Commander's option
  // bags are loosely typed, so each level is read through a narrow shape.
  let cursor: Command | null = command.parent ?? null;
  while (cursor !== null) {
    const opts = cursor.opts() as { output?: string } | undefined;
    const candidate = opts?.output;
    if (candidate === "yaml" || candidate === "json") {
      return candidate;
    }
    cursor = cursor.parent ?? null;
  }
  return fallback;
};
