import { describe, expect, it } from "vitest";
import { DatabaseManager } from "@loanscope/db";
import {
  computeDeepDiff,
  diffComparisonsAction,
  diffScenariosAction,
  diffSimulationsAction,
  type DiffReport,
} from "../commands/diff/index";
import { CliValidationError } from "../cli-error";
describe("computeDeepDiff", () => {
  it("returns [] on identical values", () => {
    expect(computeDeepDiff({ a: 1, b: [1, 2] }, { a: 1, b: [1, 2] })).toEqual([]);
    expect(computeDeepDiff(null, null)).toEqual([]);
    expect(computeDeepDiff("x", "x")).toEqual([]);
  });

  it("renders array-index paths as [0], [1], etc.", () => {
    const diff = computeDeepDiff([1, 2, 3], [1, 9, 3, 4]);
    const paths = diff.map((e) => e.path).sort();
    expect(paths).toEqual(["[1]", "[3]"]);
    const changed = diff.find((e) => e.path === "[1]");
    expect(changed?.kind).toBe("changed");
    if (changed?.kind === "changed") {
      expect(changed.before).toBe(2);
      expect(changed.after).toBe(9);
    }
    const added = diff.find((e) => e.path === "[3]");
    expect(added?.kind).toBe("added");
    if (added?.kind === "added") {
      expect(added.after).toBe(4);
    }
  });

  it("produces deterministic lexicographic ordering of entries", () => {
    const a = { zeta: 1, alpha: { beta: 1, gamma: 1 } };
    const b = { zeta: 2, alpha: { beta: 9, gamma: 9 }, newKey: "x" };
    const diff = computeDeepDiff(a, b);
    const paths = diff.map((e) => e.path);
    const sorted = [...paths].sort();
    expect(paths).toEqual(sorted);
  });
});

describe("diffScenariosAction", () => {
  const seedScenario = (
    manager: DatabaseManager,
    scenarioId: string,
    configPayload: unknown,
    resultPayload: unknown | null = null,
  ): void => {
    manager.scenarios.create({
      scenarioId,
      name: scenarioId,
      configPayload,
    });
    if (resultPayload !== null) {
      manager.scenarios.updateResult(scenarioId, resultPayload);
    }
  };

  it("reports no config changes when configPayloads are identical", () => {
    const manager = DatabaseManager.memory();
    const cfg = { transaction: { id: "txn-1", rate: 6.5 } };
    seedScenario(manager, "sa", cfg);
    seedScenario(manager, "sb", cfg);

    const rendered = diffScenariosAction(manager, {
      idA: "sa",
      idB: "sb",
      output: "json",
    });
    const parsed = JSON.parse(rendered) as DiffReport;
    expect(parsed.configPayload).toEqual([]);
  });

  it("surfaces result-payload asymmetry when one side has a result and the other does not", () => {
    const manager = DatabaseManager.memory();
    const cfg = { transaction: { id: "txn-1" } };
    seedScenario(manager, "sa", cfg, { eligible: true });
    seedScenario(manager, "sb", cfg);

    const rendered = diffScenariosAction(manager, {
      idA: "sa",
      idB: "sb",
      output: "json",
    });
    const parsed = JSON.parse(rendered) as DiffReport;
    expect(parsed.resultAsymmetry).toBe("a-only");
    expect(parsed.resultPayload).toHaveLength(1);
    expect(parsed.resultPayload[0]?.path).toBe("resultPayload");
    expect(parsed.resultPayload[0]?.kind).toBe("removed");
  });

  it("surfaces configPayload diff with correct path and kind when configs differ", () => {
    const manager = DatabaseManager.memory();
    seedScenario(manager, "sa", {
      transaction: { id: "txn-1", rate: 6.5 },
      extra: "only-on-a",
    });
    seedScenario(manager, "sb", {
      transaction: { id: "txn-1", rate: 7.25 },
    });

    const rendered = diffScenariosAction(manager, {
      idA: "sa",
      idB: "sb",
      output: "json",
    });
    const parsed = JSON.parse(rendered) as DiffReport;

    const rateEntry = parsed.configPayload.find((e) => e.path === "transaction.rate");
    expect(rateEntry?.kind).toBe("changed");
    if (rateEntry?.kind === "changed") {
      expect(rateEntry.before).toBe(6.5);
      expect(rateEntry.after).toBe(7.25);
    }

    const extraEntry = parsed.configPayload.find((e) => e.path === "extra");
    expect(extraEntry?.kind).toBe("removed");
    if (extraEntry?.kind === "removed") {
      expect(extraEntry.before).toBe("only-on-a");
    }
  });

  it("throws CliValidationError mentioning the A id when A is unknown", () => {
    const manager = DatabaseManager.memory();
    manager.scenarios.create({
      scenarioId: "present",
      name: "Present",
      configPayload: {},
    });
    expect(() =>
      diffScenariosAction(manager, {
        idA: "missing-a",
        idB: "present",
        output: "json",
      }),
    ).toThrow(/missing-a/);
    expect(() =>
      diffScenariosAction(manager, {
        idA: "missing-a",
        idB: "present",
        output: "json",
      }),
    ).toThrow(CliValidationError);
  });

  it("throws CliValidationError mentioning the B id when B is unknown", () => {
    const manager = DatabaseManager.memory();
    manager.scenarios.create({
      scenarioId: "present",
      name: "Present",
      configPayload: {},
    });
    expect(() =>
      diffScenariosAction(manager, {
        idA: "present",
        idB: "missing-b",
        output: "json",
      }),
    ).toThrow(/missing-b/);
  });

  it("returns parseable JSON matching the DiffReport shape in JSON mode", () => {
    const manager = DatabaseManager.memory();
    seedScenario(manager, "sa", { x: 1 });
    seedScenario(manager, "sb", { x: 2 });

    const rendered = diffScenariosAction(manager, {
      idA: "sa",
      idB: "sb",
      output: "json",
    });
    const parsed = JSON.parse(rendered) as DiffReport;
    expect(parsed.kind).toBe("scenario");
    expect(parsed.metadata.a.id).toBe("sa");
    expect(parsed.metadata.b.id).toBe("sb");
    expect(Array.isArray(parsed.configPayload)).toBe(true);
    expect(Array.isArray(parsed.resultPayload)).toBe(true);
  });

  it("includes both ids as headers in text mode output", () => {
    const manager = DatabaseManager.memory();
    seedScenario(manager, "alpha-id", { x: 1 });
    seedScenario(manager, "beta-id", { x: 2 });

    const rendered = diffScenariosAction(manager, {
      idA: "alpha-id",
      idB: "beta-id",
      output: "text",
    });
    expect(rendered).toContain("alpha-id");
    expect(rendered).toContain("beta-id");
    expect(rendered).toContain("A:");
    expect(rendered).toContain("B:");
  });
});

describe("diffComparisonsAction", () => {
  it("includes a GridSummary delta when both comparison results carry summaries", () => {
    const manager = DatabaseManager.memory();
    manager.comparisons.create({
      comparisonId: "ca",
      name: "CA",
      configPayload: { dimensions: [] },
    });
    manager.comparisons.create({
      comparisonId: "cb",
      name: "CB",
      configPayload: { dimensions: [] },
    });
    manager.comparisons.updateResult("ca", {
      summary: {
        totalCells: 10,
        passCount: 4,
        failCount: 3,
        warnCount: 2,
        partialCount: 1,
        errorCount: 0,
      },
    });
    manager.comparisons.updateResult("cb", {
      summary: {
        totalCells: 12,
        passCount: 7,
        failCount: 2,
        warnCount: 2,
        partialCount: 1,
        errorCount: 0,
      },
    });

    const rendered = diffComparisonsAction(manager, {
      idA: "ca",
      idB: "cb",
      output: "json",
    });
    const parsed = JSON.parse(rendered) as DiffReport;
    expect(parsed.gridSummaryDelta).toBeDefined();
    expect(parsed.gridSummaryDelta?.totalCells).toBe(2);
    expect(parsed.gridSummaryDelta?.passCount).toBe(3);
    expect(parsed.gridSummaryDelta?.failCount).toBe(-1);
    expect(parsed.gridSummaryDelta?.warnCount).toBe(0);
    expect(parsed.gridSummaryDelta?.partialCount).toBe(0);
    expect(parsed.gridSummaryDelta?.errorCount).toBe(0);
  });
});

describe("diffSimulationsAction", () => {
  it("includes a simulation-report delta when both simulations carry reports", () => {
    const manager = DatabaseManager.memory();
    manager.simulations.create({
      simulationId: "za",
      name: "ZA",
      configPayload: { simulation: { borrowerSets: [["b1"]] } },
    });
    manager.simulations.create({
      simulationId: "zb",
      name: "ZB",
      configPayload: { simulation: { borrowerSets: [["b1"]] } },
    });
    manager.simulations.updateResult("za", {
      report: {
        perProductFixes: [{ productId: "p1" }],
        bestStates: [{ s: 1 }, { s: 2 }],
        statesExplored: 25,
        terminated: "complete",
      },
    });
    manager.simulations.updateResult("zb", {
      report: {
        perProductFixes: [{ productId: "p1" }, { productId: "p2" }],
        bestStates: [{ s: 1 }],
        statesExplored: 40,
        terminated: "limit",
      },
    });

    const rendered = diffSimulationsAction(manager, {
      idA: "za",
      idB: "zb",
      output: "json",
    });
    const parsed = JSON.parse(rendered) as DiffReport;
    expect(parsed.simulationDelta).toBeDefined();
    expect(parsed.simulationDelta?.statesExplored).toBe(15);
    expect(parsed.simulationDelta?.terminatedBefore).toBe("complete");
    expect(parsed.simulationDelta?.terminatedAfter).toBe("limit");
    expect(parsed.simulationDelta?.perProductFixesDelta).toBe(1);
    expect(parsed.simulationDelta?.bestStatesDelta).toBe(-1);
  });
});
