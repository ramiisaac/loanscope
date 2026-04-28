import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseManager } from "@loanscope/db";
import { loadYamlFile, parseConfig } from "@loanscope/config";
import { exportScenarioAction } from "../commands/export-actions";
import { CliValidationError } from "../cli-error";
import { findDefaultScenario } from "../config-loaders";
const writeTempYaml = (payload: string): string => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "loanscope-export-"));
  const file = path.join(dir, "scenario.yaml");
  fs.writeFileSync(file, payload, "utf8");
  return file;
};

const quickQuoteYaml = `quickQuote:
  loanAmount: 500000
  loanPurpose: Purchase
  occupancy: Primary
  propertyType: SFR
  fico: 740
  purchasePrice: 625000
  noteRatePct: 6.5
  amortizationMonths: 360
`;

const quickQuotePayload = {
  quickQuote: {
    loanAmount: 500000,
    loanPurpose: "Purchase",
    occupancy: "Primary",
    propertyType: "SFR",
    fico: 740,
    purchasePrice: 625000,
    noteRatePct: 6.5,
    amortizationMonths: 360,
  },
};

describe("exportScenarioAction", () => {
  it("exports a default-scenario payload as YAML and re-loads through parseConfig", () => {
    // The repo's default.yaml is transaction-shaped, but the primary contract
    // here is the YAML round-trip: dumpYaml -> loadYamlFile -> parseConfig.
    const result = exportScenarioAction({
      source: { kind: "default" },
      overrides: {},
      format: "yaml",
    });

    expect(result.outPath).toBeNull();
    expect(result.rendered.length).toBeGreaterThan(0);
    expect(result.shape).toBe("transaction");

    const tmp = writeTempYaml(result.rendered);
    const reloaded = parseConfig(loadYamlFile(tmp));
    expect(reloaded.transaction).toBeDefined();
    expect(reloaded.transaction?.scenario.requestedLoanAmount).toBe(900000);
  });

  it("exports from --from-db for a seeded scenario and round-trips through parseConfig", () => {
    const manager = DatabaseManager.memory();
    manager.scenarios.create({
      scenarioId: "seeded-qq",
      name: "Seeded QQ",
      configPayload: quickQuotePayload,
    });

    const result = exportScenarioAction({
      source: { kind: "db", manager, scenarioId: "seeded-qq" },
      overrides: {},
      format: "yaml",
    });

    expect(result.shape).toBe("quickQuote");
    const tmp = writeTempYaml(result.rendered);
    const reloaded = parseConfig(loadYamlFile(tmp));
    expect(reloaded.quickQuote).toBeDefined();
    expect(reloaded.transaction).toBeUndefined();
    expect(reloaded.quickQuote?.loanAmount).toBe(500000);
    expect(reloaded.quickQuote?.fico).toBe(740);
  });

  it("applies --rate override so the exported payload carries the new rate", () => {
    const manager = DatabaseManager.memory();
    manager.scenarios.create({
      scenarioId: "seeded-qq-rate",
      name: "Seeded QQ Rate",
      configPayload: quickQuotePayload,
    });

    const result = exportScenarioAction({
      source: { kind: "db", manager, scenarioId: "seeded-qq-rate" },
      overrides: { rate: "7.125" },
      format: "yaml",
    });

    const tmp = writeTempYaml(result.rendered);
    const reloaded = parseConfig(loadYamlFile(tmp));
    expect(reloaded.quickQuote?.noteRatePct).toBe(7.125);
  });

  it("emits JSON when --output json", () => {
    const result = exportScenarioAction({
      source: { kind: "default" },
      overrides: {},
      format: "json",
    });

    // Must be parseable as JSON.
    const parsedJson = JSON.parse(result.rendered) as unknown;
    expect(parsedJson).toBeTypeOf("object");
    expect(parsedJson).not.toBeNull();
    expect((parsedJson as { transaction?: unknown }).transaction).toBeDefined();

    // And the embedded payload must re-parse through parseConfig.
    const reparsed = parseConfig(parsedJson);
    expect(reparsed.transaction).toBeDefined();
  });

  it("writes to --out when supplied and refuses to overwrite an existing file", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "loanscope-export-out-"));
    const outPath = path.join(dir, "exported.yaml");

    const result = exportScenarioAction({
      source: { kind: "default" },
      overrides: {},
      format: "yaml",
      outPath,
    });

    expect(result.outPath).toBe(outPath);
    expect(fs.existsSync(outPath)).toBe(true);
    const onDisk = fs.readFileSync(outPath, "utf8");
    expect(onDisk).toBe(result.rendered);

    // Second invocation targeting the same path must refuse.
    expect(() =>
      exportScenarioAction({
        source: { kind: "default" },
        overrides: {},
        format: "yaml",
        outPath,
      }),
    ).toThrow(CliValidationError);
  });

  it("emits transaction-shape for transaction-shaped inputs and quickQuote-shape for quick-quote inputs", () => {
    // Transaction-shaped input via --config.
    const txnResult = exportScenarioAction({
      source: { kind: "config", filePath: findDefaultScenario() },
      overrides: {},
      format: "yaml",
    });
    expect(txnResult.shape).toBe("transaction");
    const txnReloaded = parseConfig(loadYamlFile(writeTempYaml(txnResult.rendered)));
    expect(txnReloaded.transaction).toBeDefined();
    expect(txnReloaded.quickQuote).toBeUndefined();

    // QuickQuote-shaped input via a YAML file on disk.
    const qqPath = writeTempYaml(quickQuoteYaml);
    const qqResult = exportScenarioAction({
      source: { kind: "config", filePath: qqPath },
      overrides: {},
      format: "yaml",
    });
    expect(qqResult.shape).toBe("quickQuote");
    const qqReloaded = parseConfig(loadYamlFile(writeTempYaml(qqResult.rendered)));
    expect(qqReloaded.quickQuote).toBeDefined();
    expect(qqReloaded.transaction).toBeUndefined();
  });
});

describe("exportScenarioAction mutual exclusion", () => {
  it("raises CliValidationError when both --from-db and --config are supplied (command-layer guard)", async () => {
    // The mutual-exclusion guard lives in the command layer; exercise it by
    // driving the registered commander action directly.
    const { Command } = await import("commander");
    const { registerExportScenarioCommand } = await import("../commands/export-scenario");

    const program = new Command();
    program.exitOverride();
    registerExportScenarioCommand(program);

    const manager = DatabaseManager.memory();
    manager.scenarios.create({
      scenarioId: "mx-scenario",
      name: "MX",
      configPayload: quickQuotePayload,
    });

    expect(() =>
      program.parse(
        ["export-scenario", "--from-db", "mx-scenario", "--config", findDefaultScenario()],
        { from: "user" },
      ),
    ).toThrow(CliValidationError);
  });

  it("raises CliValidationError when --from-db and root-level --config are combined", async () => {
    // Exercise the root-option-shadow path: --config passed before the
    // subcommand routes to the parent, but the mutual-exclusion guard must
    // still fire because the effective configPath is defined.
    const { Command } = await import("commander");
    const { registerExportScenarioCommand } = await import("../commands/export-scenario");

    const program = new Command();
    program.exitOverride();
    // Mirror the real root option surface so commander actually routes
    // `--config` to the parent.
    program.option("--config <file>", "Config file path");
    registerExportScenarioCommand(program);

    const manager = DatabaseManager.memory();
    manager.scenarios.create({
      scenarioId: "mx-scenario-root",
      name: "MX Root",
      configPayload: quickQuotePayload,
    });

    expect(() =>
      program.parse(
        ["--config", findDefaultScenario(), "export-scenario", "--from-db", "mx-scenario-root"],
        { from: "user" },
      ),
    ).toThrow(CliValidationError);
  });
});

describe("export-scenario command-layer --config resolution (root-shadow bug)", () => {
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

  const buildProgram = async () => {
    const { Command } = await import("commander");
    const { registerExportScenarioCommand } = await import("../commands/export-scenario");
    const program = new Command();
    program.exitOverride();
    // Mirror the real root option surface so commander's same-long-flag
    // routing behaves identically to production.
    program.option("--config <file>", "Config file path");
    program.option("--output <format>", "Output format: table, json, or csv", "table");
    registerExportScenarioCommand(program);
    return program;
  };

  it("honors a subcommand-level --config pointing at a non-default preset and emits its distinct payload", async () => {
    const program = await buildProgram();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      await program.parseAsync(
        [
          "export-scenario",
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
      const parsed = JSON.parse(rendered as string) as {
        transaction?: {
          id?: string;
          scenario?: { requestedLoanAmount?: number };
        };
      };
      expect(parsed.transaction).toBeDefined();
      expect(parsed.transaction?.id).toBe("jumbo-primary");
      expect(parsed.transaction?.scenario?.requestedLoanAmount).toBe(1000000);
    } finally {
      logSpy.mockRestore();
    }
  });

  it("honors a root-level --config (flag before subcommand) and emits the preset payload, not the default", async () => {
    const program = await buildProgram();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      await program.parseAsync(
        [
          "--config",
          exampleScenario("10-jumbo-primary.yaml"),
          "export-scenario",
          "--output",
          "json",
        ],
        { from: "user" },
      );

      const firstCall = logSpy.mock.calls[0];
      expect(firstCall).toBeDefined();
      const rendered = firstCall?.[0];
      const parsed = JSON.parse(rendered as string) as {
        transaction?: {
          id?: string;
          scenario?: { requestedLoanAmount?: number };
        };
      };
      expect(parsed.transaction?.id).toBe("jumbo-primary");
      expect(parsed.transaction?.scenario?.requestedLoanAmount).toBe(1000000);
    } finally {
      logSpy.mockRestore();
    }
  });

  it("control: with no --config provided, emits the bundled default scenario (txn_default / 900000)", async () => {
    const program = await buildProgram();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      await program.parseAsync(["export-scenario", "--output", "json"], {
        from: "user",
      });

      const firstCall = logSpy.mock.calls[0];
      expect(firstCall).toBeDefined();
      const rendered = firstCall?.[0];
      const parsed = JSON.parse(rendered as string) as {
        transaction?: {
          scenario?: { requestedLoanAmount?: number };
        };
      };
      expect(parsed.transaction).toBeDefined();
      // The default scenario must be distinguishable from the jumbo preset.
      expect(parsed.transaction?.scenario?.requestedLoanAmount).toBe(900000);
    } finally {
      logSpy.mockRestore();
    }
  });

  it("surfaces a filesystem error when --config points to a nonexistent file (no silent fallback)", async () => {
    const program = await buildProgram();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      await expect(
        program.parseAsync(
          [
            "export-scenario",
            "--config",
            "/tmp/loanscope-export-does-not-exist.yaml",
            "--output",
            "json",
          ],
          { from: "user" },
        ),
      ).rejects.toThrow();
      // And critically, no rendered payload was emitted.
      expect(logSpy).not.toHaveBeenCalled();
    } finally {
      logSpy.mockRestore();
    }
  });

  it("surfaces a filesystem error when root-level --config points to a nonexistent file", async () => {
    const program = await buildProgram();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      await expect(
        program.parseAsync(
          [
            "--config",
            "/tmp/loanscope-export-does-not-exist.yaml",
            "export-scenario",
            "--output",
            "json",
          ],
          { from: "user" },
        ),
      ).rejects.toThrow();
      expect(logSpy).not.toHaveBeenCalled();
    } finally {
      logSpy.mockRestore();
    }
  });
});
