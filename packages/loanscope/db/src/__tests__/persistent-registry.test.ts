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
import { createMemoryDatabase } from "../connection";
import type { LoanScopeDB } from "../connection";
import { applySchema } from "../migrate";
import { seedLender, seedLenders } from "../seed";
import { PersistentLenderRegistry, PersistentRegistryError } from "../persistent-registry";
import { createLenderRepository } from "../repositories/lender-repository";
import { createCatalogRepository } from "../repositories/catalog-repository";
import { createPresetRepository } from "../repositories/preset-repository";

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
const PRODUCT_C = makeProduct("prod_c", "Product C");

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
    {
      id: "just_a",
      name: "Just Product A",
      productIds: ["prod_a"],
    },
  ],
};

const secondLenderInput: LenderDefinitionInput = {
  id: "second_lender",
  name: "Second Lender",
  products: [PRODUCT_C],
  presets: [
    {
      id: "default",
      name: "Default",
      productIds: ["prod_c"],
    },
  ],
};

/* ------------------------------------------------------------------ */
/*  seedLender tests                                                   */
/* ------------------------------------------------------------------ */

describe("seedLender", () => {
  let db: LoanScopeDB;

  beforeEach(() => {
    db = createMemoryDatabase();
    applySchema(db);
  });

  it("persists a lender with metadata, catalog, and presets", () => {
    const validated = seedLender(db, testLenderInput);

    expect(validated.id).toBe("test_lender");
    expect(validated.name).toBe("Test Lender");
    expect(validated.products).toHaveLength(2);
    expect(validated.presets).toHaveLength(2);

    // Verify rows were created
    const lenderRepo = createLenderRepository(db);
    const catalogRepo = createCatalogRepository(db);
    const presetRepo = createPresetRepository(db);

    expect(lenderRepo.findById("test_lender")).toBeDefined();

    const version = catalogRepo.getLatestVersion("test_lender");
    expect(version).toBeDefined();
    expect(version?.version).toBe(1);

    const products = catalogRepo.getLatestProducts("test_lender");
    expect(products).toHaveLength(2);

    const presets = presetRepo.findByLender("test_lender");
    expect(presets).toHaveLength(2);
  });

  it("is idempotent — seeding the same lender twice does not duplicate rows", () => {
    seedLender(db, testLenderInput);
    seedLender(db, testLenderInput);

    const lenderRepo = createLenderRepository(db);
    const catalogRepo = createCatalogRepository(db);
    const presetRepo = createPresetRepository(db);

    // Only one lender row
    expect(lenderRepo.findAll()).toHaveLength(1);

    // Only one catalog version (same content hash)
    const history = catalogRepo.getVersionHistory("test_lender");
    expect(history).toHaveLength(1);

    // Presets are replaced, not duplicated
    expect(presetRepo.findByLender("test_lender")).toHaveLength(2);
  });

  it("creates a new catalog version when products change", () => {
    seedLender(db, testLenderInput);

    // Seed again with an updated product list
    const updatedInput: LenderDefinitionInput = {
      ...testLenderInput,
      products: [PRODUCT_A, PRODUCT_B, PRODUCT_C],
      presets: [
        {
          id: "all",
          name: "All Products",
          productIds: ["prod_a", "prod_b", "prod_c"],
        },
      ],
    };
    seedLender(db, updatedInput);

    const catalogRepo = createCatalogRepository(db);
    const history = catalogRepo.getVersionHistory("test_lender");
    expect(history).toHaveLength(2);
    expect(history[0]?.version).toBe(2);

    const latestProducts = catalogRepo.getLatestProducts("test_lender");
    expect(latestProducts).toHaveLength(3);
  });

  it("validates lender input through domain validation pipeline", () => {
    const invalidInput: LenderDefinitionInput = {
      id: "",
      name: "Bad Lender",
      products: [PRODUCT_A],
    };

    expect(() => seedLender(db, invalidInput)).toThrow();
  });

  it("seeds multiple lenders via seedLenders", () => {
    const results = seedLenders(db, [testLenderInput, secondLenderInput]);
    expect(results).toHaveLength(2);

    const lenderRepo = createLenderRepository(db);
    expect(lenderRepo.findAll()).toHaveLength(2);
  });
});

/* ------------------------------------------------------------------ */
/*  PersistentLenderRegistry tests                                    */
/* ------------------------------------------------------------------ */

describe("PersistentLenderRegistry", () => {
  let db: LoanScopeDB;
  let registry: PersistentLenderRegistry;

  beforeEach(() => {
    db = createMemoryDatabase();
    applySchema(db);
    seedLender(db, testLenderInput);
    seedLender(db, secondLenderInput);
    registry = new PersistentLenderRegistry(db);
  });

  // ---- Lender queries ----

  it("getLender returns a validated lender with products and presets", () => {
    const lender = registry.getLender("test_lender");
    expect(lender.id).toBe("test_lender");
    expect(lender.name).toBe("Test Lender");
    expect(lender.products).toHaveLength(2);
    expect(lender.presets).toHaveLength(2);
  });

  it("getLender throws for unknown lender", () => {
    expect(() => registry.getLender("nonexistent")).toThrow(PersistentRegistryError);
  });

  it("getAllLenders returns domain LenderDefinition objects", () => {
    const lenders = registry.getAllLenders();
    expect(lenders).toHaveLength(2);
    const ids = lenders.map((l) => l.id).sort();
    expect(ids).toEqual(["second_lender", "test_lender"]);
  });

  it("lenderIds returns all active lender IDs", () => {
    const ids = registry.lenderIds().sort();
    expect(ids).toEqual(["second_lender", "test_lender"]);
  });

  it("hasLender returns true for registered lenders", () => {
    expect(registry.hasLender("test_lender")).toBe(true);
    expect(registry.hasLender("nonexistent")).toBe(false);
  });

  it("size returns the count of active lenders", () => {
    expect(registry.size).toBe(2);
  });

  it("getLender excludes deactivated lenders", () => {
    const lenderRepo = createLenderRepository(db);
    lenderRepo.deactivate("test_lender");

    expect(registry.hasLender("test_lender")).toBe(false);
    expect(registry.size).toBe(1);
    expect(() => registry.getLender("test_lender")).toThrow(PersistentRegistryError);
  });

  // ---- Product queries ----

  it("getProducts returns products for a specific lender", () => {
    const products = registry.getProducts("test_lender");
    expect(products).toHaveLength(2);
    expect(products.map((p) => p.id).sort()).toEqual(["prod_a", "prod_b"]);
  });

  it("getProducts throws for unknown lender", () => {
    expect(() => registry.getProducts("nonexistent")).toThrow(PersistentRegistryError);
  });

  it("getAllProducts aggregates products across all lenders", () => {
    const products = registry.getAllProducts();
    expect(products).toHaveLength(3);
  });

  it("products round-trip preserves domain type structure", () => {
    const products = registry.getProducts("test_lender");
    const prod = products.find((p) => p.id === "prod_a");
    expect(prod).toBeDefined();
    expect(prod?.loanType).toBe(LoanType.Conventional);
    expect(prod?.channel).toBe(Channel.Agency);
    expect(prod?.variants).toHaveLength(1);
    expect(prod?.variants[0]?.programKind).toBe(ProgramKind.Fixed);
    expect(prod?.variants[0]?.terms).toEqual([AmortizationTerm.M360]);
  });

  // ---- Preset queries ----

  it("getPresets returns presets for a lender", () => {
    const presets = registry.getPresets("test_lender");
    expect(presets).toHaveLength(2);
    const ids = presets.map((p) => p.id).sort();
    expect(ids).toEqual(["all", "just_a"]);
  });

  it("getPresets returns arrays for productIds (not JSON strings)", () => {
    const presets = registry.getPresets("test_lender");
    const allPreset = presets.find((p) => p.id === "all");
    expect(allPreset).toBeDefined();
    expect(Array.isArray(allPreset?.productIds)).toBe(true);
    expect(allPreset?.productIds).toEqual(["prod_a", "prod_b"]);
  });

  it("resolvePreset returns matching products", () => {
    const products = registry.resolvePreset("test_lender", "just_a");
    expect(products).toHaveLength(1);
    expect(products[0]?.id).toBe("prod_a");
  });

  it("resolvePreset throws for unknown preset", () => {
    expect(() => registry.resolvePreset("test_lender", "nonexistent")).toThrow(
      PersistentRegistryError,
    );
  });

  // ---- Product source selection ----

  it("resolveProductSource with generic returns all products", () => {
    const products = registry.resolveProductSource({ kind: "generic" });
    expect(products).toHaveLength(3);
  });

  it("resolveProductSource with preset returns preset products", () => {
    const products = registry.resolveProductSource({
      kind: "preset",
      lenderId: "test_lender",
      presetId: "just_a",
    });
    expect(products).toHaveLength(1);
    expect(products[0]?.id).toBe("prod_a");
  });

  it("resolveProductSource with custom returns provided products", () => {
    const customProduct = makeProduct("custom_1", "Custom Product");
    const products = registry.resolveProductSource({
      kind: "custom",
      products: [customProduct],
    });
    expect(products).toHaveLength(1);
    expect(products[0]?.id).toBe("custom_1");
  });

  it("resolveProductSource with custom + lenderId filters by lender", () => {
    const matchingProduct: ProductDefinition = {
      ...makeProduct("prod_x", "Matching"),
      lenderId: "test_lender",
    };
    const nonMatchingProduct = makeProduct("prod_y", "Non-matching");

    const products = registry.resolveProductSource({
      kind: "custom",
      lenderId: "test_lender",
      products: [matchingProduct, nonMatchingProduct],
    });
    expect(products).toHaveLength(1);
    expect(products[0]?.id).toBe("prod_x");
  });

  // ---- Catalog versioning through the registry ----

  it("reflects catalog updates when re-seeded", () => {
    expect(registry.getProducts("test_lender")).toHaveLength(2);

    // Seed with updated products
    seedLender(db, {
      ...testLenderInput,
      products: [PRODUCT_A, PRODUCT_B, PRODUCT_C],
      presets: [
        {
          id: "all",
          name: "All Products",
          productIds: ["prod_a", "prod_b", "prod_c"],
        },
      ],
    });

    // Registry should now see the updated catalog
    expect(registry.getProducts("test_lender")).toHaveLength(3);
    expect(registry.getPresets("test_lender")).toHaveLength(1);
  });
});
