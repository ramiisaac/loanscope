import { describe, it, expect, beforeEach } from "vitest";
import { createMemoryDatabase } from "../connection";
import type { LoanScopeDB } from "../connection";
import { applySchema } from "../migrate";
import { createLenderRepository } from "../repositories/lender-repository";
import { createCatalogRepository } from "../repositories/catalog-repository";
import { createScenarioRepository } from "../repositories/scenario-repository";
import { createImportRunRepository } from "../repositories/import-run-repository";
import { createAuditSessionRepository } from "../repositories/audit-session-repository";
import type { LenderRepository } from "../repositories/lender-repository";
import type { CatalogRepository } from "../repositories/catalog-repository";
import type { ImportRunRepository } from "../repositories/import-run-repository";
import type { AuditSessionRepository } from "../repositories/audit-session-repository";
import type { SavedScenarioRepository } from "../repositories/scenario-repository";
import type { ProductDefinition } from "@loanscope/domain";
import {
  AmortizationTerm,
  AmortizationType,
  Channel,
  LoanType,
  ProgramKind,
  ratio,
} from "@loanscope/domain";

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

/* ------------------------------------------------------------------ */
/*  ImportRunRepository tests                                          */
/* ------------------------------------------------------------------ */

describe("ImportRunRepository", () => {
  let db: LoanScopeDB;
  let lenderRepo: LenderRepository;
  let catalogRepo: CatalogRepository;
  let repo: ImportRunRepository;

  beforeEach(() => {
    db = createMemoryDatabase();
    applySchema(db);
    lenderRepo = createLenderRepository(db);
    catalogRepo = createCatalogRepository(db);
    repo = createImportRunRepository(db);
    lenderRepo.create({ id: "uwm", name: "UWM", sourceKind: "builtin" });
  });

  it("creates and retrieves an import run by ID", () => {
    const record = repo.create({
      runId: "run_001",
      lenderId: "uwm",
      sourceFile: "/data/uwm-products.yaml",
      sourceFormat: "yaml",
      contentHash: "abc123def456",
    });

    expect(record.runId).toBe("run_001");
    expect(record.lenderId).toBe("uwm");
    expect(record.sourceFile).toBe("/data/uwm-products.yaml");
    expect(record.sourceFormat).toBe("yaml");
    expect(record.contentHash).toBe("abc123def456");
    expect(record.status).toBe("pending");
    expect(record.productsImported).toBe(0);
    expect(record.productsFailed).toBe(0);
    expect(record.errorLog).toBeNull();
    expect(record.catalogVersionId).toBeNull();
    expect(record.startedAt).toBeTruthy();
    expect(record.completedAt).toBeNull();
    expect(typeof record.id).toBe("number");

    const found = repo.findById("run_001");
    expect(found).toBeDefined();
    expect(found?.runId).toBe("run_001");
    expect(found?.lenderId).toBe("uwm");
  });

  it("findByLender filters correctly", () => {
    lenderRepo.create({ id: "chase", name: "Chase", sourceKind: "imported" });

    repo.create({
      runId: "run_uwm_1",
      lenderId: "uwm",
      sourceFile: "uwm1.json",
      sourceFormat: "json",
      contentHash: "hash1",
    });
    repo.create({
      runId: "run_uwm_2",
      lenderId: "uwm",
      sourceFile: "uwm2.yaml",
      sourceFormat: "yaml",
      contentHash: "hash2",
    });
    repo.create({
      runId: "run_chase_1",
      lenderId: "chase",
      sourceFile: "chase1.csv",
      sourceFormat: "csv",
      contentHash: "hash3",
    });

    const uwmRuns = repo.findByLender("uwm");
    expect(uwmRuns).toHaveLength(2);
    expect(uwmRuns.every((r) => r.lenderId === "uwm")).toBe(true);

    const chaseRuns = repo.findByLender("chase");
    expect(chaseRuns).toHaveLength(1);
    expect(chaseRuns[0]?.lenderId).toBe("chase");
  });

  it("findAll returns all runs", () => {
    repo.create({
      runId: "run_a",
      lenderId: "uwm",
      sourceFile: "a.json",
      sourceFormat: "json",
      contentHash: "ha",
    });
    repo.create({
      runId: "run_b",
      lenderId: "uwm",
      sourceFile: "b.yaml",
      sourceFormat: "yaml",
      contentHash: "hb",
    });

    expect(repo.findAll()).toHaveLength(2);
  });

  it("markSuccess updates status, productsImported, catalogVersionId, and completedAt", () => {
    // Create a catalog version so the FK is satisfied
    const catalogVersion = catalogRepo.importCatalog({
      lenderId: "uwm",
      version: 1,
      products: [PRODUCT_A],
      contentHash: "catalog_hash",
    });

    repo.create({
      runId: "run_s",
      lenderId: "uwm",
      sourceFile: "s.json",
      sourceFormat: "json",
      contentHash: "hs",
    });

    repo.markSuccess("run_s", 42, catalogVersion.id);

    const found = repo.findById("run_s");
    expect(found).toBeDefined();
    expect(found?.status).toBe("success");
    expect(found?.productsImported).toBe(42);
    expect(found?.catalogVersionId).toBe(catalogVersion.id);
    expect(found?.completedAt).toBeTruthy();
  });

  it("markFailed updates status, productsFailed, errorLog, and completedAt", () => {
    repo.create({
      runId: "run_f",
      lenderId: "uwm",
      sourceFile: "f.json",
      sourceFormat: "json",
      contentHash: "hf",
    });

    const errors = ["Invalid product schema at index 0", "Missing field 'name' at index 3"];
    repo.markFailed("run_f", 2, errors);

    const found = repo.findById("run_f");
    expect(found).toBeDefined();
    expect(found?.status).toBe("failed");
    expect(found?.productsFailed).toBe(2);
    expect(found?.errorLog).toEqual(errors);
    expect(Array.isArray(found?.errorLog)).toBe(true);
    expect(found?.completedAt).toBeTruthy();
  });

  it("markPartial updates both counts and errorLog", () => {
    repo.create({
      runId: "run_p",
      lenderId: "uwm",
      sourceFile: "p.csv",
      sourceFormat: "csv",
      contentHash: "hp",
    });

    const errors = ["Row 5: invalid rate format"];
    repo.markPartial("run_p", 10, 1, errors);

    const found = repo.findById("run_p");
    expect(found).toBeDefined();
    expect(found?.status).toBe("partial");
    expect(found?.productsImported).toBe(10);
    expect(found?.productsFailed).toBe(1);
    expect(found?.errorLog).toEqual(errors);
    expect(found?.completedAt).toBeTruthy();
  });

  it("rejects duplicate runId (UNIQUE constraint)", () => {
    repo.create({
      runId: "run_dup",
      lenderId: "uwm",
      sourceFile: "dup.json",
      sourceFormat: "json",
      contentHash: "hd",
    });
    expect(() =>
      repo.create({
        runId: "run_dup",
        lenderId: "uwm",
        sourceFile: "dup2.json",
        sourceFormat: "json",
        contentHash: "hd2",
      }),
    ).toThrow();
  });

  it("rejects import run for non-existent lender (FK constraint)", () => {
    expect(() =>
      repo.create({
        runId: "run_bad_fk",
        lenderId: "nonexistent",
        sourceFile: "bad.json",
        sourceFormat: "json",
        contentHash: "hbad",
      }),
    ).toThrow();
  });

  it("returns undefined for a non-existent run", () => {
    expect(repo.findById("nonexistent")).toBeUndefined();
  });
});

/* ------------------------------------------------------------------ */
/*  AuditSessionRepository tests                                       */
/* ------------------------------------------------------------------ */

describe("AuditSessionRepository", () => {
  let db: LoanScopeDB;
  let repo: AuditSessionRepository;
  let scenarioRepo: SavedScenarioRepository;

  beforeEach(() => {
    db = createMemoryDatabase();
    applySchema(db);
    repo = createAuditSessionRepository(db);
    scenarioRepo = createScenarioRepository(db);
  });

  it("creates and retrieves an audit session by ID", () => {
    const record = repo.create({
      sessionId: "sess_001",
      command: "evaluate",
      argsPayload: { loan: 1000000, price: 1250000, fico: 740 },
    });

    expect(record.sessionId).toBe("sess_001");
    expect(record.command).toBe("evaluate");
    expect(record.argsPayload).toEqual({
      loan: 1000000,
      price: 1250000,
      fico: 740,
    });
    expect(record.scenarioId).toBeNull();
    expect(record.resultSummary).toBeNull();
    expect(record.exitStatus).toBe("running");
    expect(record.startedAt).toBeTruthy();
    expect(record.completedAt).toBeNull();
    expect(typeof record.id).toBe("number");

    const found = repo.findById("sess_001");
    expect(found).toBeDefined();
    expect(found?.sessionId).toBe("sess_001");
    expect(found?.argsPayload).toEqual({
      loan: 1000000,
      price: 1250000,
      fico: 740,
    });
  });

  it("findAll returns all sessions", () => {
    repo.create({
      sessionId: "sess_a",
      command: "evaluate",
      argsPayload: {},
    });
    repo.create({
      sessionId: "sess_b",
      command: "compare",
      argsPayload: {},
    });

    expect(repo.findAll()).toHaveLength(2);
  });

  it("findByCommand filters correctly", () => {
    repo.create({
      sessionId: "sess_ev1",
      command: "evaluate",
      argsPayload: {},
    });
    repo.create({
      sessionId: "sess_ev2",
      command: "evaluate",
      argsPayload: {},
    });
    repo.create({
      sessionId: "sess_cmp1",
      command: "compare",
      argsPayload: {},
    });
    repo.create({
      sessionId: "sess_sim1",
      command: "simulate",
      argsPayload: {},
    });

    const evaluates = repo.findByCommand("evaluate");
    expect(evaluates).toHaveLength(2);
    expect(evaluates.every((s) => s.command === "evaluate")).toBe(true);

    const compares = repo.findByCommand("compare");
    expect(compares).toHaveLength(1);

    const simulates = repo.findByCommand("simulate");
    expect(simulates).toHaveLength(1);
  });

  it("markSuccess updates exitStatus and completedAt, with optional resultSummary", () => {
    repo.create({
      sessionId: "sess_success",
      command: "evaluate",
      argsPayload: { loan: 500000 },
    });

    const summary = { eligible: true, productCount: 3 };
    repo.markSuccess("sess_success", summary);

    const found = repo.findById("sess_success");
    expect(found).toBeDefined();
    expect(found?.exitStatus).toBe("success");
    expect(found?.resultSummary).toEqual(summary);
    expect(found?.completedAt).toBeTruthy();
  });

  it("markSuccess without resultSummary sets it to null", () => {
    repo.create({
      sessionId: "sess_no_summary",
      command: "quote",
      argsPayload: {},
    });

    repo.markSuccess("sess_no_summary");

    const found = repo.findById("sess_no_summary");
    expect(found?.exitStatus).toBe("success");
    expect(found?.resultSummary).toBeNull();
    expect(found?.completedAt).toBeTruthy();
  });

  it("markError updates exitStatus and completedAt", () => {
    repo.create({
      sessionId: "sess_error",
      command: "evaluate",
      argsPayload: { loan: -1 },
    });

    const errorSummary = { error: "Invalid loan amount" };
    repo.markError("sess_error", errorSummary);

    const found = repo.findById("sess_error");
    expect(found).toBeDefined();
    expect(found?.exitStatus).toBe("error");
    expect(found?.resultSummary).toEqual(errorSummary);
    expect(found?.completedAt).toBeTruthy();
  });

  it("round-trips complex nested argsPayload JSON", () => {
    const complexArgs = {
      transaction: {
        loanAmount: 1000000,
        propertyValue: 1250000,
        borrower: {
          fico: 740,
          reserves: [
            { type: "checking", amount: 50000 },
            { type: "retirement", amount: 200000 },
          ],
        },
      },
      options: {
        products: ["uwm_jumbo_pink", "uwm_conv_30"],
        sweep: { ltv: { min: 0.75, max: 0.95, step: 0.05 } },
      },
      flags: { verbose: true, format: "json" },
    };

    repo.create({
      sessionId: "sess_complex",
      command: "compare",
      argsPayload: complexArgs,
    });

    const found = repo.findById("sess_complex");
    expect(found?.argsPayload).toEqual(complexArgs);
  });

  it("round-trips resultSummary JSON", () => {
    repo.create({
      sessionId: "sess_result_rt",
      command: "simulate",
      argsPayload: {},
    });

    const result = {
      summary: {
        medianEquity: 125000,
        percentiles: { p5: 80000, p95: 210000 },
      },
      histogram: [
        { bucket: 50000, count: 120 },
        { bucket: 100000, count: 3500 },
      ],
    };

    repo.markSuccess("sess_result_rt", result);

    const found = repo.findById("sess_result_rt");
    expect(found?.resultSummary).toEqual(result);
  });

  it("rejects duplicate sessionId (UNIQUE constraint)", () => {
    repo.create({
      sessionId: "sess_dup",
      command: "evaluate",
      argsPayload: {},
    });
    expect(() =>
      repo.create({
        sessionId: "sess_dup",
        command: "compare",
        argsPayload: {},
      }),
    ).toThrow();
  });

  it("creates session with optional scenarioId FK", () => {
    // Create a scenario so the FK is satisfied
    scenarioRepo.create({
      scenarioId: "scen_linked",
      name: "Linked Scenario",
      configPayload: { loan: 500000 },
    });

    const record = repo.create({
      sessionId: "sess_with_scen",
      command: "evaluate",
      argsPayload: {},
      scenarioId: "scen_linked",
    });

    expect(record.scenarioId).toBe("scen_linked");
  });

  it("creates session without scenarioId", () => {
    const record = repo.create({
      sessionId: "sess_no_scen",
      command: "quote",
      argsPayload: {},
    });

    expect(record.scenarioId).toBeNull();
  });

  it("rejects session with non-existent scenarioId (FK constraint)", () => {
    expect(() =>
      repo.create({
        sessionId: "sess_bad_fk",
        command: "evaluate",
        argsPayload: {},
        scenarioId: "nonexistent_scenario",
      }),
    ).toThrow();
  });

  it("returns undefined for a non-existent session", () => {
    expect(repo.findById("nonexistent")).toBeUndefined();
  });
});
