import { describe, it, expect, beforeEach } from "vitest";
import type { ProductDefinition } from "@loanscope/domain";
import {
  AmortizationTerm,
  AmortizationType,
  Channel,
  LoanType,
  ProgramKind,
  ratio,
} from "@loanscope/domain";
import type { LenderDefinitionInput } from "@loanscope/lenders";
import { DatabaseManager } from "../database-manager";
import { seedLender } from "../seed";

/* ------------------------------------------------------------------ */
/*  Test fixtures                                                      */
/* ------------------------------------------------------------------ */

const makeProduct = (id: string, name: string): ProductDefinition => ({
  id,
  name,
  loanType: LoanType.Conventional,
  channel: Channel.Agency,
  variants: [
    {
      programKind: ProgramKind.Fixed,
      amortization: {
        type: AmortizationType.FullyAmortizing,
        qualifyingPaymentPolicy: { kind: "NotePayment" },
      },
      terms: [AmortizationTerm.M360],
      constraints: {
        Primary: { maxLTVRatio: ratio(0.95), minFico: 620 },
        Secondary: { maxLTVRatio: ratio(0.9), minFico: 680 },
        Investment: { maxLTVRatio: ratio(0.85), minFico: 700 },
      },
    },
  ],
});

const PRODUCT_A = makeProduct("prod_a", "Product A");
const PRODUCT_B = makeProduct("prod_b", "Product B");

const testLenderInput: LenderDefinitionInput = {
  id: "test_lender",
  name: "Test Lender",
  products: [PRODUCT_A, PRODUCT_B],
  presets: [
    {
      id: "all",
      name: "All Products",
      productIds: ["prod_a", "prod_b"],
    },
  ],
};

/* ------------------------------------------------------------------ */
/*  DatabaseManager tests                                              */
/* ------------------------------------------------------------------ */

describe("DatabaseManager", () => {
  let manager: DatabaseManager;

  beforeEach(() => {
    manager = DatabaseManager.memory();
  });

  // ---- Initialization ----

  it("memory() creates an initialized in-memory database", () => {
    expect(manager).toBeInstanceOf(DatabaseManager);
    expect(manager.db).toBeDefined();
  });

  it("exposes all repository and service properties", () => {
    expect(manager.lenders).toBeDefined();
    expect(manager.customProducts).toBeDefined();
    expect(manager.scenarios).toBeDefined();
    expect(manager.comparisons).toBeDefined();
    expect(manager.simulations).toBeDefined();
    expect(manager.importRuns).toBeDefined();
    expect(manager.auditSessions).toBeDefined();
  });

  // ---- stats() ----

  it("stats() returns all zero counts on a fresh database", () => {
    const stats = manager.stats();
    expect(stats.lenders).toBe(0);
    expect(stats.scenarios).toBe(0);
    expect(stats.comparisons).toBe(0);
    expect(stats.simulations).toBe(0);
    expect(stats.customProductSets).toBe(0);
    expect(stats.importRuns).toBe(0);
    expect(stats.auditSessions).toBe(0);
  });

  it("stats().lenders is 1 after seeding a lender", () => {
    seedLender(manager.db, testLenderInput);
    const stats = manager.stats();
    expect(stats.lenders).toBe(1);
  });

  // ---- PersistentLenderRegistry ----

  it("lenders property works as PersistentLenderRegistry", () => {
    seedLender(manager.db, testLenderInput);

    expect(manager.lenders.size).toBe(1);
    expect(manager.lenders.hasLender("test_lender")).toBe(true);
    expect(manager.lenders.hasLender("nonexistent")).toBe(false);

    const lender = manager.lenders.getLender("test_lender");
    expect(lender.id).toBe("test_lender");
    expect(lender.name).toBe("Test Lender");
    expect(lender.products).toHaveLength(2);

    const products = manager.lenders.getProducts("test_lender");
    expect(products).toHaveLength(2);
    expect(products.map((p) => p.id).sort()).toEqual(["prod_a", "prod_b"]);

    const presets = manager.lenders.getPresets("test_lender");
    expect(presets).toHaveLength(1);
    expect(presets[0]?.id).toBe("all");
  });

  // ---- CustomProductService ----

  it("customProducts property works as CustomProductService", () => {
    const record = manager.customProducts.createSet({
      setId: "custom_set",
      name: "Custom Set",
      products: [PRODUCT_A],
    });

    expect(record.setId).toBe("custom_set");
    expect(record.name).toBe("Custom Set");

    const sets = manager.customProducts.listSets();
    expect(sets).toHaveLength(1);

    const retrieved = manager.customProducts.getSet("custom_set");
    expect(retrieved).toBeDefined();
    expect(retrieved?.products).toHaveLength(1);

    const stats = manager.stats();
    expect(stats.customProductSets).toBe(1);
  });

  // ---- SavedScenarioRepository ----

  it("scenarios repo is accessible and functional", () => {
    const scenario = manager.scenarios.create({
      scenarioId: "scen_001",
      name: "Test Scenario",
      description: "A test scenario",
      configPayload: { loanAmount: 500000 },
    });

    expect(scenario.scenarioId).toBe("scen_001");
    expect(scenario.name).toBe("Test Scenario");
    expect(scenario.resultPayload).toBeNull();

    expect(manager.scenarios.findAll()).toHaveLength(1);
    expect(manager.scenarios.findById("scen_001")).toBeDefined();

    manager.scenarios.updateResult("scen_001", { eligible: true });
    const updated = manager.scenarios.findById("scen_001");
    expect(updated?.resultPayload).toEqual({ eligible: true });

    const stats = manager.stats();
    expect(stats.scenarios).toBe(1);
  });

  // ---- SavedComparisonRepository ----

  it("comparisons repo is accessible and functional", () => {
    const comparison = manager.comparisons.create({
      comparisonId: "cmp_001",
      name: "Test Comparison",
      configPayload: { ltvRange: { min: 0.75, max: 0.95 } },
    });

    expect(comparison.comparisonId).toBe("cmp_001");
    expect(comparison.name).toBe("Test Comparison");
    expect(comparison.resultPayload).toBeNull();

    expect(manager.comparisons.findAll()).toHaveLength(1);
    expect(manager.comparisons.findById("cmp_001")).toBeDefined();

    const stats = manager.stats();
    expect(stats.comparisons).toBe(1);
  });

  // ---- SavedSimulationRepository ----

  it("simulations repo is accessible and functional", () => {
    const simulation = manager.simulations.create({
      simulationId: "sim_001",
      name: "Test Simulation",
      configPayload: { iterations: 10000 },
    });

    expect(simulation.simulationId).toBe("sim_001");
    expect(simulation.name).toBe("Test Simulation");
    expect(simulation.resultPayload).toBeNull();

    expect(manager.simulations.findAll()).toHaveLength(1);
    expect(manager.simulations.findById("sim_001")).toBeDefined();

    const stats = manager.stats();
    expect(stats.simulations).toBe(1);
  });

  // ---- ImportRunRepository ----

  it("importRuns repo is accessible and functional", () => {
    // Need a lender for FK constraint
    seedLender(manager.db, testLenderInput);

    const run = manager.importRuns.create({
      runId: "run_001",
      lenderId: "test_lender",
      sourceFile: "products.yaml",
      sourceFormat: "yaml",
      contentHash: "abc123",
    });

    expect(run.runId).toBe("run_001");
    expect(run.status).toBe("pending");
    expect(run.productsImported).toBe(0);

    expect(manager.importRuns.findAll()).toHaveLength(1);
    expect(manager.importRuns.findById("run_001")).toBeDefined();

    manager.importRuns.markSuccess("run_001", 5, 1);
    const updated = manager.importRuns.findById("run_001");
    expect(updated?.status).toBe("success");
    expect(updated?.productsImported).toBe(5);

    const stats = manager.stats();
    expect(stats.importRuns).toBe(1);
  });

  // ---- AuditSessionRepository ----

  it("auditSessions repo is accessible and functional", () => {
    const session = manager.auditSessions.create({
      sessionId: "sess_001",
      command: "evaluate",
      argsPayload: { loan: 500000, fico: 740 },
    });

    expect(session.sessionId).toBe("sess_001");
    expect(session.command).toBe("evaluate");
    expect(session.exitStatus).toBe("running");

    expect(manager.auditSessions.findAll()).toHaveLength(1);
    expect(manager.auditSessions.findById("sess_001")).toBeDefined();

    manager.auditSessions.markSuccess("sess_001", { result: "ok" });
    const updated = manager.auditSessions.findById("sess_001");
    expect(updated?.exitStatus).toBe("success");
    expect(updated?.resultSummary).toEqual({ result: "ok" });

    const stats = manager.stats();
    expect(stats.auditSessions).toBe(1);
  });

  // ---- Stats integration ----

  it("stats() reflects data across all repositories", () => {
    seedLender(manager.db, testLenderInput);

    manager.scenarios.create({
      scenarioId: "s1",
      name: "Scenario",
      configPayload: {},
    });
    manager.scenarios.create({
      scenarioId: "s2",
      name: "Scenario 2",
      configPayload: {},
    });

    manager.comparisons.create({
      comparisonId: "c1",
      name: "Comparison",
      configPayload: {},
    });

    manager.simulations.create({
      simulationId: "sim1",
      name: "Simulation",
      configPayload: {},
    });

    manager.customProducts.createSet({
      setId: "cs1",
      name: "Custom",
      products: [PRODUCT_A],
    });

    manager.importRuns.create({
      runId: "r1",
      lenderId: "test_lender",
      sourceFile: "f.json",
      sourceFormat: "json",
      contentHash: "hash",
    });

    manager.auditSessions.create({
      sessionId: "a1",
      command: "quote",
      argsPayload: {},
    });

    const stats = manager.stats();
    expect(stats.lenders).toBe(1);
    expect(stats.scenarios).toBe(2);
    expect(stats.comparisons).toBe(1);
    expect(stats.simulations).toBe(1);
    expect(stats.customProductSets).toBe(1);
    expect(stats.importRuns).toBe(1);
    expect(stats.auditSessions).toBe(1);
  });

  // ---- Isolation ----

  it("separate DatabaseManager instances are isolated", () => {
    const manager1 = DatabaseManager.memory();
    const manager2 = DatabaseManager.memory();

    manager1.scenarios.create({
      scenarioId: "isolated",
      name: "Isolated",
      configPayload: {},
    });

    expect(manager1.scenarios.findAll()).toHaveLength(1);
    expect(manager2.scenarios.findAll()).toHaveLength(0);
  });
});
