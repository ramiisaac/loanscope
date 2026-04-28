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
import { createMemoryDatabase } from "../connection";
import type { LoanScopeDB } from "../connection";
import { applySchema } from "../migrate";
import {
  auditSessions,
  catalogVersions,
  customProductSets,
  importRuns,
  lenderPresets,
  lenders,
  savedComparisons,
  savedScenarios,
  savedSimulations,
} from "../schema";
import { createLenderRepository } from "../repositories/lender-repository";
import { createCatalogRepository } from "../repositories/catalog-repository";
import { createPresetRepository } from "../repositories/preset-repository";
import { createCustomProductSetRepository } from "../repositories/custom-product-set-repository";
import { createScenarioRepository } from "../repositories/scenario-repository";
import { createComparisonRepository } from "../repositories/comparison-repository";
import { createSimulationRepository } from "../repositories/simulation-repository";
import { createImportRunRepository } from "../repositories/import-run-repository";
import { createAuditSessionRepository } from "../repositories/audit-session-repository";
import { toLenderRecord } from "../mappers/lender-mapper";
import { parseProductPayload, toCatalogVersionRecord } from "../mappers/catalog-mapper";
import {
  parsePresetProductIds,
  serializePresetProductIds,
  toPresetRecord,
} from "../mappers/preset-mapper";
import {
  parseCustomProductSetPayload,
  serializeCustomProductSetPayload,
  toCustomProductSetRecord,
} from "../mappers/custom-product-set-mapper";
import { toSavedScenarioRecord } from "../mappers/scenario-mapper";
import { toSavedComparisonRecord } from "../mappers/comparison-mapper";
import { toSavedSimulationRecord } from "../mappers/simulation-mapper";
import {
  parseImportRunErrorLog,
  serializeImportRunErrorLog,
  toImportRunRecord,
} from "../mappers/import-run-mapper";
import { toAuditSessionRecord } from "../mappers/audit-session-mapper";

/* ------------------------------------------------------------------ */
/*  Shared fixtures                                                    */
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

const setupDb = (): LoanScopeDB => {
  const db = createMemoryDatabase();
  applySchema(db);
  return db;
};

/* ------------------------------------------------------------------ */
/*  lender-mapper                                                      */
/* ------------------------------------------------------------------ */

describe("lender-mapper", () => {
  let db: LoanScopeDB;

  beforeEach(() => {
    db = setupDb();
  });

  it("round-trips a row through toLenderRecord via the repository", () => {
    const repo = createLenderRepository(db);
    const created = repo.create({
      id: "lender_a",
      name: "Lender A",
      sourceKind: "builtin",
    });
    expect(created.id).toBe("lender_a");
    expect(created.name).toBe("Lender A");
    expect(created.sourceKind).toBe("builtin");
    expect(created.active).toBe(true);
    expect(created.version).toBe(1);
    expect(typeof created.createdAt).toBe("string");
    expect(typeof created.updatedAt).toBe("string");
  });

  it("projects the raw row shape directly", () => {
    const now = new Date().toISOString();
    const row: typeof lenders.$inferSelect = {
      id: "lender_b",
      name: "Lender B",
      sourceKind: "imported",
      version: 3,
      active: false,
      createdAt: now,
      updatedAt: now,
    };
    const record = toLenderRecord(row);
    expect(record).toEqual(row);
    // Projection is total: every LenderRecord field is set from the row.
    expect(Object.keys(record).sort()).toEqual(
      ["id", "name", "sourceKind", "version", "active", "createdAt", "updatedAt"].sort(),
    );
  });
});

/* ------------------------------------------------------------------ */
/*  catalog-mapper                                                     */
/* ------------------------------------------------------------------ */

describe("catalog-mapper", () => {
  let db: LoanScopeDB;

  beforeEach(() => {
    db = setupDb();
  });

  it("round-trips a catalog version row through toCatalogVersionRecord", () => {
    const lenderRepo = createLenderRepository(db);
    const catalogRepo = createCatalogRepository(db);
    lenderRepo.create({ id: "uwm", name: "UWM", sourceKind: "builtin" });
    const record = catalogRepo.importCatalog({
      lenderId: "uwm",
      version: 1,
      products: [makeProduct("p1", "Product 1")],
      sourceFile: "catalog.yaml",
      contentHash: "abc123",
    });
    expect(record.lenderId).toBe("uwm");
    expect(record.version).toBe(1);
    expect(record.sourceFile).toBe("catalog.yaml");
    expect(record.contentHash).toBe("abc123");
    expect(typeof record.importedAt).toBe("string");

    const fetched = catalogRepo.getLatestVersion("uwm");
    expect(fetched).toEqual(record);
  });

  it("preserves null sourceFile when none is provided", () => {
    const row: typeof catalogVersions.$inferSelect = {
      id: 7,
      lenderId: "uwm",
      version: 2,
      payloadVersion: 1,
      sourceFile: null,
      contentHash: "hash",
      importedAt: "2024-01-01T00:00:00.000Z",
    };
    const record = toCatalogVersionRecord(row);
    expect(record.sourceFile).toBeNull();
    expect(record).toEqual(row);
  });

  it("round-trips a ProductDefinition through parseProductPayload", () => {
    const product = makeProduct("p1", "Product 1");
    const serialized = JSON.stringify(product);
    const parsed = parseProductPayload(serialized);
    expect(parsed).toEqual(product);
  });

  it("getProducts returns products deserialized by parseProductPayload", () => {
    const lenderRepo = createLenderRepository(db);
    const catalogRepo = createCatalogRepository(db);
    lenderRepo.create({ id: "uwm", name: "UWM", sourceKind: "builtin" });
    const productA = makeProduct("p1", "Product 1");
    const productB = makeProduct("p2", "Product 2");
    const version = catalogRepo.importCatalog({
      lenderId: "uwm",
      version: 1,
      products: [productA, productB],
      contentHash: "h",
    });
    const products = catalogRepo.getProducts(version.id);
    expect(products).toHaveLength(2);
    expect(products.map((p) => p.id).sort()).toEqual(["p1", "p2"]);
    expect(products.find((p) => p.id === "p1")).toEqual(productA);
  });
});

/* ------------------------------------------------------------------ */
/*  preset-mapper                                                      */
/* ------------------------------------------------------------------ */

describe("preset-mapper", () => {
  let db: LoanScopeDB;

  beforeEach(() => {
    db = setupDb();
  });

  it("round-trips productIds through serialize/parse helpers", () => {
    const ids: readonly string[] = ["prod_a", "prod_b", "prod_c"];
    const serialized = serializePresetProductIds(ids);
    const parsed = parsePresetProductIds(serialized);
    expect(parsed).toEqual(ids);
  });

  it("round-trips an empty productIds array", () => {
    const serialized = serializePresetProductIds([]);
    const parsed = parsePresetProductIds(serialized);
    expect(parsed).toEqual([]);
  });

  it("toPresetRecord deserializes the productIds JSON column", () => {
    const row: typeof lenderPresets.$inferSelect = {
      id: 42,
      lenderId: "uwm",
      presetId: "preset_core",
      name: "Core",
      productIds: JSON.stringify(["a", "b"]),
    };
    const record = toPresetRecord(row);
    expect(record).toEqual({
      id: 42,
      lenderId: "uwm",
      presetId: "preset_core",
      name: "Core",
      productIds: ["a", "b"],
    });
  });

  it("round-trips a preset row through the repository", () => {
    const lenderRepo = createLenderRepository(db);
    const presetRepo = createPresetRepository(db);
    lenderRepo.create({ id: "uwm", name: "UWM", sourceKind: "builtin" });
    const created = presetRepo.create({
      lenderId: "uwm",
      presetId: "preset_core",
      name: "Core",
      productIds: ["prod_a", "prod_b"],
    });
    const fetched = presetRepo.findByPresetId("uwm", "preset_core");
    expect(fetched).toEqual(created);
    expect(fetched?.productIds).toEqual(["prod_a", "prod_b"]);
  });
});

/* ------------------------------------------------------------------ */
/*  custom-product-set-mapper                                          */
/* ------------------------------------------------------------------ */

describe("custom-product-set-mapper", () => {
  let db: LoanScopeDB;

  beforeEach(() => {
    db = setupDb();
  });

  it("round-trips product definitions through serialize/parse helpers", () => {
    const products = [makeProduct("p1", "P1"), makeProduct("p2", "P2")];
    const serialized = serializeCustomProductSetPayload(products);
    const parsed = parseCustomProductSetPayload(serialized);
    expect(parsed).toEqual(products);
  });

  it("toCustomProductSetRecord preserves null lenderId", () => {
    const products = [makeProduct("p1", "P1")];
    const now = "2024-06-01T12:00:00.000Z";
    const row: typeof customProductSets.$inferSelect = {
      id: 1,
      setId: "set_alpha",
      name: "Alpha",
      lenderId: null,
      payload: JSON.stringify(products),
      validationStatus: "unchecked",
      createdAt: now,
      updatedAt: now,
    };
    const record = toCustomProductSetRecord(row);
    expect(record.lenderId).toBeNull();
    expect(record.products).toEqual(products);
    expect(record.validationStatus).toBe("unchecked");
  });

  it("round-trips a custom product set through the repository", () => {
    const repo = createCustomProductSetRepository(db);
    const products = [makeProduct("p1", "P1"), makeProduct("p2", "P2")];
    const created = repo.create({
      setId: "set_alpha",
      name: "Alpha",
      products,
    });
    const fetched = repo.findBySetId("set_alpha");
    expect(fetched).toEqual(created);
    expect(fetched?.products).toEqual(products);
    expect(fetched?.lenderId).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/*  scenario-mapper                                                    */
/* ------------------------------------------------------------------ */

describe("scenario-mapper", () => {
  let db: LoanScopeDB;

  beforeEach(() => {
    db = setupDb();
  });

  it("round-trips a scenario row (no result) through the repository", () => {
    const repo = createScenarioRepository(db);
    const config = { quickQuote: { loan: 1000000, price: 1250000, fico: 740 } };
    const created = repo.create({
      scenarioId: "scn_001",
      name: "Jumbo Primary",
      description: "Primary jumbo scenario",
      configPayload: config,
    });
    expect(created.configPayload).toEqual(config);
    expect(created.resultPayload).toBeNull();
    expect(created.description).toBe("Primary jumbo scenario");

    const fetched = repo.findById("scn_001");
    expect(fetched).toEqual(created);
  });

  it("preserves null description and null resultPayload", () => {
    const now = "2024-06-01T12:00:00.000Z";
    const row: typeof savedScenarios.$inferSelect = {
      id: 1,
      scenarioId: "scn_002",
      name: "Bare",
      description: null,
      configPayload: JSON.stringify({ quickQuote: {} }),
      resultPayload: null,
      createdAt: now,
      updatedAt: now,
    };
    const record = toSavedScenarioRecord(row);
    expect(record.description).toBeNull();
    expect(record.resultPayload).toBeNull();
    expect(record.configPayload).toEqual({ quickQuote: {} });
  });

  it("deserializes resultPayload JSON when present", () => {
    const repo = createScenarioRepository(db);
    repo.create({
      scenarioId: "scn_003",
      name: "With result",
      configPayload: { a: 1 },
    });
    const result = { eligibleProducts: 3, bestRate: 7.25 };
    repo.updateResult("scn_003", result);
    const fetched = repo.findById("scn_003");
    expect(fetched?.resultPayload).toEqual(result);
  });
});

/* ------------------------------------------------------------------ */
/*  comparison-mapper                                                  */
/* ------------------------------------------------------------------ */

describe("comparison-mapper", () => {
  let db: LoanScopeDB;

  beforeEach(() => {
    db = setupDb();
  });

  it("round-trips a comparison row through the repository", () => {
    const scenarioRepo = createScenarioRepository(db);
    scenarioRepo.create({
      scenarioId: "scn_001",
      name: "Base",
      configPayload: { quickQuote: {} },
    });
    const repo = createComparisonRepository(db);
    const config = { sweep: { ltv: [0.75, 0.85, 0.95] } };
    const created = repo.create({
      comparisonId: "cmp_001",
      name: "LTV sweep",
      scenarioId: "scn_001",
      configPayload: config,
    });
    const fetched = repo.findById("cmp_001");
    expect(fetched).toEqual(created);
    expect(fetched?.scenarioId).toBe("scn_001");
    expect(fetched?.configPayload).toEqual(config);
  });

  it("preserves null scenarioId when no FK is set", () => {
    const now = "2024-06-01T12:00:00.000Z";
    const row: typeof savedComparisons.$inferSelect = {
      id: 1,
      comparisonId: "cmp_002",
      name: "Unlinked",
      scenarioId: null,
      configPayload: JSON.stringify({ sweep: {} }),
      resultPayload: null,
      createdAt: now,
      updatedAt: now,
    };
    const record = toSavedComparisonRecord(row);
    expect(record.scenarioId).toBeNull();
    expect(record.resultPayload).toBeNull();
    expect(record.configPayload).toEqual({ sweep: {} });
  });

  it("deserializes resultPayload JSON when present", () => {
    const repo = createComparisonRepository(db);
    repo.create({
      comparisonId: "cmp_003",
      name: "With result",
      configPayload: { sweep: {} },
    });
    const result = { rows: [{ ltv: 0.75, payment: 5000 }] };
    repo.updateResult("cmp_003", result);
    const fetched = repo.findById("cmp_003");
    expect(fetched?.resultPayload).toEqual(result);
  });
});

/* ------------------------------------------------------------------ */
/*  simulation-mapper                                                  */
/* ------------------------------------------------------------------ */

describe("simulation-mapper", () => {
  let db: LoanScopeDB;

  beforeEach(() => {
    db = setupDb();
  });

  it("round-trips a simulation row through the repository", () => {
    const scenarioRepo = createScenarioRepository(db);
    scenarioRepo.create({
      scenarioId: "scn_001",
      name: "Base",
      configPayload: { quickQuote: {} },
    });
    const repo = createSimulationRepository(db);
    const config = { monteCarlo: { iterations: 1000 } };
    const created = repo.create({
      simulationId: "sim_001",
      name: "MC 1k",
      scenarioId: "scn_001",
      configPayload: config,
    });
    const fetched = repo.findById("sim_001");
    expect(fetched).toEqual(created);
    expect(fetched?.scenarioId).toBe("scn_001");
    expect(fetched?.configPayload).toEqual(config);
  });

  it("preserves null scenarioId when no FK is set", () => {
    const now = "2024-06-01T12:00:00.000Z";
    const row: typeof savedSimulations.$inferSelect = {
      id: 1,
      simulationId: "sim_002",
      name: "Unlinked",
      scenarioId: null,
      configPayload: JSON.stringify({ monteCarlo: {} }),
      resultPayload: null,
      createdAt: now,
      updatedAt: now,
    };
    const record = toSavedSimulationRecord(row);
    expect(record.scenarioId).toBeNull();
    expect(record.resultPayload).toBeNull();
    expect(record.configPayload).toEqual({ monteCarlo: {} });
  });

  it("deserializes resultPayload JSON when present", () => {
    const repo = createSimulationRepository(db);
    repo.create({
      simulationId: "sim_003",
      name: "With result",
      configPayload: { monteCarlo: {} },
    });
    const result = { samples: 1000, mean: 0.42 };
    repo.updateResult("sim_003", result);
    const fetched = repo.findById("sim_003");
    expect(fetched?.resultPayload).toEqual(result);
  });
});

/* ------------------------------------------------------------------ */
/*  import-run-mapper                                                  */
/* ------------------------------------------------------------------ */

describe("import-run-mapper", () => {
  let db: LoanScopeDB;

  beforeEach(() => {
    db = setupDb();
  });

  it("round-trips an errorLog through serialize/parse helpers", () => {
    const errors: readonly string[] = ["bad product 1", "bad product 2"];
    const serialized = serializeImportRunErrorLog(errors);
    const parsed = parseImportRunErrorLog(serialized);
    expect(parsed).toEqual(errors);
  });

  it("parseImportRunErrorLog returns null for a null input", () => {
    expect(parseImportRunErrorLog(null)).toBeNull();
  });

  it("toImportRunRecord projects a pending row with null errorLog", () => {
    const row: typeof importRuns.$inferSelect = {
      id: 1,
      runId: "run_001",
      lenderId: "uwm",
      sourceFile: "catalog.yaml",
      sourceFormat: "yaml",
      contentHash: "h",
      status: "pending",
      productsImported: 0,
      productsFailed: 0,
      errorLog: null,
      catalogVersionId: null,
      startedAt: "2024-06-01T12:00:00.000Z",
      completedAt: null,
    };
    const record = toImportRunRecord(row);
    expect(record.errorLog).toBeNull();
    expect(record.catalogVersionId).toBeNull();
    expect(record.completedAt).toBeNull();
    expect(record.status).toBe("pending");
  });

  it("round-trips an import run lifecycle through the repository", () => {
    const lenderRepo = createLenderRepository(db);
    const importRepo = createImportRunRepository(db);
    lenderRepo.create({ id: "uwm", name: "UWM", sourceKind: "imported" });
    const created = importRepo.create({
      runId: "run_001",
      lenderId: "uwm",
      sourceFile: "catalog.yaml",
      sourceFormat: "yaml",
      contentHash: "h",
    });
    expect(created.status).toBe("pending");
    expect(created.errorLog).toBeNull();

    importRepo.markFailed("run_001", 2, ["err1", "err2"]);
    const failed = importRepo.findById("run_001");
    expect(failed?.status).toBe("failed");
    expect(failed?.errorLog).toEqual(["err1", "err2"]);
    expect(failed?.productsFailed).toBe(2);
  });
});

/* ------------------------------------------------------------------ */
/*  audit-session-mapper                                               */
/* ------------------------------------------------------------------ */

describe("audit-session-mapper", () => {
  let db: LoanScopeDB;

  beforeEach(() => {
    db = setupDb();
  });

  it("round-trips an audit session row through the repository", () => {
    const scenarioRepo = createScenarioRepository(db);
    scenarioRepo.create({
      scenarioId: "scn_001",
      name: "Base",
      configPayload: { quickQuote: {} },
    });
    const repo = createAuditSessionRepository(db);
    const args = { command: "evaluate", flags: { config: "scn.yaml" } };
    const created = repo.create({
      sessionId: "aud_001",
      command: "evaluate",
      argsPayload: args,
      scenarioId: "scn_001",
    });
    expect(created.argsPayload).toEqual(args);
    expect(created.scenarioId).toBe("scn_001");
    expect(created.exitStatus).toBe("running");
    expect(created.resultSummary).toBeNull();
    expect(created.completedAt).toBeNull();

    const fetched = repo.findById("aud_001");
    expect(fetched).toEqual(created);
  });

  it("preserves null scenarioId and null resultSummary", () => {
    const row: typeof auditSessions.$inferSelect = {
      id: 1,
      sessionId: "aud_002",
      command: "compare",
      argsPayload: JSON.stringify({ any: "args" }),
      scenarioId: null,
      resultSummary: null,
      exitStatus: "running",
      startedAt: "2024-06-01T12:00:00.000Z",
      completedAt: null,
    };
    const record = toAuditSessionRecord(row);
    expect(record.scenarioId).toBeNull();
    expect(record.resultSummary).toBeNull();
    expect(record.argsPayload).toEqual({ any: "args" });
  });

  it("deserializes resultSummary JSON after markSuccess", () => {
    const repo = createAuditSessionRepository(db);
    repo.create({
      sessionId: "aud_003",
      command: "evaluate",
      argsPayload: { any: "args" },
    });
    const summary = { eligible: 5, elapsedMs: 42 };
    repo.markSuccess("aud_003", summary);
    const fetched = repo.findById("aud_003");
    expect(fetched?.exitStatus).toBe("success");
    expect(fetched?.resultSummary).toEqual(summary);
    expect(fetched?.completedAt).not.toBeNull();
  });
});
