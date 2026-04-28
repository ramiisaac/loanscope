import { describe, expect, it } from "vitest";
import { DatabaseManager } from "@loanscope/db";
import { parseConfig, loadYamlFile } from "@loanscope/config";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  buildQuickQuoteConfigPayloadFromTransaction,
  deleteComparisonAction,
  deleteScenarioAction,
  deleteSimulationAction,
  listComparisonsAction,
  listSimulationsAction,
  loadScenarioAction,
  loadScenarioFromDb,
  persistComparisonResult,
  persistScenarioResult,
  persistSimulationResult,
  renameComparisonAction,
  renameScenarioAction,
  renameSimulationAction,
  requireComparison,
  requireSimulation,
  saveScenarioAction,
  showComparisonAction,
  showScenarioAction,
  showSimulationAction,
} from "../commands/db";
import { CliValidationError } from "../cli-error";
import { findDefaultScenario, loadTransaction } from "../config-loaders";
// ---------------------------------------------------------------------------
// Command registration
// ---------------------------------------------------------------------------

describe("saved-scenario actions (in-memory DatabaseManager)", () => {
  const fixedNow = new Date(Date.UTC(2026, 0, 10, 12, 0, 0));

  it("saves a real default scenario YAML and round-trips it through load + parseConfig", () => {
    const manager = DatabaseManager.memory();
    const configPath = findDefaultScenario();
    const baseline = loadTransaction(configPath);

    const saved = saveScenarioAction(manager, {
      configPath,
      name: "Smith Family Refi",
      description: "round-trip baseline",
      now: fixedNow,
    });

    expect(saved.scenarioId).toBe("smith-family-refi-20260110120000");
    expect(saved.name).toBe("Smith Family Refi");

    // YAML round trip: load-scenario -> tmp file -> loadYamlFile -> parseConfig.
    // This asserts the documented contract that the emitted YAML is re-loadable
    // by the same path the CLI uses for `evaluate --config`.
    const yamlOut = loadScenarioAction(manager, {
      scenarioId: saved.scenarioId,
      format: "yaml",
    });
    const tmp = path.join(
      os.tmpdir(),
      `loanscope-test-${Date.now()}-${Math.random().toString(36).slice(2)}.yaml`,
    );
    fs.writeFileSync(tmp, yamlOut, "utf8");
    let reparsed;
    try {
      reparsed = parseConfig(loadYamlFile(tmp));
    } finally {
      fs.unlinkSync(tmp);
    }
    expect(reparsed.transaction).toBeDefined();
    expect(reparsed.transaction?.id).toBe(baseline.id);
    expect(reparsed.transaction?.borrowers.length).toBe(baseline.borrowers.length);
    expect(reparsed.transaction?.variants.length).toBe(baseline.variants.length);

    const jsonOut = loadScenarioAction(manager, {
      scenarioId: saved.scenarioId,
      format: "json",
    });
    expect(() => JSON.parse(jsonOut)).not.toThrow();
  });

  it("respects an explicit id override", () => {
    const manager = DatabaseManager.memory();
    const saved = saveScenarioAction(manager, {
      configPath: findDefaultScenario(),
      name: "Anything",
      id: "explicit-id",
      now: fixedNow,
    });
    expect(saved.scenarioId).toBe("explicit-id");
  });

  it("rejects an empty scenario name", () => {
    const manager = DatabaseManager.memory();
    expect(() =>
      saveScenarioAction(manager, {
        configPath: findDefaultScenario(),
        name: "   ",
      }),
    ).toThrow(CliValidationError);
  });

  it("wraps duplicate-id failures in a CliValidationError", () => {
    const manager = DatabaseManager.memory();
    const configPath = findDefaultScenario();
    saveScenarioAction(manager, {
      configPath,
      name: "Dup",
      id: "dup-id",
      now: fixedNow,
    });
    expect(() =>
      saveScenarioAction(manager, {
        configPath,
        name: "Dup",
        id: "dup-id",
        now: fixedNow,
      }),
    ).toThrow(CliValidationError);
  });

  it("show-scenario reports no result before evaluation", () => {
    const manager = DatabaseManager.memory();
    const saved = saveScenarioAction(manager, {
      configPath: findDefaultScenario(),
      name: "Pending",
      id: "pending-id",
      now: fixedNow,
    });
    const summary = showScenarioAction(manager, {
      scenarioId: saved.scenarioId,
      output: "text",
    });
    expect(summary).toContain("pending-id");
    expect(summary).toContain("Result:  none");
  });

  it("show-scenario --json returns a parseable record including the result payload after updateResult", () => {
    const manager = DatabaseManager.memory();
    const saved = saveScenarioAction(manager, {
      configPath: findDefaultScenario(),
      name: "WithResult",
      id: "with-result-id",
      now: fixedNow,
    });
    manager.scenarios.updateResult(saved.scenarioId, { eligible: true });

    const jsonText = showScenarioAction(manager, {
      scenarioId: saved.scenarioId,
      output: "json",
    });
    const parsed = JSON.parse(jsonText) as {
      scenarioId: string;
      hasResult: boolean;
      result: { eligible: boolean } | null;
    };
    expect(parsed.scenarioId).toBe("with-result-id");
    expect(parsed.hasResult).toBe(true);
    expect(parsed.result).toEqual({ eligible: true });
  });

  it("rename-scenario updates the stored name and rejects empty names", () => {
    const manager = DatabaseManager.memory();
    const saved = saveScenarioAction(manager, {
      configPath: findDefaultScenario(),
      name: "Old",
      id: "rename-id",
      now: fixedNow,
    });
    const message = renameScenarioAction(manager, {
      scenarioId: saved.scenarioId,
      name: "New",
    });
    expect(message).toContain("New");
    expect(manager.scenarios.findById(saved.scenarioId)?.name).toBe("New");

    expect(() =>
      renameScenarioAction(manager, {
        scenarioId: saved.scenarioId,
        name: "   ",
      }),
    ).toThrow(CliValidationError);
  });

  it("delete-scenario removes the row and is idempotent only via the unknown-id error path", () => {
    const manager = DatabaseManager.memory();
    const saved = saveScenarioAction(manager, {
      configPath: findDefaultScenario(),
      name: "Doomed",
      id: "doomed-id",
      now: fixedNow,
    });
    deleteScenarioAction(manager, { scenarioId: saved.scenarioId });
    expect(manager.scenarios.findById(saved.scenarioId)).toBeUndefined();
    expect(() => deleteScenarioAction(manager, { scenarioId: saved.scenarioId })).toThrow(
      CliValidationError,
    );
  });

  describe("loadScenarioFromDb", () => {
    const fixedNow = new Date(Date.UTC(2026, 0, 10, 12, 0, 0));

    it("reconstructs a Transaction from a stored transaction YAML payload", () => {
      const manager = DatabaseManager.memory();
      const configPath = findDefaultScenario();
      const baseline = loadTransaction(configPath);

      const saved = saveScenarioAction(manager, {
        configPath,
        name: "Stored Transaction",
        id: "stored-transaction",
        now: fixedNow,
      });

      const loaded = loadScenarioFromDb(manager, saved.scenarioId);
      expect(loaded.scenarioId).toBe("stored-transaction");
      expect(loaded.transaction.id).toBe(baseline.id);
      expect(loaded.transaction.borrowers.length).toBe(baseline.borrowers.length);
      expect(loaded.transaction.variants.length).toBe(baseline.variants.length);
    });

    it("reconstructs a Transaction from a stored quickQuote payload", () => {
      const manager = DatabaseManager.memory();
      manager.scenarios.create({
        scenarioId: "quick-quote-scenario",
        name: "Quick Quote",
        configPayload: {
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
        },
      });

      const loaded = loadScenarioFromDb(manager, "quick-quote-scenario");
      expect(loaded.scenarioId).toBe("quick-quote-scenario");
      expect(loaded.transaction.scenario.requestedLoanAmount).toBe(500000);
      expect(loaded.transaction.borrowers.length).toBeGreaterThan(0);
      expect(loaded.transaction.variants.length).toBeGreaterThan(0);
    });

    it("throws CliValidationError for an unknown scenario id", () => {
      const manager = DatabaseManager.memory();
      expect(() => loadScenarioFromDb(manager, "missing")).toThrow(CliValidationError);
    });

    it("propagates ConfigValidationError when a stored payload is simulation-only", () => {
      const manager = DatabaseManager.memory();
      manager.scenarios.create({
        scenarioId: "bad-payload",
        name: "Bad Payload",
        configPayload: {
          simulation: {
            borrowerSets: [["b1"]],
            payoffCandidates: [],
            maxPayoffCount: 0,
            objectives: ["MaximizeEligible"],
            limits: {
              maxStates: 10,
              maxDepth: 2,
            },
          },
        },
      });

      expect(() => loadScenarioFromDb(manager, "bad-payload")).toThrow(
        /Config must include transaction or quickQuote/,
      );
    });
  });

  describe("buildQuickQuoteConfigPayloadFromTransaction", () => {
    it("emits a quickQuote-shaped config payload", () => {
      const transaction = loadTransaction(findDefaultScenario());
      const payload = buildQuickQuoteConfigPayloadFromTransaction(transaction) as {
        quickQuote?: Record<string, unknown>;
      };

      expect(payload.quickQuote).toBeDefined();
      expect(payload.quickQuote?.loanAmount).toBeDefined();
      expect(payload.quickQuote?.fico).toBeDefined();
    });

    it("round-trips through parseConfig", () => {
      const transaction = loadTransaction(findDefaultScenario());
      const payload = buildQuickQuoteConfigPayloadFromTransaction(transaction);
      const parsed = parseConfig(payload);

      expect(parsed.quickQuote).toBeDefined();
      expect(parsed.transaction).toBeUndefined();
    });
  });

  describe("persistScenarioResult", () => {
    const fixedNow = new Date(Date.UTC(2026, 0, 10, 12, 0, 0));
    const configPayload = { transaction: { id: "txn-1" } };
    const resultPayload = {
      groups: [],
      capturedAt: "2026-01-10T12:00:00.000Z",
    };

    it("creates a new row when no existingScenarioId is provided", () => {
      const manager = DatabaseManager.memory();
      const persisted = persistScenarioResult(manager, {
        name: "Saved Eval",
        configPayload,
        resultPayload,
        now: fixedNow,
      });

      expect(persisted.created).toBe(true);
      expect(persisted.scenarioId).toBe("saved-eval-20260110120000");
      expect(manager.scenarios.findById(persisted.scenarioId)?.resultPayload).toEqual(
        resultPayload,
      );
    });

    it("updates an existing row when existingScenarioId is provided", () => {
      const manager = DatabaseManager.memory();
      manager.scenarios.create({
        scenarioId: "existing-scenario",
        name: "Existing",
        configPayload,
      });

      const persisted = persistScenarioResult(manager, {
        existingScenarioId: "existing-scenario",
        configPayload,
        resultPayload,
      });

      expect(persisted).toEqual({
        scenarioId: "existing-scenario",
        created: false,
      });
      expect(manager.scenarios.findById("existing-scenario")?.resultPayload).toEqual(resultPayload);
    });

    it("requires a name when creating a new row", () => {
      const manager = DatabaseManager.memory();
      expect(() =>
        persistScenarioResult(manager, {
          configPayload,
          resultPayload,
        }),
      ).toThrow(CliValidationError);
    });

    it("wraps duplicate-id failures in a CliValidationError", () => {
      const manager = DatabaseManager.memory();
      persistScenarioResult(manager, {
        name: "Dup",
        id: "dup-id",
        configPayload,
        resultPayload,
        now: fixedNow,
      });

      expect(() =>
        persistScenarioResult(manager, {
          name: "Dup",
          id: "dup-id",
          configPayload,
          resultPayload,
          now: fixedNow,
        }),
      ).toThrow(CliValidationError);
    });

    it("uses the scenario fallback in buildId", () => {
      const manager = DatabaseManager.memory();
      const persisted = persistScenarioResult(manager, {
        name: "!!!",
        configPayload,
        resultPayload,
        now: fixedNow,
      });

      expect(persisted.scenarioId).toBe("scenario-20260110120000");
    });
  });

  describe("persistComparisonResult", () => {
    const fixedNow = new Date(Date.UTC(2026, 0, 10, 12, 0, 0));
    const configPayload = {
      scenario: { id: "txn-1" },
      gridFlags: { ltv: "0.75:0.95:0.05" },
    };
    const resultPayload = { result: { cells: [] }, summary: { totalCells: 0 } };

    it("creates and writes a comparison result", () => {
      const manager = DatabaseManager.memory();
      const persisted = persistComparisonResult(manager, {
        name: "Compare Save",
        configPayload,
        resultPayload,
        now: fixedNow,
      });

      expect(persisted.comparisonId).toBe("compare-save-20260110120000");
      expect(manager.comparisons.findById(persisted.comparisonId)?.resultPayload).toEqual(
        resultPayload,
      );
    });

    it("links scenarioId when provided", () => {
      const manager = DatabaseManager.memory();
      manager.scenarios.create({
        scenarioId: "scenario-link",
        name: "Scenario Link",
        configPayload: { transaction: { id: "txn-1" } },
      });

      const persisted = persistComparisonResult(manager, {
        name: "Linked Compare",
        scenarioId: "scenario-link",
        configPayload,
        resultPayload,
        now: fixedNow,
      });

      expect(manager.comparisons.findById(persisted.comparisonId)?.scenarioId).toBe(
        "scenario-link",
      );
    });

    it("rejects an empty name", () => {
      const manager = DatabaseManager.memory();
      expect(() =>
        persistComparisonResult(manager, {
          name: "   ",
          configPayload,
          resultPayload,
        }),
      ).toThrow(CliValidationError);
    });
  });

  describe("persistSimulationResult", () => {
    const fixedNow = new Date(Date.UTC(2026, 0, 10, 12, 0, 0));
    const configPayload = {
      scenario: { transaction: { id: "txn-1" } },
      plan: { objectives: ["MaximizeEligible"] },
    };
    const resultPayload = {
      report: {
        perProductFixes: [],
        bestStates: [],
        statesExplored: 0,
        terminated: "complete",
      },
    };

    it("creates and writes a simulation result", () => {
      const manager = DatabaseManager.memory();
      const persisted = persistSimulationResult(manager, {
        name: "Simulation Save",
        configPayload,
        resultPayload,
        now: fixedNow,
      });

      expect(persisted.simulationId).toBe("simulation-save-20260110120000");
      expect(manager.simulations.findById(persisted.simulationId)?.resultPayload).toEqual(
        resultPayload,
      );
    });

    it("links scenarioId when provided", () => {
      const manager = DatabaseManager.memory();
      manager.scenarios.create({
        scenarioId: "scenario-link",
        name: "Scenario Link",
        configPayload: { transaction: { id: "txn-1" } },
      });

      const persisted = persistSimulationResult(manager, {
        name: "Linked Simulation",
        scenarioId: "scenario-link",
        configPayload,
        resultPayload,
        now: fixedNow,
      });

      expect(manager.simulations.findById(persisted.simulationId)?.scenarioId).toBe(
        "scenario-link",
      );
    });

    it("rejects an empty name", () => {
      const manager = DatabaseManager.memory();
      expect(() =>
        persistSimulationResult(manager, {
          name: "   ",
          configPayload,
          resultPayload,
        }),
      ).toThrow(CliValidationError);
    });
  });

  describe("db comparison management actions", () => {
    const fixedNow = new Date(Date.UTC(2026, 0, 10, 12, 0, 0));

    it("lists comparisons in text mode", () => {
      const manager = DatabaseManager.memory();
      persistComparisonResult(manager, {
        name: "Compare One",
        configPayload: { scenario: { id: "txn-1" } },
        resultPayload: { result: { cells: [] } },
        now: fixedNow,
      });

      const rendered = listComparisonsAction(manager, { output: "text" });
      expect(rendered).toContain("compare-one-20260110120000");
      expect(rendered).toContain("Compare One");
    });

    it("shows a comparison in JSON mode", () => {
      const manager = DatabaseManager.memory();
      const persisted = persistComparisonResult(manager, {
        name: "Compare Json",
        configPayload: { scenario: { id: "txn-1" } },
        resultPayload: { result: { cells: [] } },
        now: fixedNow,
      });

      const rendered = showComparisonAction(manager, {
        comparisonId: persisted.comparisonId,
        output: "json",
      });
      const parsed = JSON.parse(rendered) as {
        comparisonId: string;
        hasResult: boolean;
        result: unknown;
      };

      expect(parsed.comparisonId).toBe("compare-json-20260110120000");
      expect(parsed.hasResult).toBe(true);
      expect(parsed.result).toEqual({ result: { cells: [] } });
    });

    it("renames a comparison", () => {
      const manager = DatabaseManager.memory();
      const persisted = persistComparisonResult(manager, {
        name: "Old Compare",
        configPayload: { scenario: { id: "txn-1" } },
        resultPayload: { result: { cells: [] } },
        now: fixedNow,
      });

      const message = renameComparisonAction(manager, {
        comparisonId: persisted.comparisonId,
        name: "New Compare",
      });

      expect(message).toContain("New Compare");
      expect(manager.comparisons.findById(persisted.comparisonId)?.name).toBe("New Compare");
    });

    it("deletes a comparison", () => {
      const manager = DatabaseManager.memory();
      const persisted = persistComparisonResult(manager, {
        name: "Delete Compare",
        configPayload: { scenario: { id: "txn-1" } },
        resultPayload: { result: { cells: [] } },
        now: fixedNow,
      });

      const message = deleteComparisonAction(manager, {
        comparisonId: persisted.comparisonId,
      });

      expect(message).toContain(persisted.comparisonId);
      expect(manager.comparisons.findById(persisted.comparisonId)).toBeUndefined();
    });
  });

  describe("db simulation management actions", () => {
    const fixedNow = new Date(Date.UTC(2026, 0, 10, 12, 0, 0));

    it("lists simulations in text mode", () => {
      const manager = DatabaseManager.memory();
      persistSimulationResult(manager, {
        name: "Simulation One",
        configPayload: { scenario: { id: "txn-1" }, plan: { objectives: [] } },
        resultPayload: { report: { bestStates: [] } },
        now: fixedNow,
      });

      const rendered = listSimulationsAction(manager, { output: "text" });
      expect(rendered).toContain("simulation-one-20260110120000");
      expect(rendered).toContain("Simulation One");
    });

    it("shows a simulation in JSON mode", () => {
      const manager = DatabaseManager.memory();
      const persisted = persistSimulationResult(manager, {
        name: "Simulation Json",
        configPayload: { scenario: { id: "txn-1" }, plan: { objectives: [] } },
        resultPayload: { report: { bestStates: [] } },
        now: fixedNow,
      });

      const rendered = showSimulationAction(manager, {
        simulationId: persisted.simulationId,
        output: "json",
      });
      const parsed = JSON.parse(rendered) as {
        simulationId: string;
        hasResult: boolean;
        result: unknown;
      };

      expect(parsed.simulationId).toBe("simulation-json-20260110120000");
      expect(parsed.hasResult).toBe(true);
      expect(parsed.result).toEqual({ report: { bestStates: [] } });
    });

    it("renames a simulation", () => {
      const manager = DatabaseManager.memory();
      const persisted = persistSimulationResult(manager, {
        name: "Old Simulation",
        configPayload: { scenario: { id: "txn-1" }, plan: { objectives: [] } },
        resultPayload: { report: { bestStates: [] } },
        now: fixedNow,
      });

      const message = renameSimulationAction(manager, {
        simulationId: persisted.simulationId,
        name: "New Simulation",
      });

      expect(message).toContain("New Simulation");
      expect(manager.simulations.findById(persisted.simulationId)?.name).toBe("New Simulation");
    });

    it("deletes a simulation", () => {
      const manager = DatabaseManager.memory();
      const persisted = persistSimulationResult(manager, {
        name: "Delete Simulation",
        configPayload: { scenario: { id: "txn-1" }, plan: { objectives: [] } },
        resultPayload: { report: { bestStates: [] } },
        now: fixedNow,
      });

      const message = deleteSimulationAction(manager, {
        simulationId: persisted.simulationId,
      });

      expect(message).toContain(persisted.simulationId);
      expect(manager.simulations.findById(persisted.simulationId)).toBeUndefined();
    });
  });

  describe("requireComparison / requireSimulation exports", () => {
    it("requireComparison throws CliValidationError for an unknown id", () => {
      const manager = DatabaseManager.memory();
      expect(() => requireComparison(manager, "missing")).toThrow(CliValidationError);
    });

    it("requireSimulation throws CliValidationError for an unknown id", () => {
      const manager = DatabaseManager.memory();
      expect(() => requireSimulation(manager, "missing")).toThrow(CliValidationError);
    });
  });

  it.each([
    [
      "load",
      (m: DatabaseManager) => loadScenarioAction(m, { scenarioId: "missing", format: "yaml" }),
    ],
    [
      "show",
      (m: DatabaseManager) => showScenarioAction(m, { scenarioId: "missing", output: "text" }),
    ],
    ["delete", (m: DatabaseManager) => deleteScenarioAction(m, { scenarioId: "missing" })],
    [
      "rename",
      (m: DatabaseManager) => renameScenarioAction(m, { scenarioId: "missing", name: "x" }),
    ],
  ])("%s-scenario throws CliValidationError for an unknown id", (_name, run) => {
    const manager = DatabaseManager.memory();
    expect(() => run(manager)).toThrow(CliValidationError);
  });
});
