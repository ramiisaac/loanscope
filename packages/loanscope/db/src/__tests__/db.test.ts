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
import { sql } from "drizzle-orm";
import { createMemoryDatabase } from "../connection";
import type { LoanScopeDB } from "../connection";
import { applySchema } from "../migrate";
import { createLenderRepository } from "../repositories/lender-repository";
import { createCatalogRepository } from "../repositories/catalog-repository";
import { createPresetRepository } from "../repositories/preset-repository";
import { createCustomProductSetRepository } from "../repositories/custom-product-set-repository";
import type { LenderRepository } from "../repositories/lender-repository";
import type { CatalogRepository } from "../repositories/catalog-repository";
import type { PresetRepository } from "../repositories/preset-repository";
import type { CustomProductSetRepository } from "../repositories/custom-product-set-repository";

/* ------------------------------------------------------------------ */
/*  Test fixtures                                                      */
/* ------------------------------------------------------------------ */

/**
 * Minimal valid ProductDefinition for round-trip tests.
 * Only required fields are populated — no engine evaluation needed.
 */
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

/* ------------------------------------------------------------------ */
/*  Schema / migration tests                                          */
/* ------------------------------------------------------------------ */

describe("schema creation", () => {
  it("applies schema to a fresh in-memory database", () => {
    const db = createMemoryDatabase();
    expect(() => applySchema(db)).not.toThrow();
  });

  it("is idempotent — applying schema twice does not throw", () => {
    const db = createMemoryDatabase();
    applySchema(db);
    expect(() => applySchema(db)).not.toThrow();
  });

  it("creates all eleven tables", () => {
    const db = createMemoryDatabase();
    applySchema(db);

    // Query sqlite_master for our tables
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
});

/* ------------------------------------------------------------------ */
/*  Lender repository tests                                           */
/* ------------------------------------------------------------------ */

describe("LenderRepository", () => {
  let db: LoanScopeDB;
  let repo: LenderRepository;

  beforeEach(() => {
    db = createMemoryDatabase();
    applySchema(db);
    repo = createLenderRepository(db);
  });

  it("creates and retrieves a lender by ID", () => {
    const lender = repo.create({
      id: "uwm",
      name: "United Wholesale Mortgage",
      sourceKind: "builtin",
    });

    expect(lender.id).toBe("uwm");
    expect(lender.name).toBe("United Wholesale Mortgage");
    expect(lender.sourceKind).toBe("builtin");
    expect(lender.version).toBe(1);
    expect(lender.active).toBe(true);
    expect(lender.createdAt).toBeTruthy();
    expect(lender.updatedAt).toBeTruthy();

    const found = repo.findById("uwm");
    expect(found).toBeDefined();
    expect(found?.id).toBe("uwm");
  });

  it("returns undefined for a non-existent lender", () => {
    expect(repo.findById("nonexistent")).toBeUndefined();
  });

  it("throws on duplicate lender ID", () => {
    repo.create({ id: "chase", name: "Chase", sourceKind: "imported" });
    expect(() =>
      repo.create({ id: "chase", name: "Chase Copy", sourceKind: "imported" }),
    ).toThrow();
  });

  it("lists all lenders", () => {
    repo.create({ id: "uwm", name: "UWM", sourceKind: "builtin" });
    repo.create({ id: "chase", name: "Chase", sourceKind: "imported" });

    const all = repo.findAll();
    expect(all).toHaveLength(2);
  });

  it("filters active-only lenders", () => {
    repo.create({ id: "uwm", name: "UWM", sourceKind: "builtin" });
    repo.create({ id: "chase", name: "Chase", sourceKind: "imported" });
    repo.deactivate("chase");

    const activeOnly = repo.findAll(true);
    expect(activeOnly).toHaveLength(1);
    expect(activeOnly[0]?.id).toBe("uwm");
  });

  it("deactivates and reactivates a lender", () => {
    repo.create({ id: "uwm", name: "UWM", sourceKind: "builtin" });

    repo.deactivate("uwm");
    expect(repo.findById("uwm")?.active).toBe(false);

    repo.activate("uwm");
    expect(repo.findById("uwm")?.active).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/*  Catalog repository tests                                          */
/* ------------------------------------------------------------------ */

describe("CatalogRepository", () => {
  let db: LoanScopeDB;
  let lenderRepo: LenderRepository;
  let catalogRepo: CatalogRepository;

  beforeEach(() => {
    db = createMemoryDatabase();
    applySchema(db);
    lenderRepo = createLenderRepository(db);
    catalogRepo = createCatalogRepository(db);
    lenderRepo.create({ id: "uwm", name: "UWM", sourceKind: "builtin" });
  });

  it("imports a catalog and retrieves the version record", () => {
    const version = catalogRepo.importCatalog({
      lenderId: "uwm",
      version: 1,
      products: [PRODUCT_A, PRODUCT_B],
      sourceFile: "uwm-products.json",
      contentHash: "abc123",
    });

    expect(version.lenderId).toBe("uwm");
    expect(version.version).toBe(1);
    expect(version.sourceFile).toBe("uwm-products.json");
    expect(version.contentHash).toBe("abc123");
    expect(version.importedAt).toBeTruthy();
  });

  it("round-trips product definitions through JSON serialization", () => {
    const version = catalogRepo.importCatalog({
      lenderId: "uwm",
      version: 1,
      products: [PRODUCT_A],
      contentHash: "hash1",
    });

    const products = catalogRepo.getProducts(version.id);
    expect(products).toHaveLength(1);

    const retrieved = products[0];
    expect(retrieved).toBeDefined();
    expect(retrieved?.id).toBe("prod_a");
    expect(retrieved?.name).toBe("Product A");
    expect(retrieved?.loanType).toBe(LoanType.Conventional);
    expect(retrieved?.channel).toBe(Channel.Agency);
    expect(retrieved?.variants).toHaveLength(1);
    expect(retrieved?.variants[0]?.programKind).toBe(ProgramKind.Fixed);
    expect(retrieved?.variants[0]?.terms).toEqual([AmortizationTerm.M360]);
  });

  it("returns the latest catalog version", () => {
    catalogRepo.importCatalog({
      lenderId: "uwm",
      version: 1,
      products: [PRODUCT_A],
      contentHash: "hash1",
    });
    catalogRepo.importCatalog({
      lenderId: "uwm",
      version: 2,
      products: [PRODUCT_A, PRODUCT_B],
      contentHash: "hash2",
    });

    const latest = catalogRepo.getLatestVersion("uwm");
    expect(latest).toBeDefined();
    expect(latest?.version).toBe(2);
  });

  it("returns version history in descending order", () => {
    catalogRepo.importCatalog({
      lenderId: "uwm",
      version: 1,
      products: [PRODUCT_A],
      contentHash: "hash1",
    });
    catalogRepo.importCatalog({
      lenderId: "uwm",
      version: 2,
      products: [PRODUCT_B],
      contentHash: "hash2",
    });

    const history = catalogRepo.getVersionHistory("uwm");
    expect(history).toHaveLength(2);
    expect(history[0]?.version).toBe(2);
    expect(history[1]?.version).toBe(1);
  });

  it("returns latest products for a lender", () => {
    catalogRepo.importCatalog({
      lenderId: "uwm",
      version: 1,
      products: [PRODUCT_A],
      contentHash: "hash1",
    });
    catalogRepo.importCatalog({
      lenderId: "uwm",
      version: 2,
      products: [PRODUCT_A, PRODUCT_B],
      contentHash: "hash2",
    });

    const products = catalogRepo.getLatestProducts("uwm");
    expect(products).toHaveLength(2);
  });

  it("returns empty array for a lender with no catalogs", () => {
    expect(catalogRepo.getLatestProducts("uwm")).toEqual([]);
    expect(catalogRepo.getLatestVersion("uwm")).toBeUndefined();
  });

  it("rejects import for a non-existent lender (FK constraint)", () => {
    expect(() =>
      catalogRepo.importCatalog({
        lenderId: "nonexistent",
        version: 1,
        products: [PRODUCT_A],
        contentHash: "hash1",
      }),
    ).toThrow();
  });
});

/* ------------------------------------------------------------------ */
/*  Preset repository tests                                           */
/* ------------------------------------------------------------------ */

describe("PresetRepository", () => {
  let db: LoanScopeDB;
  let lenderRepo: LenderRepository;
  let presetRepo: PresetRepository;

  beforeEach(() => {
    db = createMemoryDatabase();
    applySchema(db);
    lenderRepo = createLenderRepository(db);
    presetRepo = createPresetRepository(db);
    lenderRepo.create({ id: "uwm", name: "UWM", sourceKind: "builtin" });
  });

  it("creates and retrieves a preset", () => {
    const preset = presetRepo.create({
      lenderId: "uwm",
      presetId: "jumbo_all",
      name: "All Jumbo Products",
      productIds: ["prod_a", "prod_b"],
    });

    expect(preset.lenderId).toBe("uwm");
    expect(preset.presetId).toBe("jumbo_all");
    expect(preset.name).toBe("All Jumbo Products");
    expect(preset.productIds).toEqual(["prod_a", "prod_b"]);
  });

  it("round-trips product ID arrays through JSON serialization", () => {
    presetRepo.create({
      lenderId: "uwm",
      presetId: "small",
      name: "Small Preset",
      productIds: ["x", "y", "z"],
    });

    const found = presetRepo.findByPresetId("uwm", "small");
    expect(found).toBeDefined();
    expect(found?.productIds).toEqual(["x", "y", "z"]);
    // Verify it's a true array, not a string
    expect(Array.isArray(found?.productIds)).toBe(true);
  });

  it("lists all presets for a lender", () => {
    presetRepo.create({
      lenderId: "uwm",
      presetId: "preset_1",
      name: "Preset 1",
      productIds: ["prod_a"],
    });
    presetRepo.create({
      lenderId: "uwm",
      presetId: "preset_2",
      name: "Preset 2",
      productIds: ["prod_b"],
    });

    const presets = presetRepo.findByLender("uwm");
    expect(presets).toHaveLength(2);
  });

  it("returns undefined for a non-existent preset", () => {
    expect(presetRepo.findByPresetId("uwm", "nope")).toBeUndefined();
  });

  it("deletes a preset", () => {
    presetRepo.create({
      lenderId: "uwm",
      presetId: "doomed",
      name: "Doomed",
      productIds: [],
    });
    expect(presetRepo.findByPresetId("uwm", "doomed")).toBeDefined();

    presetRepo.delete("uwm", "doomed");
    expect(presetRepo.findByPresetId("uwm", "doomed")).toBeUndefined();
  });

  it("rejects preset for non-existent lender (FK constraint)", () => {
    expect(() =>
      presetRepo.create({
        lenderId: "nonexistent",
        presetId: "bad",
        name: "Bad",
        productIds: [],
      }),
    ).toThrow();
  });
});

/* ------------------------------------------------------------------ */
/*  Custom product set repository tests                               */
/* ------------------------------------------------------------------ */

describe("CustomProductSetRepository", () => {
  let db: LoanScopeDB;
  let customRepo: CustomProductSetRepository;

  beforeEach(() => {
    db = createMemoryDatabase();
    applySchema(db);
    customRepo = createCustomProductSetRepository(db);
  });

  it("creates and retrieves a custom product set", () => {
    const set = customRepo.create({
      setId: "my_set",
      name: "My Custom Set",
      products: [PRODUCT_A, PRODUCT_B],
    });

    expect(set.setId).toBe("my_set");
    expect(set.name).toBe("My Custom Set");
    expect(set.lenderId).toBeNull();
    expect(set.validationStatus).toBe("unchecked");
    expect(set.products).toHaveLength(2);
    expect(set.createdAt).toBeTruthy();
    expect(set.updatedAt).toBeTruthy();
  });

  it("round-trips product definitions through JSON serialization", () => {
    customRepo.create({
      setId: "round_trip",
      name: "Round Trip",
      products: [PRODUCT_A],
    });

    const found = customRepo.findBySetId("round_trip");
    expect(found).toBeDefined();
    expect(found?.products).toHaveLength(1);

    const product = found?.products[0];
    expect(product?.id).toBe("prod_a");
    expect(product?.loanType).toBe(LoanType.Conventional);
    expect(product?.variants[0]?.terms).toEqual([AmortizationTerm.M360]);
  });

  it("creates a set with an optional lender association", () => {
    // First create the lender so FK is satisfied
    const lenderRepo = createLenderRepository(db);
    lenderRepo.create({ id: "uwm", name: "UWM", sourceKind: "builtin" });

    const set = customRepo.create({
      setId: "lender_set",
      name: "Lender Set",
      lenderId: "uwm",
      products: [PRODUCT_A],
    });

    expect(set.lenderId).toBe("uwm");
  });

  it("lists all custom product sets", () => {
    customRepo.create({
      setId: "set_1",
      name: "Set 1",
      products: [PRODUCT_A],
    });
    customRepo.create({
      setId: "set_2",
      name: "Set 2",
      products: [PRODUCT_B],
    });

    expect(customRepo.findAll()).toHaveLength(2);
  });

  it("updates validation status", () => {
    customRepo.create({
      setId: "validate_me",
      name: "Validate Me",
      products: [PRODUCT_A],
    });

    customRepo.updateValidationStatus("validate_me", "valid");
    expect(customRepo.findBySetId("validate_me")?.validationStatus).toBe("valid");

    customRepo.updateValidationStatus("validate_me", "invalid");
    expect(customRepo.findBySetId("validate_me")?.validationStatus).toBe("invalid");
  });

  it("deletes a custom product set", () => {
    customRepo.create({
      setId: "doomed",
      name: "Doomed",
      products: [],
    });
    expect(customRepo.findBySetId("doomed")).toBeDefined();

    customRepo.delete("doomed");
    expect(customRepo.findBySetId("doomed")).toBeUndefined();
  });

  it("throws on duplicate set ID", () => {
    customRepo.create({
      setId: "unique",
      name: "First",
      products: [],
    });
    expect(() =>
      customRepo.create({
        setId: "unique",
        name: "Second",
        products: [],
      }),
    ).toThrow();
  });

  it("returns undefined for a non-existent set", () => {
    expect(customRepo.findBySetId("nonexistent")).toBeUndefined();
  });
});

/* ------------------------------------------------------------------ */
/*  Cross-repository / isolation tests                                */
/* ------------------------------------------------------------------ */

describe("database isolation", () => {
  it("each in-memory database is isolated", () => {
    const db1 = createMemoryDatabase();
    const db2 = createMemoryDatabase();
    applySchema(db1);
    applySchema(db2);

    const repo1 = createLenderRepository(db1);
    const repo2 = createLenderRepository(db2);

    repo1.create({ id: "uwm", name: "UWM", sourceKind: "builtin" });

    expect(repo1.findAll()).toHaveLength(1);
    expect(repo2.findAll()).toHaveLength(0);
  });
});
