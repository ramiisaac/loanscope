import { describe, expect, it } from "vitest";
import { DatabaseManager } from "@loanscope/db";
import { dumpYaml } from "@loanscope/config";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  importCatalogAction,
  listCatalogHistoryAction,
  listImportRunsAction,
  parseCatalogImportFormat,
  requireImportRun,
  showImportRunAction,
} from "../commands/import";
import { createLenderRepository } from "@loanscope/db";
import { CliValidationError } from "../cli-error";
// ---------------------------------------------------------------------------
// Command registration
// ---------------------------------------------------------------------------

describe("catalog import actions", () => {
  const fixedNow = new Date(Date.UTC(2026, 2, 15, 9, 30, 0));

  const seedTestLender = (manager: DatabaseManager, id = "uwm"): void => {
    // Insert a minimal active lender row without going through `seedLender`,
    // which enforces the lenders-package invariant that a lender must have
    // at least one product. The catalog import pipeline itself is the code
    // path that populates products, so we cannot rely on that invariant here.
    const repo = createLenderRepository(manager.db);
    repo.create({
      id,
      name: `${id.toUpperCase()} Test Lender`,
      sourceKind: "imported",
    });
  };

  const validProduct = (id: string, name: string): Record<string, unknown> => ({
    id,
    name,
    loanType: "Conventional",
    channel: "Agency",
    variants: [
      {
        programKind: "Fixed",
        amortization: {
          type: "FullyAmortizing",
          qualifyingPaymentPolicy: { kind: "NotePayment" },
        },
        terms: [360],
        constraints: {
          Primary: { maxLTVRatio: 0.95, minFico: 620 },
          Secondary: { maxLTVRatio: 0.9, minFico: 680 },
          Investment: { maxLTVRatio: 0.85, minFico: 700 },
        },
      },
    ],
  });

  const writeTempFile = (contents: string, extension: string): string => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "loanscope-import-"));
    const filePath = path.join(dir, `catalog${extension}`);
    fs.writeFileSync(filePath, contents, "utf8");
    return filePath;
  };

  const writeYamlFile = (payload: unknown): string => writeTempFile(dumpYaml(payload), ".yaml");

  const writeJsonFile = (payload: unknown): string =>
    writeTempFile(JSON.stringify(payload, null, 2), ".json");

  it("imports a YAML catalog and writes import_runs + catalog_versions atomically", () => {
    const manager = DatabaseManager.memory();
    seedTestLender(manager);
    const filePath = writeYamlFile({
      products: [validProduct("p_a", "Product A"), validProduct("p_b", "Product B")],
    });

    const result = importCatalogAction(manager, {
      lenderId: "uwm",
      filePath,
      now: fixedNow,
    });

    expect(result.status).toBe("success");
    expect(result.productsImported).toBe(2);
    expect(result.productsFailed).toBe(0);
    expect(result.version).toBe(1);
    expect(result.catalogVersionId).not.toBeNull();
    expect(result.errorLog).toEqual([]);

    const run = manager.importRuns.findById(result.runId);
    expect(run?.status).toBe("success");
    expect(run?.productsImported).toBe(2);
    expect(run?.catalogVersionId).toBe(result.catalogVersionId);
  });

  it("imports a JSON catalog path", () => {
    const manager = DatabaseManager.memory();
    seedTestLender(manager);
    const filePath = writeJsonFile({
      products: [validProduct("json_p", "JSON Product")],
    });

    const result = importCatalogAction(manager, {
      lenderId: "uwm",
      filePath,
      now: fixedNow,
    });

    expect(result.status).toBe("success");
    expect(result.sourceFormat).toBe("json");
    expect(result.productsImported).toBe(1);
  });

  it("rejects unsupported file extensions when --format is not set", () => {
    const manager = DatabaseManager.memory();
    seedTestLender(manager);
    const filePath = writeTempFile("products: []", ".txt");

    expect(() =>
      importCatalogAction(manager, {
        lenderId: "uwm",
        filePath,
        now: fixedNow,
      }),
    ).toThrow(CliValidationError);
    expect(() =>
      importCatalogAction(manager, {
        lenderId: "uwm",
        filePath,
        now: fixedNow,
      }),
    ).toThrow(/infer catalog import format/);
  });

  it("rejects imports for an unknown lender before opening a transaction", () => {
    const manager = DatabaseManager.memory();
    const filePath = writeYamlFile({
      products: [validProduct("p_a", "Product A")],
    });

    expect(() =>
      importCatalogAction(manager, {
        lenderId: "does_not_exist",
        filePath,
        now: fixedNow,
      }),
    ).toThrow(CliValidationError);
    expect(() =>
      importCatalogAction(manager, {
        lenderId: "does_not_exist",
        filePath,
        now: fixedNow,
      }),
    ).toThrow(/Unknown lender/);

    // Ensure no phantom pending run was created.
    expect(manager.importRuns.findAll()).toHaveLength(0);
  });

  it("marks the run failed and writes no catalog version when every product is invalid", () => {
    const manager = DatabaseManager.memory();
    seedTestLender(manager);
    const bad = validProduct("", "");
    (bad as { variants: unknown[] }).variants = [];
    const filePath = writeYamlFile({ products: [bad] });

    const result = importCatalogAction(manager, {
      lenderId: "uwm",
      filePath,
      now: fixedNow,
    });

    expect(result.status).toBe("failed");
    expect(result.productsImported).toBe(0);
    expect(result.productsFailed).toBe(1);
    expect(result.version).toBeNull();
    expect(result.catalogVersionId).toBeNull();
    expect(result.errorLog.length).toBeGreaterThan(0);

    const run = manager.importRuns.findById(result.runId);
    expect(run?.status).toBe("failed");
    expect(run?.catalogVersionId).toBeNull();

    // The catalog repo must have no rows for this lender.
    expect(listCatalogHistoryAction(manager, { lenderId: "uwm", output: "json" })).toBe("[]");
  });

  it("marks the run partial when some products are invalid and writes only the valid ones", () => {
    const manager = DatabaseManager.memory();
    seedTestLender(manager);
    const bad = validProduct("broken", "Broken");
    (bad as { channel: unknown }).channel = "Farm";
    const filePath = writeYamlFile({
      products: [validProduct("ok_a", "OK A"), bad, validProduct("ok_b", "OK B")],
    });

    const result = importCatalogAction(manager, {
      lenderId: "uwm",
      filePath,
      now: fixedNow,
    });

    expect(result.status).toBe("partial");
    expect(result.productsImported).toBe(2);
    expect(result.productsFailed).toBe(1);
    expect(result.version).toBe(1);
    expect(result.errorLog.some((e) => /"broken"/.test(e))).toBe(true);

    const run = manager.importRuns.findById(result.runId);
    expect(run?.status).toBe("partial");
    expect(run?.errorLog?.length).toBeGreaterThan(0);
  });

  it("increments the catalog version on successive imports for the same lender", () => {
    const manager = DatabaseManager.memory();
    seedTestLender(manager);
    const file1 = writeYamlFile({
      products: [validProduct("p_a", "Product A")],
    });
    const file2 = writeYamlFile({
      products: [validProduct("p_a", "Product A"), validProduct("p_b", "Product B")],
    });

    const r1 = importCatalogAction(manager, {
      lenderId: "uwm",
      filePath: file1,
      now: new Date(Date.UTC(2026, 2, 15, 9, 30, 0)),
    });
    const r2 = importCatalogAction(manager, {
      lenderId: "uwm",
      filePath: file2,
      now: new Date(Date.UTC(2026, 2, 15, 9, 30, 1)),
    });

    expect(r1.version).toBe(1);
    expect(r2.version).toBe(2);
    expect(r1.runId).not.toBe(r2.runId);

    const history = JSON.parse(
      listCatalogHistoryAction(manager, { lenderId: "uwm", output: "json" }),
    ) as Array<{ version: number; productCount: number }>;
    expect(history.map((h) => h.version)).toEqual([2, 1]);
    expect(history[0]?.productCount).toBe(2);
    expect(history[1]?.productCount).toBe(1);
  });

  it("produces a deterministic SHA-256 contentHash for identical file contents", () => {
    const manager = DatabaseManager.memory();
    seedTestLender(manager);
    const payload = {
      products: [validProduct("p_a", "Product A")],
    };
    const file1 = writeYamlFile(payload);
    const file2 = writeYamlFile(payload);

    const r1 = importCatalogAction(manager, {
      lenderId: "uwm",
      filePath: file1,
      now: new Date(Date.UTC(2026, 2, 15, 9, 30, 0)),
    });
    const r2 = importCatalogAction(manager, {
      lenderId: "uwm",
      filePath: file2,
      now: new Date(Date.UTC(2026, 2, 15, 9, 30, 1)),
    });

    expect(r1.contentHash).toBe(r2.contentHash);
    expect(r1.contentHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("rolls back the pending import_runs row when the transactional write throws", () => {
    // Rollback assertion: force a deterministic failure *inside* the
    // transaction body by colliding on `import_runs.run_id` (UNIQUE). Two
    // imports with the identical `now` produce the same `runId` via
    // `buildId`, so the second import enters the transaction, precheck
    // passes, and the first write — `importRuns.create` — trips the UNIQUE
    // constraint. Better-sqlite3 rolls back the transaction; no net-new
    // import_runs row and no stray `catalog_versions` row must remain.
    const manager = DatabaseManager.memory();
    seedTestLender(manager);
    const filePath = writeYamlFile({
      products: [validProduct("p_a", "Product A")],
    });
    const collisionNow = new Date(Date.UTC(2026, 2, 15, 9, 30, 0));

    const first = importCatalogAction(manager, {
      lenderId: "uwm",
      filePath,
      now: collisionNow,
    });
    expect(first.status).toBe("success");

    const runsBefore = manager.importRuns.findAll();
    const historyBefore = JSON.parse(
      listCatalogHistoryAction(manager, { lenderId: "uwm", output: "json" }),
    ) as Array<{ version: number }>;
    expect(runsBefore).toHaveLength(1);
    expect(historyBefore).toHaveLength(1);

    // Second import with the same `now` collides on UNIQUE(run_id).
    expect(() =>
      importCatalogAction(manager, {
        lenderId: "uwm",
        filePath,
        now: collisionNow,
      }),
    ).toThrow();

    // Invariants after rollback:
    //   1. No net-new import_runs row.
    //   2. No pending rows linger.
    //   3. Catalog history is unchanged (no orphan catalog_versions row).
    const runsAfter = manager.importRuns.findAll();
    expect(runsAfter).toHaveLength(runsBefore.length);
    expect(runsAfter.every((r) => r.status !== "pending")).toBe(true);

    const historyAfter = JSON.parse(
      listCatalogHistoryAction(manager, { lenderId: "uwm", output: "json" }),
    ) as Array<{ version: number }>;
    expect(historyAfter.map((h) => h.version)).toEqual(historyBefore.map((h) => h.version));
  });

  it("parseCatalogImportFormat accepts explicit yaml/json and rejects unsupported", () => {
    expect(parseCatalogImportFormat("yaml", "whatever.bin")).toBe("yaml");
    expect(parseCatalogImportFormat("json", "whatever.bin")).toBe("json");
    expect(parseCatalogImportFormat(undefined, "x.yml")).toBe("yaml");
    expect(parseCatalogImportFormat(undefined, "x.YAML")).toBe("yaml");
    expect(parseCatalogImportFormat(undefined, "x.json")).toBe("json");
    expect(() => parseCatalogImportFormat("csv", "x.csv")).toThrow(CliValidationError);
  });
});

describe("import run listing and catalog history", () => {
  const fixedNow = new Date(Date.UTC(2026, 2, 15, 9, 30, 0));

  const seedTestLender = (manager: DatabaseManager, id: string): void => {
    // See rationale in the sibling `catalog import actions` describe: we
    // bypass `seedLender` (which requires at least one product) because the
    // catalog import pipeline is itself the code path that populates
    // products.
    const repo = createLenderRepository(manager.db);
    repo.create({
      id,
      name: `${id.toUpperCase()} Test Lender`,
      sourceKind: "imported",
    });
  };

  const validProduct = (id: string, name: string): Record<string, unknown> => ({
    id,
    name,
    loanType: "Conventional",
    channel: "Agency",
    variants: [
      {
        programKind: "Fixed",
        amortization: {
          type: "FullyAmortizing",
          qualifyingPaymentPolicy: { kind: "NotePayment" },
        },
        terms: [360],
        constraints: {
          Primary: { maxLTVRatio: 0.95, minFico: 620 },
          Secondary: { maxLTVRatio: 0.9, minFico: 680 },
          Investment: { maxLTVRatio: 0.85, minFico: 700 },
        },
      },
    ],
  });

  const writeTempYaml = (payload: unknown): string => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "loanscope-import-"));
    const filePath = path.join(dir, "catalog.yaml");
    fs.writeFileSync(filePath, dumpYaml(payload), "utf8");
    return filePath;
  };

  const runImport = (manager: DatabaseManager, lenderId: string, when: Date): string => {
    const filePath = writeTempYaml({
      products: [validProduct(`p_${lenderId}`, `P ${lenderId}`)],
    });
    const res = importCatalogAction(manager, {
      lenderId,
      filePath,
      now: when,
    });
    return res.runId;
  };

  it("listImportRunsAction lists all runs in chronological order", () => {
    const manager = DatabaseManager.memory();
    seedTestLender(manager, "uwm");
    seedTestLender(manager, "agency");

    runImport(manager, "uwm", new Date(Date.UTC(2026, 2, 15, 9, 30, 0)));
    runImport(manager, "agency", new Date(Date.UTC(2026, 2, 15, 9, 30, 1)));

    const textOutput = listImportRunsAction(manager, { output: "text" });
    expect(textOutput).toContain("uwm");
    expect(textOutput).toContain("agency");
    expect(textOutput).toContain("[success]");

    const json = JSON.parse(listImportRunsAction(manager, { output: "json" })) as Array<{
      lenderId: string;
      status: string;
    }>;
    expect(json).toHaveLength(2);
    // Ascending by startedAt: uwm first, then agency.
    expect(json[0]?.lenderId).toBe("uwm");
    expect(json[1]?.lenderId).toBe("agency");
  });

  it("listImportRunsAction filters by lender when lenderId is supplied", () => {
    const manager = DatabaseManager.memory();
    seedTestLender(manager, "uwm");
    seedTestLender(manager, "agency");

    runImport(manager, "uwm", new Date(Date.UTC(2026, 2, 15, 9, 30, 0)));
    runImport(manager, "agency", new Date(Date.UTC(2026, 2, 15, 9, 30, 1)));

    const json = JSON.parse(
      listImportRunsAction(manager, { lenderId: "uwm", output: "json" }),
    ) as Array<{ lenderId: string }>;
    expect(json).toHaveLength(1);
    expect(json[0]?.lenderId).toBe("uwm");

    const emptyText = listImportRunsAction(manager, {
      lenderId: "unknown",
      output: "text",
    });
    expect(emptyText).toContain("No import runs for lender");
  });

  it("showImportRunAction renders text and JSON for an existing run", () => {
    const manager = DatabaseManager.memory();
    seedTestLender(manager, "uwm");
    const runId = runImport(manager, "uwm", fixedNow);

    const text = showImportRunAction(manager, { runId, output: "text" });
    expect(text).toContain(runId);
    expect(text).toContain("uwm");
    expect(text).toContain("success");

    const parsed = JSON.parse(showImportRunAction(manager, { runId, output: "json" })) as {
      runId: string;
      status: string;
      errorLog: string[];
    };
    expect(parsed.runId).toBe(runId);
    expect(parsed.status).toBe("success");
    expect(parsed.errorLog).toEqual([]);
  });

  it("requireImportRun / showImportRunAction throw CliValidationError for unknown ids", () => {
    const manager = DatabaseManager.memory();
    expect(() => requireImportRun(manager, "missing")).toThrow(CliValidationError);
    expect(() => showImportRunAction(manager, { runId: "missing", output: "text" })).toThrow(
      CliValidationError,
    );
  });

  it("listCatalogHistoryAction enumerates versions for a lender and rejects unknown lenders", () => {
    const manager = DatabaseManager.memory();
    seedTestLender(manager, "uwm");
    runImport(manager, "uwm", new Date(Date.UTC(2026, 2, 15, 9, 30, 0)));
    runImport(manager, "uwm", new Date(Date.UTC(2026, 2, 15, 9, 30, 1)));

    const text = listCatalogHistoryAction(manager, {
      lenderId: "uwm",
      output: "text",
    });
    expect(text).toContain("v1");
    expect(text).toContain("v2");

    const parsed = JSON.parse(
      listCatalogHistoryAction(manager, { lenderId: "uwm", output: "json" }),
    ) as Array<{ version: number; productCount: number }>;
    expect(parsed.map((p) => p.version)).toEqual([2, 1]);
    expect(parsed.every((p) => p.productCount === 1)).toBe(true);

    expect(() =>
      listCatalogHistoryAction(manager, {
        lenderId: "does_not_exist",
        output: "text",
      }),
    ).toThrow(CliValidationError);
  });
});
