import { describe, it, expect, beforeEach } from "vitest";
import { sql } from "drizzle-orm";
import { createMemoryDatabase } from "../connection";
import type { LoanScopeDB } from "../connection";
import { applySchema } from "../migrate";
import { createScenarioRepository } from "../repositories/scenario-repository";
import { createComparisonRepository } from "../repositories/comparison-repository";
import { createSimulationRepository } from "../repositories/simulation-repository";
import type { SavedScenarioRepository } from "../repositories/scenario-repository";
import type { SavedComparisonRepository } from "../repositories/comparison-repository";
import type { SavedSimulationRepository } from "../repositories/simulation-repository";

/* ------------------------------------------------------------------ */
/*  Test fixtures                                                      */
/* ------------------------------------------------------------------ */

/** Representative scenario config payload for round-trip tests. */
const SCENARIO_CONFIG = {
  transaction: {
    loanAmount: 500000,
    propertyValue: 625000,
    fico: 740,
    occupancy: "Primary",
    ltv: 0.8,
    dti: 0.35,
  },
  productSource: { kind: "builtin", lenderId: "uwm" },
  options: { includeAllVariants: true },
};

/** Representative evaluation result payload. */
const SCENARIO_RESULT = {
  eligible: true,
  products: [
    {
      productId: "uwm_jumbo_pink",
      rate: 6.25,
      adjustments: [{ name: "LTV > 75%", value: 0.125 }],
      monthly: { pi: 3078.59, taxes: 520.83, insurance: 150 },
    },
  ],
  warnings: [],
};

/** Representative comparison config payload. */
const COMPARISON_CONFIG = {
  gridParams: { ltvRange: { min: 0.75, max: 0.95, step: 0.05 } },
  productFilters: ["uwm_jumbo_pink", "uwm_conv_30"],
  baseScenario: { loanAmount: 500000, fico: 740 },
};

/** Representative comparison result payload. */
const COMPARISON_RESULT = {
  grid: [
    { ltv: 0.75, rates: [6.0, 6.125] },
    { ltv: 0.8, rates: [6.125, 6.25] },
  ],
};

/** Representative simulation config payload. */
const SIMULATION_CONFIG = {
  strategy: "monteCarlo",
  iterations: 10000,
  rateShock: { min: -1.0, max: 2.0 },
  appreciationRange: { min: -0.05, max: 0.1 },
};

/** Representative simulation result payload. */
const SIMULATION_RESULT = {
  summary: {
    medianEquity: 125000,
    p5Equity: 80000,
    p95Equity: 210000,
    defaultProbability: 0.023,
  },
  histogram: [
    { bucket: 50000, count: 120 },
    { bucket: 100000, count: 3500 },
  ],
};

/* ------------------------------------------------------------------ */
/*  Schema tests                                                       */
/* ------------------------------------------------------------------ */

describe("schema creation with saved session tables", () => {
  it("creates all eleven tables after applySchema", () => {
    const db = createMemoryDatabase();
    applySchema(db);

    const tables = db.all<{ name: string }>(
      sql`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`,
    );
    const names = tables.map((t) => t.name).sort();
    expect(names).toEqual([
      "audit_sessions",
      "catalog_versions",
      "custom_product_sets",
      "import_runs",
      "lender_presets",
      "lenders",
      "product_catalogs",
      "saved_comparisons",
      "saved_scenarios",
      "saved_simulations",
      "scenario_versions",
    ]);
  });

  it("is idempotent — applying schema twice does not throw", () => {
    const db = createMemoryDatabase();
    applySchema(db);
    expect(() => applySchema(db)).not.toThrow();
  });
});

/* ------------------------------------------------------------------ */
/*  SavedScenarioRepository tests                                      */
/* ------------------------------------------------------------------ */

describe("SavedScenarioRepository", () => {
  let db: LoanScopeDB;
  let repo: SavedScenarioRepository;

  beforeEach(() => {
    db = createMemoryDatabase();
    applySchema(db);
    repo = createScenarioRepository(db);
  });

  it("creates and retrieves a scenario by ID", () => {
    const record = repo.create({
      scenarioId: "scen_001",
      name: "Q1 Jumbo Evaluation",
      description: "Evaluating jumbo products for Q1",
      configPayload: SCENARIO_CONFIG,
    });

    expect(record.scenarioId).toBe("scen_001");
    expect(record.name).toBe("Q1 Jumbo Evaluation");
    expect(record.description).toBe("Evaluating jumbo products for Q1");
    expect(record.configPayload).toEqual(SCENARIO_CONFIG);
    expect(record.resultPayload).toBeNull();
    expect(record.createdAt).toBeTruthy();
    expect(record.updatedAt).toBeTruthy();
    expect(typeof record.id).toBe("number");

    const found = repo.findById("scen_001");
    expect(found).toBeDefined();
    expect(found?.scenarioId).toBe("scen_001");
    expect(found?.configPayload).toEqual(SCENARIO_CONFIG);
  });

  it("creates a scenario without description", () => {
    const record = repo.create({
      scenarioId: "scen_no_desc",
      name: "No Description",
      configPayload: { minimal: true },
    });
    expect(record.description).toBeNull();
  });

  it("returns undefined for a non-existent scenario", () => {
    expect(repo.findById("nonexistent")).toBeUndefined();
  });

  it("lists all saved scenarios", () => {
    repo.create({
      scenarioId: "scen_a",
      name: "Scenario A",
      configPayload: { a: 1 },
    });
    repo.create({
      scenarioId: "scen_b",
      name: "Scenario B",
      configPayload: { b: 2 },
    });

    const all = repo.findAll();
    expect(all).toHaveLength(2);
  });

  it("updates the result payload", () => {
    repo.create({
      scenarioId: "scen_result",
      name: "Result Test",
      configPayload: SCENARIO_CONFIG,
    });

    repo.updateResult("scen_result", SCENARIO_RESULT);

    const found = repo.findById("scen_result");
    expect(found?.resultPayload).toEqual(SCENARIO_RESULT);
  });

  it("updates the scenario name", () => {
    repo.create({
      scenarioId: "scen_rename",
      name: "Old Name",
      configPayload: { x: 1 },
    });

    repo.updateName("scen_rename", "New Name");

    const found = repo.findById("scen_rename");
    expect(found?.name).toBe("New Name");
  });

  it("deletes a scenario", () => {
    repo.create({
      scenarioId: "scen_doomed",
      name: "Doomed",
      configPayload: {},
    });
    expect(repo.findById("scen_doomed")).toBeDefined();

    repo.delete("scen_doomed");
    expect(repo.findById("scen_doomed")).toBeUndefined();
  });

  it("throws on duplicate scenario ID", () => {
    repo.create({
      scenarioId: "scen_dup",
      name: "First",
      configPayload: {},
    });
    expect(() =>
      repo.create({
        scenarioId: "scen_dup",
        name: "Second",
        configPayload: {},
      }),
    ).toThrow();
  });

  it("round-trips complex nested JSON payloads", () => {
    const complex = {
      nested: {
        deeply: {
          values: [1, 2, 3],
          map: { a: true, b: null, c: "hello" },
        },
      },
      array: [{ x: 1 }, { x: 2 }],
      unicode: "\u00e9\u00e0\u00fc\u00f1",
      numeric: 3.14159265358979,
    };

    repo.create({
      scenarioId: "scen_complex",
      name: "Complex Payload",
      configPayload: complex,
    });

    const found = repo.findById("scen_complex");
    expect(found?.configPayload).toEqual(complex);
  });
});

/* ------------------------------------------------------------------ */
/*  SavedComparisonRepository tests                                    */
/* ------------------------------------------------------------------ */

describe("SavedComparisonRepository", () => {
  let db: LoanScopeDB;
  let scenarioRepo: SavedScenarioRepository;
  let repo: SavedComparisonRepository;

  beforeEach(() => {
    db = createMemoryDatabase();
    applySchema(db);
    scenarioRepo = createScenarioRepository(db);
    repo = createComparisonRepository(db);
  });

  it("creates and retrieves a comparison by ID", () => {
    const record = repo.create({
      comparisonId: "cmp_001",
      name: "LTV Sweep Comparison",
      configPayload: COMPARISON_CONFIG,
    });

    expect(record.comparisonId).toBe("cmp_001");
    expect(record.name).toBe("LTV Sweep Comparison");
    expect(record.scenarioId).toBeNull();
    expect(record.configPayload).toEqual(COMPARISON_CONFIG);
    expect(record.resultPayload).toBeNull();
    expect(record.createdAt).toBeTruthy();

    const found = repo.findById("cmp_001");
    expect(found).toBeDefined();
    expect(found?.configPayload).toEqual(COMPARISON_CONFIG);
  });

  it("creates a comparison linked to a scenario", () => {
    scenarioRepo.create({
      scenarioId: "scen_base",
      name: "Base Scenario",
      configPayload: SCENARIO_CONFIG,
    });

    const record = repo.create({
      comparisonId: "cmp_linked",
      name: "Linked Comparison",
      scenarioId: "scen_base",
      configPayload: COMPARISON_CONFIG,
    });

    expect(record.scenarioId).toBe("scen_base");
  });

  it("returns undefined for a non-existent comparison", () => {
    expect(repo.findById("nonexistent")).toBeUndefined();
  });

  it("lists all saved comparisons", () => {
    repo.create({
      comparisonId: "cmp_a",
      name: "Comparison A",
      configPayload: { a: 1 },
    });
    repo.create({
      comparisonId: "cmp_b",
      name: "Comparison B",
      configPayload: { b: 2 },
    });

    expect(repo.findAll()).toHaveLength(2);
  });

  it("updates the result payload", () => {
    repo.create({
      comparisonId: "cmp_result",
      name: "Result Test",
      configPayload: COMPARISON_CONFIG,
    });

    repo.updateResult("cmp_result", COMPARISON_RESULT);

    const found = repo.findById("cmp_result");
    expect(found?.resultPayload).toEqual(COMPARISON_RESULT);
  });

  it("updates the comparison name", () => {
    repo.create({
      comparisonId: "cmp_rename",
      name: "Old Name",
      configPayload: {},
    });

    repo.updateName("cmp_rename", "New Name");
    expect(repo.findById("cmp_rename")?.name).toBe("New Name");
  });

  it("deletes a comparison", () => {
    repo.create({
      comparisonId: "cmp_doomed",
      name: "Doomed",
      configPayload: {},
    });
    expect(repo.findById("cmp_doomed")).toBeDefined();

    repo.delete("cmp_doomed");
    expect(repo.findById("cmp_doomed")).toBeUndefined();
  });

  it("throws on duplicate comparison ID", () => {
    repo.create({
      comparisonId: "cmp_dup",
      name: "First",
      configPayload: {},
    });
    expect(() =>
      repo.create({
        comparisonId: "cmp_dup",
        name: "Second",
        configPayload: {},
      }),
    ).toThrow();
  });

  it("rejects comparison with non-existent scenarioId (FK constraint)", () => {
    expect(() =>
      repo.create({
        comparisonId: "cmp_bad_fk",
        name: "Bad FK",
        scenarioId: "nonexistent_scenario",
        configPayload: {},
      }),
    ).toThrow();
  });

  it("round-trips complex nested JSON payloads", () => {
    const complex = {
      grid: [
        { ltv: 0.75, products: [{ id: "p1", rate: 6.0, adjustments: [] }] },
        {
          ltv: 0.8,
          products: [{ id: "p1", rate: 6.125, adjustments: [0.125] }],
        },
      ],
      metadata: { generatedAt: "2024-01-15T10:30:00Z", version: 2 },
    };

    repo.create({
      comparisonId: "cmp_complex",
      name: "Complex",
      configPayload: complex,
    });

    expect(repo.findById("cmp_complex")?.configPayload).toEqual(complex);
  });
});

/* ------------------------------------------------------------------ */
/*  SavedSimulationRepository tests                                    */
/* ------------------------------------------------------------------ */

describe("SavedSimulationRepository", () => {
  let db: LoanScopeDB;
  let scenarioRepo: SavedScenarioRepository;
  let repo: SavedSimulationRepository;

  beforeEach(() => {
    db = createMemoryDatabase();
    applySchema(db);
    scenarioRepo = createScenarioRepository(db);
    repo = createSimulationRepository(db);
  });

  it("creates and retrieves a simulation by ID", () => {
    const record = repo.create({
      simulationId: "sim_001",
      name: "Monte Carlo Stress Test",
      configPayload: SIMULATION_CONFIG,
    });

    expect(record.simulationId).toBe("sim_001");
    expect(record.name).toBe("Monte Carlo Stress Test");
    expect(record.scenarioId).toBeNull();
    expect(record.configPayload).toEqual(SIMULATION_CONFIG);
    expect(record.resultPayload).toBeNull();
    expect(record.createdAt).toBeTruthy();

    const found = repo.findById("sim_001");
    expect(found).toBeDefined();
    expect(found?.configPayload).toEqual(SIMULATION_CONFIG);
  });

  it("creates a simulation linked to a scenario", () => {
    scenarioRepo.create({
      scenarioId: "scen_base",
      name: "Base Scenario",
      configPayload: SCENARIO_CONFIG,
    });

    const record = repo.create({
      simulationId: "sim_linked",
      name: "Linked Simulation",
      scenarioId: "scen_base",
      configPayload: SIMULATION_CONFIG,
    });

    expect(record.scenarioId).toBe("scen_base");
  });

  it("returns undefined for a non-existent simulation", () => {
    expect(repo.findById("nonexistent")).toBeUndefined();
  });

  it("lists all saved simulations", () => {
    repo.create({
      simulationId: "sim_a",
      name: "Simulation A",
      configPayload: { a: 1 },
    });
    repo.create({
      simulationId: "sim_b",
      name: "Simulation B",
      configPayload: { b: 2 },
    });

    expect(repo.findAll()).toHaveLength(2);
  });

  it("updates the result payload", () => {
    repo.create({
      simulationId: "sim_result",
      name: "Result Test",
      configPayload: SIMULATION_CONFIG,
    });

    repo.updateResult("sim_result", SIMULATION_RESULT);

    const found = repo.findById("sim_result");
    expect(found?.resultPayload).toEqual(SIMULATION_RESULT);
  });

  it("updates the simulation name", () => {
    repo.create({
      simulationId: "sim_rename",
      name: "Old Name",
      configPayload: {},
    });

    repo.updateName("sim_rename", "New Name");
    expect(repo.findById("sim_rename")?.name).toBe("New Name");
  });

  it("deletes a simulation", () => {
    repo.create({
      simulationId: "sim_doomed",
      name: "Doomed",
      configPayload: {},
    });
    expect(repo.findById("sim_doomed")).toBeDefined();

    repo.delete("sim_doomed");
    expect(repo.findById("sim_doomed")).toBeUndefined();
  });

  it("throws on duplicate simulation ID", () => {
    repo.create({
      simulationId: "sim_dup",
      name: "First",
      configPayload: {},
    });
    expect(() =>
      repo.create({
        simulationId: "sim_dup",
        name: "Second",
        configPayload: {},
      }),
    ).toThrow();
  });

  it("rejects simulation with non-existent scenarioId (FK constraint)", () => {
    expect(() =>
      repo.create({
        simulationId: "sim_bad_fk",
        name: "Bad FK",
        scenarioId: "nonexistent_scenario",
        configPayload: {},
      }),
    ).toThrow();
  });

  it("round-trips complex nested JSON payloads", () => {
    const complex = {
      summary: {
        percentiles: {
          p5: 80000,
          p25: 110000,
          p50: 125000,
          p75: 160000,
          p95: 210000,
        },
        distributions: [
          [0.1, 0.2, 0.3],
          [0.4, 0.5, 0.6],
        ],
      },
      metadata: { seed: 42, iterations: 10000 },
    };

    repo.create({
      simulationId: "sim_complex",
      name: "Complex",
      configPayload: complex,
    });

    expect(repo.findById("sim_complex")?.configPayload).toEqual(complex);
  });
});

/* ------------------------------------------------------------------ */
/*  Cross-repository / isolation tests                                 */
/* ------------------------------------------------------------------ */

describe("saved session database isolation", () => {
  it("separate in-memory databases do not share saved session state", () => {
    const db1 = createMemoryDatabase();
    const db2 = createMemoryDatabase();
    applySchema(db1);
    applySchema(db2);

    const repo1 = createScenarioRepository(db1);
    const repo2 = createScenarioRepository(db2);

    repo1.create({
      scenarioId: "isolated",
      name: "Isolated Scenario",
      configPayload: {},
    });

    expect(repo1.findAll()).toHaveLength(1);
    expect(repo2.findAll()).toHaveLength(0);
  });

  it("isolation applies to comparisons and simulations too", () => {
    const db1 = createMemoryDatabase();
    const db2 = createMemoryDatabase();
    applySchema(db1);
    applySchema(db2);

    const cmpRepo1 = createComparisonRepository(db1);
    const cmpRepo2 = createComparisonRepository(db2);
    const simRepo1 = createSimulationRepository(db1);
    const simRepo2 = createSimulationRepository(db2);

    cmpRepo1.create({
      comparisonId: "cmp_iso",
      name: "Isolated",
      configPayload: {},
    });
    simRepo1.create({
      simulationId: "sim_iso",
      name: "Isolated",
      configPayload: {},
    });

    expect(cmpRepo1.findAll()).toHaveLength(1);
    expect(cmpRepo2.findAll()).toHaveLength(0);
    expect(simRepo1.findAll()).toHaveLength(1);
    expect(simRepo2.findAll()).toHaveLength(0);
  });
});
