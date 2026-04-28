import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { Command } from "commander";
import { registerGoalseekCommand } from "../commands/goalseek";
import { findDefaultScenario } from "../config-loaders";
/**
 * Commander-layer regression tests for the goalseek `--config` root-shadow
 * bug: goalseek subcommands are nested one level deeper than `export-scenario`
 * (they live under the `goalseek` group), so a same-long-flag declared on
 * both root and subcommand was routed to the root while the subcommand
 * action read only its own `options.config`, causing a silent fallback to
 * the bundled default scenario.
 *
 * These tests exercise the registered commander tree end-to-end and assert
 * that:
 *   - a nonexistent --config path surfaces a filesystem error rather than
 *     silently falling back;
 *   - the same holds when --config is passed at the root position (before
 *     the `goalseek` token), which is the precise shadowing case.
 */

const exampleScenario = (name: string): string => {
  const defaultPath = findDefaultScenario();
  const repoRoot = path.resolve(path.dirname(defaultPath), "..", "..", "..", "..");
  const candidate = path.join(repoRoot, "examples", "scenarios", name);
  if (!fs.existsSync(candidate)) {
    throw new Error(
      `Expected example scenario "${name}" at ${candidate}; adjust the test fixture path.`,
    );
  }
  return candidate;
};

const buildProgram = (): Command => {
  const program = new Command();
  program.exitOverride();
  // Mirror the production root option surface so commander's same-long-flag
  // routing behaves identically here.
  program.option("--config <file>", "Config file path");
  program.option("--output <format>", "Output format: table, json, or csv", "table");
  registerGoalseekCommand(program);
  return program;
};

const NONEXISTENT = "/tmp/loanscope-goalseek-does-not-exist.yaml";

describe("goalseek command-layer --config resolution (root-shadow bug)", () => {
  it("surfaces a filesystem error when subcommand-level --config points to a nonexistent file", async () => {
    const program = buildProgram();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      await expect(
        program.parseAsync(
          ["goalseek", "max-loan", "--product", "uwm_jumbo_pink", "--config", NONEXISTENT],
          { from: "user" },
        ),
      ).rejects.toThrow();
      // No goal-seek result must have been printed before the failure.
      expect(logSpy).not.toHaveBeenCalled();
    } finally {
      logSpy.mockRestore();
    }
  });

  it("surfaces a filesystem error when root-level --config points to a nonexistent file (flag before `goalseek`)", async () => {
    // This is the precise shadowing case: commander routes `--config` to the
    // root because both root and subcommand declare it; the subcommand action
    // must still read through to the root and therefore attempt to load the
    // bad path rather than silently falling back to the default scenario.
    const program = buildProgram();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      await expect(
        program.parseAsync(
          ["--config", NONEXISTENT, "goalseek", "max-loan", "--product", "uwm_jumbo_pink"],
          { from: "user" },
        ),
      ).rejects.toThrow();
      expect(logSpy).not.toHaveBeenCalled();
    } finally {
      logSpy.mockRestore();
    }
  });

  it("honors a valid subcommand-level --config and executes goalseek against it (smoke)", async () => {
    // Positive control: a real preset file must be accepted and must produce
    // a printed goal-seek result. This guards against a regression where the
    // resolver returns `undefined` even when a valid path is provided.
    const program = buildProgram();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      await program.parseAsync(
        [
          "goalseek",
          "max-loan",
          "--product",
          "uwm_jumbo_pink",
          "--config",
          exampleScenario("10-jumbo-primary.yaml"),
          "--output",
          "json",
        ],
        { from: "user" },
      );

      expect(logSpy).toHaveBeenCalledTimes(1);
      const firstCall = logSpy.mock.calls[0];
      expect(firstCall).toBeDefined();
      const rendered = firstCall?.[0];
      expect(typeof rendered).toBe("string");
      // Must be well-formed JSON carrying a goal-seek result envelope.
      const parsed = JSON.parse(rendered as string) as {
        found?: boolean;
        iterations?: number;
        finalResult?: unknown;
      };
      expect(parsed).toBeTypeOf("object");
      expect(parsed.finalResult).toBeDefined();
      expect(typeof parsed.iterations).toBe("number");
      expect(typeof parsed.found).toBe("boolean");
    } finally {
      logSpy.mockRestore();
    }
  });

  it("honors a valid root-level --config (flag before `goalseek`) and executes against it", async () => {
    const program = buildProgram();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      await program.parseAsync(
        [
          "--config",
          exampleScenario("10-jumbo-primary.yaml"),
          "goalseek",
          "max-loan",
          "--product",
          "uwm_jumbo_pink",
          "--output",
          "json",
        ],
        { from: "user" },
      );

      expect(logSpy).toHaveBeenCalledTimes(1);
      const firstCall = logSpy.mock.calls[0];
      const rendered = firstCall?.[0];
      const parsed = JSON.parse(rendered as string) as {
        found?: boolean;
        iterations?: number;
        finalResult?: unknown;
      };
      expect(parsed.finalResult).toBeDefined();
      expect(typeof parsed.iterations).toBe("number");
      expect(typeof parsed.found).toBe("boolean");
    } finally {
      logSpy.mockRestore();
    }
  });
});
