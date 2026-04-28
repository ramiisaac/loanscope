import { describe, expect, it } from "vitest";
import { Command } from "commander";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  readBatchList,
  renderBatchCsv,
  renderBatchJson,
  runBatchAction,
  type BatchReport,
} from "../commands/batch-actions";
import { registerBatchCommand } from "../commands/batch";
import { CliValidationError } from "../cli-error";
import { findDefaultScenario } from "../config-loaders";
/**
 * Resolve an example scenario under `<repo>/examples/scenarios/`.
 * `findDefaultScenario` returns
 * `<repo>/packages/loanscope/cli/scenarios/default.yaml`, so the repo root
 * is four directories up from its parent.
 */
const repoExampleScenario = (name: string): string => {
  const defaultPath = findDefaultScenario();
  const repoRoot = path.resolve(path.dirname(defaultPath), "..", "..", "..", "..");
  const candidate = path.join(repoRoot, "examples", "scenarios", name);
  if (!fs.existsSync(candidate)) {
    throw new Error(`Example scenario not found: ${candidate}`);
  }
  return candidate;
};

const makeTempDir = (label: string): string =>
  fs.mkdtempSync(path.join(os.tmpdir(), `loanscope-batch-${label}-`));

describe("batch mode", () => {
  it("runs sequentially over multiple scenario files and returns a correct aggregate", () => {
    const paths = [
      findDefaultScenario(),
      repoExampleScenario("10-jumbo-primary.yaml"),
      repoExampleScenario("02-conforming-purchase.yaml"),
    ];

    const report = runBatchAction({
      paths,
      overrides: {},
      selection: {},
    });

    expect(report.scenarios).toHaveLength(paths.length);
    expect(report.aggregate.scenarioCount).toBe(paths.length);
    // Path order must be preserved (deterministic sequential execution).
    expect(report.scenarios.map((s) => s.path)).toEqual(paths);

    let expectedEligible = 0;
    let expectedIneligible = 0;
    let expectedWarnings = 0;
    let expectedTotal = 0;
    let expectedVariants = 0;
    for (const s of report.scenarios) {
      expectedEligible += s.eligibleCount;
      expectedIneligible += s.ineligibleCount;
      expectedWarnings += s.warningsCount;
      expectedTotal += s.totalResults;
      expectedVariants += s.variantCount;
      expect(s.totalResults).toBe(s.eligibleCount + s.ineligibleCount);
      expect(s.variantCount).toBeGreaterThan(0);
    }
    expect(report.aggregate.eligibleCount).toBe(expectedEligible);
    expect(report.aggregate.ineligibleCount).toBe(expectedIneligible);
    expect(report.aggregate.warningsCount).toBe(expectedWarnings);
    expect(report.aggregate.totalResults).toBe(expectedTotal);
    expect(report.aggregate.variantCount).toBe(expectedVariants);
  });

  it("applies scenario overrides uniformly to every scenario", () => {
    const paths = [findDefaultScenario(), repoExampleScenario("10-jumbo-primary.yaml")];

    const baseline = runBatchAction({
      paths,
      overrides: {},
      selection: {},
    });
    // A sharply elevated rate perturbs the reduction on at least one
    // scenario; this proves the override is threaded through every iteration
    // rather than applied to only the first file or dropped entirely.
    const overridden = runBatchAction({
      paths,
      overrides: { rate: "12.5" },
      selection: {},
    });

    expect(overridden.scenarios).toHaveLength(paths.length);
    const baselineSignature = baseline.scenarios.map(
      (s) => `${s.eligibleCount}/${s.ineligibleCount}/${s.warningsCount}`,
    );
    const overriddenSignature = overridden.scenarios.map(
      (s) => `${s.eligibleCount}/${s.ineligibleCount}/${s.warningsCount}`,
    );
    expect(overriddenSignature).not.toEqual(baselineSignature);
  });

  it("readBatchList skips empty lines and '#' comments and trims whitespace", () => {
    const dir = makeTempDir("readlist");
    const listPath = path.join(dir, "scenarios.txt");
    const body = [
      "# leading comment",
      "",
      "  packages/loanscope/cli/scenarios/default.yaml  ",
      "   ",
      "# another comment",
      "examples/scenarios/10-jumbo-primary.yaml",
      "",
    ].join("\n");
    fs.writeFileSync(listPath, body, "utf8");

    const paths = readBatchList(listPath);
    expect(paths).toEqual([
      "packages/loanscope/cli/scenarios/default.yaml",
      "examples/scenarios/10-jumbo-primary.yaml",
    ]);
  });

  it("fail-fast: a bad scenario path aborts the batch with the offending path in the error message", () => {
    const badPath = "/tmp/loanscope-batch-nonexistent-scenario.yaml";
    const paths = [findDefaultScenario(), badPath];

    expect(() =>
      runBatchAction({
        paths,
        overrides: {},
        selection: {},
      }),
    ).toThrow(new RegExp(badPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  });

  it("JSON output is a parseable BatchReport", () => {
    const report = runBatchAction({
      paths: [findDefaultScenario(), repoExampleScenario("10-jumbo-primary.yaml")],
      overrides: {},
      selection: {},
    });

    const json = renderBatchJson(report);
    const parsed = JSON.parse(json) as BatchReport;

    expect(parsed.scenarios).toHaveLength(report.scenarios.length);
    expect(parsed.aggregate.scenarioCount).toBe(report.aggregate.scenarioCount);
    expect(parsed.scenarios[0]?.path).toBe(report.scenarios[0]?.path);
    expect(parsed.aggregate.totalResults).toBe(report.aggregate.totalResults);
  });

  it("CSV output has the expected header and one data row per scenario", () => {
    const paths = [
      findDefaultScenario(),
      repoExampleScenario("10-jumbo-primary.yaml"),
      repoExampleScenario("02-conforming-purchase.yaml"),
    ];
    const report = runBatchAction({
      paths,
      overrides: {},
      selection: {},
    });

    const csv = renderBatchCsv(report);
    const lines = csv.split("\n");

    expect(lines[0]).toBe(
      "path,eligibleCount,ineligibleCount,warningsCount,variantCount,totalResults",
    );
    expect(lines).toHaveLength(1 + paths.length);

    for (let i = 0; i < paths.length; i += 1) {
      const dataLine = lines[i + 1];
      expect(dataLine).toBeDefined();
      const scenario = report.scenarios[i];
      expect(scenario).toBeDefined();
      expect(dataLine).toContain(scenario!.path);
      expect(dataLine).toContain(String(scenario!.eligibleCount));
      expect(dataLine).toContain(String(scenario!.totalResults));
    }
  });

  it("runBatchAction with empty input returns an empty report rather than throwing", () => {
    const report = runBatchAction({
      paths: [],
      overrides: {},
      selection: {},
    });
    expect(report.scenarios).toHaveLength(0);
    expect(report.aggregate).toEqual({
      scenarioCount: 0,
      eligibleCount: 0,
      ineligibleCount: 0,
      warningsCount: 0,
      totalResults: 0,
      variantCount: 0,
    });
  });

  it("raises CliValidationError when neither positional files nor --list is supplied", async () => {
    const program = new Command();
    program.exitOverride();
    registerBatchCommand(program);

    await expect(program.parseAsync(["node", "test", "batch"])).rejects.toThrow(CliValidationError);
  });
});
