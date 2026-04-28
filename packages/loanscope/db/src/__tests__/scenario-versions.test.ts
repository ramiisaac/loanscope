import { describe, it, expect, beforeEach } from "vitest";
import { createMemoryDatabase } from "../connection";
import type { LoanScopeDB } from "../connection";
import { applySchema } from "../migrate";
import { createScenarioRepository } from "../repositories/scenario-repository";
import { createScenarioVersionRepository } from "../repositories/scenario-version-repository";
import type { SavedScenarioRepository } from "../repositories/scenario-repository";
import type { ScenarioVersionRepository } from "../repositories/scenario-version-repository";

const SAMPLE_PAYLOAD_V1 = {
  transaction: { id: "txn-1", scenario: { requestedLoanAmount: 500000 } },
};

const SAMPLE_PAYLOAD_V2 = {
  transaction: { id: "txn-1", scenario: { requestedLoanAmount: 600000 } },
};

const SAMPLE_PAYLOAD_V3 = {
  transaction: { id: "txn-1", scenario: { requestedLoanAmount: 700000 } },
};

describe("ScenarioVersionRepository", () => {
  let db: LoanScopeDB;
  let scenarios: SavedScenarioRepository;
  let versions: ScenarioVersionRepository;

  beforeEach(() => {
    db = createMemoryDatabase();
    applySchema(db);
    scenarios = createScenarioRepository(db);
    versions = createScenarioVersionRepository(db);
    scenarios.create({
      scenarioId: "scen-1",
      name: "Scenario 1",
      configPayload: SAMPLE_PAYLOAD_V1,
    });
  });

  it("appends a version row and round-trips the payload via JSON", () => {
    const record = versions.append({
      scenarioId: "scen-1",
      version: 1,
      configPayload: SAMPLE_PAYLOAD_V1,
      changeKind: "create",
    });

    expect(record.scenarioId).toBe("scen-1");
    expect(record.version).toBe(1);
    expect(record.changeKind).toBe("create");
    expect(record.changeNote).toBeNull();
    expect(record.restoredFromVersion).toBeNull();
    expect(record.configPayload).toEqual(SAMPLE_PAYLOAD_V1);
    expect(typeof record.createdAt).toBe("string");
    expect(record.id).toBeGreaterThan(0);
  });

  it("preserves changeNote and restoredFromVersion when supplied", () => {
    versions.append({
      scenarioId: "scen-1",
      version: 1,
      configPayload: SAMPLE_PAYLOAD_V1,
      changeKind: "create",
      changeNote: "initial save",
    });

    const restored = versions.append({
      scenarioId: "scen-1",
      version: 2,
      configPayload: SAMPLE_PAYLOAD_V1,
      changeKind: "restore",
      restoredFromVersion: 1,
      changeNote: "rollback after bad edit",
    });

    expect(restored.changeKind).toBe("restore");
    expect(restored.restoredFromVersion).toBe(1);
    expect(restored.changeNote).toBe("rollback after bad edit");

    const fetched = versions.findVersion("scen-1", 2);
    expect(fetched).toEqual(restored);
  });

  it("findVersion returns undefined for an unknown (scenarioId, version) pair", () => {
    expect(versions.findVersion("scen-1", 1)).toBeUndefined();
    expect(versions.findVersion("does-not-exist", 1)).toBeUndefined();
  });

  it("getLatestVersion returns the highest version for a scenario", () => {
    versions.append({
      scenarioId: "scen-1",
      version: 1,
      configPayload: SAMPLE_PAYLOAD_V1,
      changeKind: "create",
    });
    versions.append({
      scenarioId: "scen-1",
      version: 2,
      configPayload: SAMPLE_PAYLOAD_V2,
      changeKind: "update",
    });
    versions.append({
      scenarioId: "scen-1",
      version: 3,
      configPayload: SAMPLE_PAYLOAD_V3,
      changeKind: "update",
    });

    const latest = versions.getLatestVersion("scen-1");
    expect(latest).toBeDefined();
    expect(latest?.version).toBe(3);
    expect(latest?.configPayload).toEqual(SAMPLE_PAYLOAD_V3);
  });

  it("getLatestVersion returns undefined when no versions exist", () => {
    expect(versions.getLatestVersion("scen-1")).toBeUndefined();
  });

  it("findHistory returns versions in descending order with full payload fidelity", () => {
    versions.append({
      scenarioId: "scen-1",
      version: 1,
      configPayload: SAMPLE_PAYLOAD_V1,
      changeKind: "create",
    });
    versions.append({
      scenarioId: "scen-1",
      version: 2,
      configPayload: SAMPLE_PAYLOAD_V2,
      changeKind: "update",
      changeNote: "bumped loan amount",
    });
    versions.append({
      scenarioId: "scen-1",
      version: 3,
      configPayload: SAMPLE_PAYLOAD_V3,
      changeKind: "update",
    });

    const history = versions.findHistory("scen-1");
    expect(history.map((r) => r.version)).toEqual([3, 2, 1]);
    expect(history[0]?.configPayload).toEqual(SAMPLE_PAYLOAD_V3);
    expect(history[1]?.configPayload).toEqual(SAMPLE_PAYLOAD_V2);
    expect(history[1]?.changeNote).toBe("bumped loan amount");
    expect(history[2]?.configPayload).toEqual(SAMPLE_PAYLOAD_V1);
  });

  it("findHistory returns an empty array for an unknown scenario", () => {
    expect(versions.findHistory("does-not-exist")).toEqual([]);
  });

  it("countVersions reflects the number of appended rows", () => {
    expect(versions.countVersions("scen-1")).toBe(0);

    versions.append({
      scenarioId: "scen-1",
      version: 1,
      configPayload: SAMPLE_PAYLOAD_V1,
      changeKind: "create",
    });
    expect(versions.countVersions("scen-1")).toBe(1);

    versions.append({
      scenarioId: "scen-1",
      version: 2,
      configPayload: SAMPLE_PAYLOAD_V2,
      changeKind: "update",
    });
    expect(versions.countVersions("scen-1")).toBe(2);
  });

  it("countVersions returns 0 for an unknown scenario", () => {
    expect(versions.countVersions("does-not-exist")).toBe(0);
  });

  it("rejects duplicate (scenarioId, version) pairs via the UNIQUE index", () => {
    versions.append({
      scenarioId: "scen-1",
      version: 1,
      configPayload: SAMPLE_PAYLOAD_V1,
      changeKind: "create",
    });
    expect(() =>
      versions.append({
        scenarioId: "scen-1",
        version: 1,
        configPayload: SAMPLE_PAYLOAD_V2,
        changeKind: "update",
      }),
    ).toThrow();
  });

  it("permits independent version sequences across distinct scenarios", () => {
    scenarios.create({
      scenarioId: "scen-2",
      name: "Scenario 2",
      configPayload: SAMPLE_PAYLOAD_V1,
    });

    versions.append({
      scenarioId: "scen-1",
      version: 1,
      configPayload: SAMPLE_PAYLOAD_V1,
      changeKind: "create",
    });
    versions.append({
      scenarioId: "scen-2",
      version: 1,
      configPayload: SAMPLE_PAYLOAD_V1,
      changeKind: "create",
    });
    versions.append({
      scenarioId: "scen-2",
      version: 2,
      configPayload: SAMPLE_PAYLOAD_V2,
      changeKind: "update",
    });

    expect(versions.countVersions("scen-1")).toBe(1);
    expect(versions.countVersions("scen-2")).toBe(2);
    expect(versions.getLatestVersion("scen-1")?.version).toBe(1);
    expect(versions.getLatestVersion("scen-2")?.version).toBe(2);
  });

  it("rejects appends that violate the FK constraint to saved_scenarios", () => {
    expect(() =>
      versions.append({
        scenarioId: "does-not-exist",
        version: 1,
        configPayload: SAMPLE_PAYLOAD_V1,
        changeKind: "create",
      }),
    ).toThrow();
  });

  it("cascades deletes from saved_scenarios to scenario_versions", () => {
    versions.append({
      scenarioId: "scen-1",
      version: 1,
      configPayload: SAMPLE_PAYLOAD_V1,
      changeKind: "create",
    });
    versions.append({
      scenarioId: "scen-1",
      version: 2,
      configPayload: SAMPLE_PAYLOAD_V2,
      changeKind: "update",
    });
    expect(versions.countVersions("scen-1")).toBe(2);

    scenarios.delete("scen-1");

    expect(versions.countVersions("scen-1")).toBe(0);
    expect(versions.findHistory("scen-1")).toEqual([]);
  });
});
