import { describe, expect, it, vi } from "vitest";
import { Command } from "commander";
import { DatabaseManager } from "@loanscope/db";
import { loadYamlFile } from "@loanscope/config";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { registerEvaluateCommand } from "../commands/evaluate";
import { registerCompareCommand } from "../commands/compare";
import { registerSimulateCommand } from "../commands/simulate";
import {
  assertAuditableCommand,
  buildAuditErrorSummary,
  buildCompareAuditSummary,
  buildEvaluateAuditSummary,
  buildSimulateAuditSummary,
  completeAuditError,
  completeAuditSuccess,
  listAuditSessionsAction,
  requireAuditSession,
  showAuditSessionAction,
  startAudit,
} from "../commands/audit-actions";
import { CliValidationError } from "../cli-error";
import { findDefaultScenario } from "../config-loaders";
// ---------------------------------------------------------------------------
// Command registration
// ---------------------------------------------------------------------------

describe("audit actions (in-memory DatabaseManager)", () => {
  const fixedNow = new Date(Date.UTC(2026, 4, 1, 12, 0, 0));

  it("startAudit creates a row in status running with derived sessionId", () => {
    const manager = DatabaseManager.memory();
    const { sessionId } = startAudit(manager, {
      command: "evaluate",
      argsPayload: { foo: "bar" },
      now: fixedNow,
    });
    expect(sessionId).toBe("evaluate-20260501120000");
    const record = manager.auditSessions.findById(sessionId);
    expect(record).toBeDefined();
    expect(record?.exitStatus).toBe("running");
    expect(record?.command).toBe("evaluate");
    expect(record?.argsPayload).toEqual({ foo: "bar" });
    expect(record?.scenarioId).toBeNull();
    expect(record?.completedAt).toBeNull();
  });

  it("startAudit threads scenarioId through when provided", () => {
    const manager = DatabaseManager.memory();
    // audit_sessions.scenario_id is a FK to saved_scenarios(scenario_id), so
    // the target row must exist before we can link to it.
    manager.scenarios.create({
      scenarioId: "scenario-abc",
      name: "Scenario ABC",
      configPayload: { transaction: { id: "txn-abc" } },
    });
    const { sessionId } = startAudit(manager, {
      command: "evaluate",
      argsPayload: {},
      scenarioId: "scenario-abc",
      now: fixedNow,
    });
    expect(manager.auditSessions.findById(sessionId)?.scenarioId).toBe("scenario-abc");
  });

  it("completeAuditSuccess finalizes status and resultSummary", () => {
    const manager = DatabaseManager.memory();
    const { sessionId } = startAudit(manager, {
      command: "evaluate",
      argsPayload: {},
      now: fixedNow,
    });
    completeAuditSuccess(manager, sessionId, {
      phase: "success",
      eligibleCount: 3,
    });
    const record = manager.auditSessions.findById(sessionId);
    expect(record?.exitStatus).toBe("success");
    expect(record?.resultSummary).toEqual({
      phase: "success",
      eligibleCount: 3,
    });
    expect(record?.completedAt).not.toBeNull();
  });

  it("completeAuditError finalizes status and preserves phase in resultSummary", () => {
    const manager = DatabaseManager.memory();
    const { sessionId } = startAudit(manager, {
      command: "compare",
      argsPayload: {},
      now: fixedNow,
    });
    completeAuditError(
      manager,
      sessionId,
      buildAuditErrorSummary("persistence", new CliValidationError("boom")),
    );
    const record = manager.auditSessions.findById(sessionId);
    expect(record?.exitStatus).toBe("error");
    const summary = record?.resultSummary as {
      phase: string;
      message: string;
      errorName: string;
    };
    expect(summary.phase).toBe("persistence");
    expect(summary.message).toBe("boom");
    expect(summary.errorName).toBe("CliValidationError");
  });

  it("listAuditSessionsAction filters by command", () => {
    const manager = DatabaseManager.memory();
    startAudit(manager, {
      command: "evaluate",
      argsPayload: {},
      now: new Date(Date.UTC(2026, 4, 1, 12, 0, 0)),
    });
    startAudit(manager, {
      command: "compare",
      argsPayload: {},
      now: new Date(Date.UTC(2026, 4, 1, 12, 0, 1)),
    });

    const filtered = JSON.parse(
      listAuditSessionsAction(manager, {
        command: "evaluate",
        output: "json",
      }),
    ) as Array<{ command: string }>;
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.command).toBe("evaluate");

    const all = JSON.parse(listAuditSessionsAction(manager, { output: "json" })) as Array<{
      command: string;
    }>;
    expect(all).toHaveLength(2);
    // Chronological ascending.
    expect(all.map((r) => r.command)).toEqual(["evaluate", "compare"]);

    const emptyText = listAuditSessionsAction(manager, {
      command: "quote",
      output: "text",
    });
    expect(emptyText).toContain('No audit sessions for command "quote"');
  });

  it("showAuditSessionAction returns JSON with every field", () => {
    const manager = DatabaseManager.memory();
    // audit_sessions.scenario_id is a FK to saved_scenarios(scenario_id).
    manager.scenarios.create({
      scenarioId: "scen-1",
      name: "Scen 1",
      configPayload: { transaction: { id: "txn-1" } },
    });
    const { sessionId } = startAudit(manager, {
      command: "simulate",
      argsPayload: { plan: "x" },
      scenarioId: "scen-1",
      now: fixedNow,
    });
    completeAuditSuccess(manager, sessionId, { statesExplored: 10 });

    const parsed = JSON.parse(showAuditSessionAction(manager, { sessionId, output: "json" })) as {
      sessionId: string;
      command: string;
      exitStatus: string;
      scenarioId: string | null;
      argsPayload: unknown;
      resultSummary: unknown;
    };
    expect(parsed.sessionId).toBe(sessionId);
    expect(parsed.command).toBe("simulate");
    expect(parsed.exitStatus).toBe("success");
    expect(parsed.scenarioId).toBe("scen-1");
    expect(parsed.argsPayload).toEqual({ plan: "x" });
    expect(parsed.resultSummary).toEqual({ statesExplored: 10 });

    const text = showAuditSessionAction(manager, { sessionId, output: "text" });
    expect(text).toContain("Session:");
    expect(text).toContain(sessionId);
    expect(text).toContain("simulate");
  });

  it("requireAuditSession / showAuditSessionAction raise CliValidationError for unknown ids", () => {
    const manager = DatabaseManager.memory();
    expect(() => requireAuditSession(manager, "missing")).toThrow(CliValidationError);
    expect(() =>
      showAuditSessionAction(manager, {
        sessionId: "missing",
        output: "text",
      }),
    ).toThrow(CliValidationError);
  });

  it("assertAuditableCommand accepts the enum and rejects unknown values", () => {
    expect(assertAuditableCommand("evaluate")).toBe("evaluate");
    expect(assertAuditableCommand("compare")).toBe("compare");
    expect(assertAuditableCommand("simulate")).toBe("simulate");
    expect(() => assertAuditableCommand("bogus")).toThrow(CliValidationError);
  });

  it("buildEvaluateAuditSummary reduces groups to eligible/ineligible/warnings counts", () => {
    const groups = [
      {
        results: [
          { eligible: true, warnings: [] },
          { eligible: false, warnings: ["w1", "w2"] },
        ],
      },
      {
        results: [{ eligible: true, warnings: ["w3"] }],
      },
    ];
    const summary = buildEvaluateAuditSummary({
      groups,
      persistedScenarioId: "scen-x",
    });
    expect(summary.phase).toBe("success");
    expect(summary.eligibleCount).toBe(2);
    expect(summary.ineligibleCount).toBe(1);
    expect(summary.warningsCount).toBe(3);
    expect(summary.totalResults).toBe(3);
    expect(summary.variantCount).toBe(2);
    expect(summary.persistedScenarioId).toBe("scen-x");
  });

  it("buildCompareAuditSummary mirrors GridSummary and threads lineage", () => {
    const summary = buildCompareAuditSummary(
      {
        totalCells: 10,
        passCount: 4,
        failCount: 5,
        warnCount: 1,
        partialCount: 0,
        errorCount: 0,
      },
      "compare-1",
      "scen-2",
    );
    expect(summary.persistedComparisonId).toBe("compare-1");
    expect(summary.scenarioId).toBe("scen-2");
    expect(summary.totalCells).toBe(10);
    expect(summary.passCount).toBe(4);
  });

  it("buildSimulateAuditSummary reduces a SimulationReport to counts", () => {
    const summary = buildSimulateAuditSummary(
      {
        statesExplored: 17,
        terminated: "complete",
        perProductFixes: [{}, {}],
        bestStates: [{}, {}, {}],
      },
      "sim-1",
    );
    expect(summary.statesExplored).toBe(17);
    expect(summary.terminated).toBe("complete");
    expect(summary.perProductFixesCount).toBe(2);
    expect(summary.bestStatesCount).toBe(3);
    expect(summary.persistedSimulationId).toBe("sim-1");
    expect(summary.scenarioId).toBeNull();
  });
});

describe("--audit integration with evaluate / compare / simulate", () => {
  const makeTempDbPath = (label: string): string => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), `loanscope-audit-${label}-`));
    return path.join(dir, "audit.db");
  };

  const runEvaluate = async (argv: readonly string[]): Promise<void> => {
    const program = new Command();
    program.exitOverride();
    registerEvaluateCommand(program);
    await program.parseAsync(["node", "test", "evaluate", ...argv]);
  };

  const runCompare = async (argv: readonly string[]): Promise<void> => {
    const program = new Command();
    program.exitOverride();
    registerCompareCommand(program);
    await program.parseAsync(["node", "test", "compare", ...argv]);
  };

  const runSimulate = async (argv: readonly string[]): Promise<void> => {
    const program = new Command();
    program.exitOverride();
    registerSimulateCommand(program);
    await program.parseAsync(["node", "test", "simulate", ...argv]);
  };

  it("evaluate --audit records a success row with eligibleCount and variantCount", async () => {
    const dbPath = makeTempDbPath("eval-success");
    const scenarioPath = findDefaultScenario();

    await runEvaluate([
      "--config",
      scenarioPath,
      "--audit",
      "--path",
      dbPath,
      "--output",
      "json",
      "--quiet",
    ]);

    const manager = DatabaseManager.open(dbPath);
    try {
      const sessions = manager.auditSessions.findAll();
      expect(sessions).toHaveLength(1);
      const session = sessions[0];
      expect(session?.command).toBe("evaluate");
      expect(session?.exitStatus).toBe("success");
      const summary = session?.resultSummary as {
        phase: string;
        eligibleCount: number;
        ineligibleCount: number;
        totalResults: number;
        variantCount: number;
        persistedScenarioId: string | null;
      };
      expect(summary.phase).toBe("success");
      expect(summary.totalResults).toBeGreaterThan(0);
      expect(summary.eligibleCount + summary.ineligibleCount).toBe(summary.totalResults);
      expect(summary.variantCount).toBeGreaterThan(0);
      expect(summary.persistedScenarioId).toBeNull();
    } finally {
      manager.db.$client.close();
    }
  });

  it("evaluate --audit records an evaluation-phase error when config load throws", async () => {
    const dbPath = makeTempDbPath("eval-error");
    // Non-existent config path forces loadTransaction to throw inside the
    // evaluation phase (after the audit row is created but before any
    // persistence step).
    await expect(
      runEvaluate([
        "--config",
        "/tmp/loanscope-nonexistent-config.yaml",
        "--audit",
        "--path",
        dbPath,
        "--output",
        "json",
        "--quiet",
      ]),
    ).rejects.toThrow();

    const manager = DatabaseManager.open(dbPath);
    try {
      const sessions = manager.auditSessions.findAll();
      expect(sessions).toHaveLength(1);
      const session = sessions[0];
      expect(session?.exitStatus).toBe("error");
      const summary = session?.resultSummary as {
        phase: string;
        message: string;
        errorName: string;
      };
      expect(summary.phase).toBe("evaluation");
      expect(summary.message.length).toBeGreaterThan(0);
    } finally {
      manager.db.$client.close();
    }
  });

  it("evaluate --audit + --save links the audit success to the saved scenario id", async () => {
    const dbPath = makeTempDbPath("eval-save");
    const scenarioPath = findDefaultScenario();

    await runEvaluate([
      "--config",
      scenarioPath,
      "--audit",
      "--save",
      "Audit Save",
      "--id",
      "audit-save",
      "--path",
      dbPath,
      "--output",
      "json",
      "--quiet",
    ]);

    const manager = DatabaseManager.open(dbPath);
    try {
      const sessions = manager.auditSessions.findAll();
      expect(sessions).toHaveLength(1);
      const session = sessions[0];
      expect(session?.exitStatus).toBe("success");
      const summary = session?.resultSummary as {
        persistedScenarioId: string | null;
      };
      expect(summary.persistedScenarioId).toBe("audit-save");
      expect(manager.scenarios.findById("audit-save")).toBeDefined();
    } finally {
      manager.db.$client.close();
    }
  });

  it("evaluate --audit + --from-db wires scenarioId on the audit row at start", async () => {
    const dbPath = makeTempDbPath("eval-fromdb");
    const scenarioPath = findDefaultScenario();

    // Seed a saved scenario first.
    {
      const manager = DatabaseManager.open(dbPath);
      try {
        manager.scenarios.create({
          scenarioId: "seeded",
          name: "Seeded",
          configPayload: loadYamlFile(scenarioPath),
        });
      } finally {
        manager.db.$client.close();
      }
    }

    await runEvaluate([
      "--audit",
      "--from-db",
      "seeded",
      "--path",
      dbPath,
      "--output",
      "json",
      "--quiet",
    ]);

    const manager = DatabaseManager.open(dbPath);
    try {
      const sessions = manager.auditSessions.findAll();
      expect(sessions).toHaveLength(1);
      expect(sessions[0]?.scenarioId).toBe("seeded");
      expect(sessions[0]?.exitStatus).toBe("success");
    } finally {
      manager.db.$client.close();
    }
  });

  it("compare --audit records a success row with GridSummary counts", async () => {
    const dbPath = makeTempDbPath("compare");
    const scenarioPath = findDefaultScenario();

    await runCompare([
      "--config",
      scenarioPath,
      "--audit",
      "--ltv",
      "0.75:0.85:0.05",
      "--path",
      dbPath,
      "--output",
      "json",
    ]);

    const manager = DatabaseManager.open(dbPath);
    try {
      const sessions = manager.auditSessions.findAll();
      expect(sessions).toHaveLength(1);
      const session = sessions[0];
      expect(session?.command).toBe("compare");
      expect(session?.exitStatus).toBe("success");
      const summary = session?.resultSummary as {
        totalCells: number;
        passCount: number;
        failCount: number;
        persistedComparisonId: string | null;
      };
      expect(summary.totalCells).toBeGreaterThan(0);
      expect(summary.persistedComparisonId).toBeNull();
    } finally {
      manager.db.$client.close();
    }
  });

  it("simulate --audit records a success row with SimulationReport counts", async () => {
    const dbPath = makeTempDbPath("simulate");
    const scenarioPath = findDefaultScenario();

    await runSimulate(["--config", scenarioPath, "--audit", "--path", dbPath, "--output", "json"]);

    const manager = DatabaseManager.open(dbPath);
    try {
      const sessions = manager.auditSessions.findAll();
      expect(sessions).toHaveLength(1);
      const session = sessions[0];
      expect(session?.command).toBe("simulate");
      expect(session?.exitStatus).toBe("success");
      const summary = session?.resultSummary as {
        statesExplored: number;
        terminated: string;
        bestStatesCount: number;
      };
      expect(summary.statesExplored).toBeGreaterThanOrEqual(0);
      expect(["complete", "limit", "timeout"]).toContain(summary.terminated);
    } finally {
      manager.db.$client.close();
    }
  });

  it("evaluate opens DatabaseManager exactly once when --save, --from-db, and --audit all apply", async () => {
    const dbPath = makeTempDbPath("single-open");
    const scenarioPath = findDefaultScenario();

    // Seed the source scenario.
    {
      const manager = DatabaseManager.open(dbPath);
      try {
        manager.scenarios.create({
          scenarioId: "single-open-src",
          name: "Source",
          configPayload: loadYamlFile(scenarioPath),
        });
      } finally {
        manager.db.$client.close();
      }
    }

    const openSpy = vi.spyOn(DatabaseManager, "open");
    try {
      await runEvaluate([
        "--audit",
        "--from-db",
        "single-open-src",
        "--save",
        "Re-eval",
        "--id",
        "single-open-save",
        "--path",
        dbPath,
        "--output",
        "json",
        "--quiet",
      ]);

      // Exactly one DatabaseManager.open call for the whole evaluate run.
      expect(openSpy).toHaveBeenCalledTimes(1);
    } finally {
      openSpy.mockRestore();
    }

    const manager = DatabaseManager.open(dbPath);
    try {
      // Sanity checks on the downstream rows.
      const sessions = manager.auditSessions.findAll();
      expect(sessions).toHaveLength(1);
      expect(sessions[0]?.exitStatus).toBe("success");
      // --from-db + --save on an existing scenario updates that row's
      // result payload rather than creating a new one; the audit summary
      // records the same scenarioId in persistedScenarioId.
      const summary = sessions[0]?.resultSummary as {
        persistedScenarioId: string | null;
      };
      expect(summary.persistedScenarioId).toBe("single-open-src");
    } finally {
      manager.db.$client.close();
    }
  });
});
