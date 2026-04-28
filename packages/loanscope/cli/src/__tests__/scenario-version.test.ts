import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseManager } from "@loanscope/db";
import { dumpYaml, loadYamlFile, parseConfig } from "@loanscope/config";
import { saveScenarioAction } from "../commands/db";
import {
  requireScenarioVersion,
  restoreScenarioVersionAction,
  scenarioHistoryAction,
  showScenarioVersionAction,
  updateScenarioAction,
} from "../commands/scenario-version-actions";
import { CliValidationError } from "../cli-error";
import { findDefaultScenario } from "../config-loaders";
const writeTempYaml = (payload: unknown): string => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "loanscope-scen-ver-"));
  const filePath = path.join(dir, "scenario.yaml");
  fs.writeFileSync(filePath, dumpYaml(payload), "utf8");
  return filePath;
};

const baselinePayload = (): Record<string, unknown> => {
  const raw = loadYamlFile(findDefaultScenario());
  if (typeof raw !== "object" || raw === null) {
    throw new Error("Default scenario must parse as an object");
  }
  return raw as Record<string, unknown>;
};

const tweakRequestedLoan = (
  payload: Record<string, unknown>,
  amount: number,
): Record<string, unknown> => {
  const transaction = payload["transaction"];
  if (typeof transaction !== "object" || transaction === null || Array.isArray(transaction)) {
    throw new Error("Default scenario must include a `transaction` object");
  }
  const txn = transaction as Record<string, unknown>;
  const scenario = txn["scenario"];
  if (typeof scenario !== "object" || scenario === null || Array.isArray(scenario)) {
    throw new Error("Default scenario must include a `transaction.scenario` object");
  }
  const sc = scenario as Record<string, unknown>;
  const purchasePrice = sc["purchasePrice"];
  if (typeof purchasePrice !== "number") {
    throw new Error("Default scenario must include a numeric `transaction.scenario.purchasePrice`");
  }
  if (amount > purchasePrice) {
    throw new Error(
      `tweakRequestedLoan amount (${amount}) cannot exceed purchasePrice (${purchasePrice}); the engine rejects loans above price.`,
    );
  }
  // Preserve the loan = purchasePrice - downPayment invariant by adjusting
  // downPayment to absorb the change.
  return {
    ...payload,
    transaction: {
      ...txn,
      scenario: {
        ...sc,
        requestedLoanAmount: amount,
        downPayment: purchasePrice - amount,
      },
    },
  };
};

const seedScenarioWithV1 = (
  manager: DatabaseManager,
  scenarioId: string,
  payload: Record<string, unknown>,
): void => {
  const tmp = writeTempYaml(payload);
  saveScenarioAction(manager, {
    configPath: tmp,
    name: scenarioId,
    id: scenarioId,
  });
};

describe("saveScenarioAction writes a v1 history row", () => {
  it("appends a `create` version row in the same transaction as the saved-scenario insert", () => {
    const manager = DatabaseManager.memory();
    seedScenarioWithV1(manager, "v1-only", baselinePayload());

    const history = manager.scenarioVersions.findHistory("v1-only");
    expect(history).toHaveLength(1);
    const v1 = history[0];
    expect(v1?.version).toBe(1);
    expect(v1?.changeKind).toBe("create");
    expect(v1?.restoredFromVersion).toBeNull();
    expect(v1?.configPayload).toEqual(baselinePayload());
  });

  it("captures the description as the v1 changeNote when supplied", () => {
    const manager = DatabaseManager.memory();
    const tmp = writeTempYaml(baselinePayload());
    saveScenarioAction(manager, {
      configPath: tmp,
      name: "scen-with-desc",
      id: "scen-with-desc",
      description: "initial save with note",
    });

    const v1 = manager.scenarioVersions.findVersion("scen-with-desc", 1);
    expect(v1?.changeNote).toBe("initial save with note");
  });
});

describe("updateScenarioAction", () => {
  it("replaces the live config payload and appends a v2 update row", () => {
    const manager = DatabaseManager.memory();
    const baseline = baselinePayload();
    seedScenarioWithV1(manager, "scen-update", baseline);

    const updatedPayload = tweakRequestedLoan(baseline, 1000000);
    const updatedFile = writeTempYaml(updatedPayload);

    const result = updateScenarioAction(manager, {
      scenarioId: "scen-update",
      configPath: updatedFile,
      note: "bumped loan amount",
    });

    expect(result.scenarioId).toBe("scen-update");
    expect(result.version).toBe(2);

    const live = manager.scenarios.findById("scen-update");
    expect(live?.configPayload).toEqual(updatedPayload);

    const history = manager.scenarioVersions.findHistory("scen-update");
    expect(history.map((r) => r.version)).toEqual([2, 1]);
    expect(history[0]?.changeKind).toBe("update");
    expect(history[0]?.changeNote).toBe("bumped loan amount");
    expect(history[0]?.configPayload).toEqual(updatedPayload);
    expect(history[1]?.changeKind).toBe("create");
    expect(history[1]?.configPayload).toEqual(baseline);
  });

  it("monotonically increments version numbers across multiple updates", () => {
    const manager = DatabaseManager.memory();
    const baseline = baselinePayload();
    seedScenarioWithV1(manager, "scen-mono", baseline);

    const second = tweakRequestedLoan(baseline, 800000);
    const third = tweakRequestedLoan(baseline, 850000);
    const fourth = tweakRequestedLoan(baseline, 950000);

    const r2 = updateScenarioAction(manager, {
      scenarioId: "scen-mono",
      configPath: writeTempYaml(second),
    });
    const r3 = updateScenarioAction(manager, {
      scenarioId: "scen-mono",
      configPath: writeTempYaml(third),
    });
    const r4 = updateScenarioAction(manager, {
      scenarioId: "scen-mono",
      configPath: writeTempYaml(fourth),
    });

    expect(r2.version).toBe(2);
    expect(r3.version).toBe(3);
    expect(r4.version).toBe(4);
    expect(manager.scenarioVersions.countVersions("scen-mono")).toBe(4);
    expect(manager.scenarioVersions.getLatestVersion("scen-mono")?.version).toBe(4);
  });

  it("raises CliValidationError for an unknown scenarioId", () => {
    const manager = DatabaseManager.memory();
    const tmp = writeTempYaml(baselinePayload());
    expect(() =>
      updateScenarioAction(manager, {
        scenarioId: "does-not-exist",
        configPath: tmp,
      }),
    ).toThrow(CliValidationError);
  });

  it("raises a config parse error and leaves history untouched on invalid YAML", () => {
    const manager = DatabaseManager.memory();
    seedScenarioWithV1(manager, "scen-bad-update", baselinePayload());

    const invalidFile = writeTempYaml({
      transaction: { scenario: "not-an-object" },
    });

    expect(() =>
      updateScenarioAction(manager, {
        scenarioId: "scen-bad-update",
        configPath: invalidFile,
      }),
    ).toThrow();

    const history = manager.scenarioVersions.findHistory("scen-bad-update");
    expect(history).toHaveLength(1);
    expect(history[0]?.version).toBe(1);
    expect(history[0]?.changeKind).toBe("create");
  });
});

describe("scenarioHistoryAction", () => {
  it("renders a text history with one line per version including the changeNote", () => {
    const manager = DatabaseManager.memory();
    const baseline = baselinePayload();
    seedScenarioWithV1(manager, "scen-hist", baseline);
    updateScenarioAction(manager, {
      scenarioId: "scen-hist",
      configPath: writeTempYaml(tweakRequestedLoan(baseline, 800000)),
      note: "bump 1",
    });
    updateScenarioAction(manager, {
      scenarioId: "scen-hist",
      configPath: writeTempYaml(tweakRequestedLoan(baseline, 850000)),
      note: "bump 2",
    });

    const text = scenarioHistoryAction(manager, {
      scenarioId: "scen-hist",
      output: "text",
    });

    expect(text).toContain("scen-hist");
    expect(text).toContain("v3");
    expect(text).toContain("v2");
    expect(text).toContain("v1");
    expect(text).toContain("[update]");
    expect(text).toContain("[create]");
    expect(text).toContain("bump 1");
    expect(text).toContain("bump 2");
  });

  it("returns a parseable JSON history in descending version order", () => {
    const manager = DatabaseManager.memory();
    const baseline = baselinePayload();
    seedScenarioWithV1(manager, "scen-hist-json", baseline);
    updateScenarioAction(manager, {
      scenarioId: "scen-hist-json",
      configPath: writeTempYaml(tweakRequestedLoan(baseline, 800000)),
    });

    const json = scenarioHistoryAction(manager, {
      scenarioId: "scen-hist-json",
      output: "json",
    });
    const parsed = JSON.parse(json) as Array<{
      version: number;
      changeKind: string;
      changeNote: string | null;
      restoredFromVersion: number | null;
    }>;
    expect(parsed.map((r) => r.version)).toEqual([2, 1]);
    expect(parsed[0]?.changeKind).toBe("update");
    expect(parsed[1]?.changeKind).toBe("create");
  });

  it("raises CliValidationError for an unknown scenarioId", () => {
    const manager = DatabaseManager.memory();
    expect(() =>
      scenarioHistoryAction(manager, {
        scenarioId: "does-not-exist",
        output: "text",
      }),
    ).toThrow(CliValidationError);
  });
});

describe("showScenarioVersionAction", () => {
  it("emits the historical YAML payload that re-loads through parseConfig", () => {
    const manager = DatabaseManager.memory();
    const baseline = baselinePayload();
    seedScenarioWithV1(manager, "scen-show", baseline);
    updateScenarioAction(manager, {
      scenarioId: "scen-show",
      configPath: writeTempYaml(tweakRequestedLoan(baseline, 800000)),
    });

    const yaml = showScenarioVersionAction(manager, {
      scenarioId: "scen-show",
      version: 1,
      format: "yaml",
    });

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "loanscope-scen-show-"));
    const tmp = path.join(dir, "v1.yaml");
    fs.writeFileSync(tmp, yaml, "utf8");
    const reparsed = parseConfig(loadYamlFile(tmp));
    expect(reparsed.transaction).toBeDefined();
  });

  it("emits the historical JSON payload when format is json", () => {
    const manager = DatabaseManager.memory();
    const baseline = baselinePayload();
    seedScenarioWithV1(manager, "scen-show-json", baseline);

    const json = showScenarioVersionAction(manager, {
      scenarioId: "scen-show-json",
      version: 1,
      format: "json",
    });

    const parsed = JSON.parse(json) as unknown;
    expect(parsed).toEqual(baseline);
  });

  it("accepts version arguments with a `v` prefix (e.g. 'v3')", () => {
    const manager = DatabaseManager.memory();
    const baseline = baselinePayload();
    seedScenarioWithV1(manager, "scen-vprefix", baseline);
    updateScenarioAction(manager, {
      scenarioId: "scen-vprefix",
      configPath: writeTempYaml(tweakRequestedLoan(baseline, 800000)),
    });

    const yaml = showScenarioVersionAction(manager, {
      scenarioId: "scen-vprefix",
      version: "v2",
      format: "yaml",
    });
    expect(yaml.length).toBeGreaterThan(0);
  });

  it("raises CliValidationError for an unknown version", () => {
    const manager = DatabaseManager.memory();
    seedScenarioWithV1(manager, "scen-no-v3", baselinePayload());
    expect(() =>
      showScenarioVersionAction(manager, {
        scenarioId: "scen-no-v3",
        version: 99,
        format: "yaml",
      }),
    ).toThrow(CliValidationError);
  });

  it("raises CliValidationError for a non-positive version literal", () => {
    const manager = DatabaseManager.memory();
    seedScenarioWithV1(manager, "scen-bad-v", baselinePayload());
    expect(() =>
      showScenarioVersionAction(manager, {
        scenarioId: "scen-bad-v",
        version: "0",
        format: "yaml",
      }),
    ).toThrow(CliValidationError);
    expect(() =>
      showScenarioVersionAction(manager, {
        scenarioId: "scen-bad-v",
        version: "abc",
        format: "yaml",
      }),
    ).toThrow(CliValidationError);
  });

  it("raises CliValidationError for an unknown scenarioId", () => {
    const manager = DatabaseManager.memory();
    expect(() =>
      showScenarioVersionAction(manager, {
        scenarioId: "does-not-exist",
        version: 1,
        format: "yaml",
      }),
    ).toThrow(CliValidationError);
  });
});

describe("restoreScenarioVersionAction", () => {
  it("restores a prior version's payload and appends a new restore row", () => {
    const manager = DatabaseManager.memory();
    const baseline = baselinePayload();
    seedScenarioWithV1(manager, "scen-restore", baseline);
    const updatedPayload = tweakRequestedLoan(baseline, 800000);
    updateScenarioAction(manager, {
      scenarioId: "scen-restore",
      configPath: writeTempYaml(updatedPayload),
    });

    const result = restoreScenarioVersionAction(manager, {
      scenarioId: "scen-restore",
      version: 1,
      note: "rollback after bad edit",
    });

    expect(result.scenarioId).toBe("scen-restore");
    expect(result.restoredFromVersion).toBe(1);
    expect(result.newVersion).toBe(3);

    const live = manager.scenarios.findById("scen-restore");
    expect(live?.configPayload).toEqual(baseline);

    const v3 = manager.scenarioVersions.findVersion("scen-restore", 3);
    expect(v3?.changeKind).toBe("restore");
    expect(v3?.restoredFromVersion).toBe(1);
    expect(v3?.changeNote).toBe("rollback after bad edit");
    expect(v3?.configPayload).toEqual(baseline);

    const history = manager.scenarioVersions.findHistory("scen-restore");
    expect(history.map((r) => r.version)).toEqual([3, 2, 1]);
  });

  it("rejects restoring to the current latest version", () => {
    const manager = DatabaseManager.memory();
    const baseline = baselinePayload();
    seedScenarioWithV1(manager, "scen-restore-self", baseline);

    expect(() =>
      restoreScenarioVersionAction(manager, {
        scenarioId: "scen-restore-self",
        version: 1,
      }),
    ).toThrow(CliValidationError);
  });

  it("supports a 'v'-prefixed version argument", () => {
    const manager = DatabaseManager.memory();
    const baseline = baselinePayload();
    seedScenarioWithV1(manager, "scen-restore-vprefix", baseline);
    updateScenarioAction(manager, {
      scenarioId: "scen-restore-vprefix",
      configPath: writeTempYaml(tweakRequestedLoan(baseline, 800000)),
    });

    const result = restoreScenarioVersionAction(manager, {
      scenarioId: "scen-restore-vprefix",
      version: "v1",
    });
    expect(result.restoredFromVersion).toBe(1);
    expect(result.newVersion).toBe(3);
  });

  it("raises CliValidationError for an unknown scenarioId", () => {
    const manager = DatabaseManager.memory();
    expect(() =>
      restoreScenarioVersionAction(manager, {
        scenarioId: "does-not-exist",
        version: 1,
      }),
    ).toThrow(CliValidationError);
  });

  it("raises CliValidationError for an unknown version", () => {
    const manager = DatabaseManager.memory();
    seedScenarioWithV1(manager, "scen-restore-bad-v", baselinePayload());
    expect(() =>
      restoreScenarioVersionAction(manager, {
        scenarioId: "scen-restore-bad-v",
        version: 99,
      }),
    ).toThrow(CliValidationError);
  });
});

describe("requireScenarioVersion", () => {
  it("returns the row when present and raises CliValidationError otherwise", () => {
    const manager = DatabaseManager.memory();
    seedScenarioWithV1(manager, "scen-require", baselinePayload());

    const v1 = requireScenarioVersion(manager, "scen-require", 1);
    expect(v1.version).toBe(1);
    expect(v1.changeKind).toBe("create");

    expect(() => requireScenarioVersion(manager, "scen-require", 7)).toThrow(CliValidationError);
  });
});

describe("end-to-end: scenarios delete cascades version history", () => {
  it("removes every scenario_versions row when the parent scenario is deleted", () => {
    const manager = DatabaseManager.memory();
    const baseline = baselinePayload();
    seedScenarioWithV1(manager, "scen-cascade", baseline);
    updateScenarioAction(manager, {
      scenarioId: "scen-cascade",
      configPath: writeTempYaml(tweakRequestedLoan(baseline, 800000)),
    });
    updateScenarioAction(manager, {
      scenarioId: "scen-cascade",
      configPath: writeTempYaml(tweakRequestedLoan(baseline, 850000)),
    });
    expect(manager.scenarioVersions.countVersions("scen-cascade")).toBe(3);

    manager.scenarios.delete("scen-cascade");

    expect(manager.scenarios.findById("scen-cascade")).toBeUndefined();
    expect(manager.scenarioVersions.countVersions("scen-cascade")).toBe(0);
    expect(manager.scenarioVersions.findHistory("scen-cascade")).toEqual([]);
  });
});
