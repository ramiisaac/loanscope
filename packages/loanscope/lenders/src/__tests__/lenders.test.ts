import { describe, expect, it, beforeEach } from "vitest";
import {
  LenderRegistry,
  LenderRegistryError,
  getDefaultRegistry,
  resetDefaultRegistry,
  validateLenderInput,
  LenderValidationError,
  registerUWMLender,
  uwmLenderInput,
  getUWMLenderInput,
} from "../index";
import type { LenderDefinitionInput } from "../index";
import type { ProductDefinition, ProductSourceSelection } from "@loanscope/domain";
import { Channel, LoanType } from "@loanscope/domain";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeProduct(id: string, overrides?: Partial<ProductDefinition>): ProductDefinition {
  return {
    id,
    name: id,
    channel: Channel.Portfolio,
    loanType: LoanType.Jumbo,
    variants: [],
    ...overrides,
  } as ProductDefinition;
}

function makeLenderInput(overrides?: Partial<LenderDefinitionInput>): LenderDefinitionInput {
  return {
    id: "test_lender",
    name: "Test Lender",
    products: [makeProduct("prod_a"), makeProduct("prod_b")],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Schema validation
// ---------------------------------------------------------------------------

describe("schema validation", () => {
  it("accepts a valid lender input", () => {
    const input = makeLenderInput();
    const validated = validateLenderInput(input);
    expect(validated.id).toBe("test_lender");
    expect(validated.name).toBe("Test Lender");
    expect(validated.products).toHaveLength(2);
    expect(validated.presets).toHaveLength(0);
  });

  it("accepts lender IDs with alphanumeric, dash, and underscore", () => {
    for (const id of ["abc", "a-b", "a_b", "ABC-123_xyz"]) {
      expect(() => validateLenderInput(makeLenderInput({ id }))).not.toThrow();
    }
  });

  it("rejects empty lender ID", () => {
    expect(() => validateLenderInput(makeLenderInput({ id: "" }))).toThrow(LenderValidationError);
  });

  it("rejects whitespace-only lender ID", () => {
    expect(() => validateLenderInput(makeLenderInput({ id: "  " }))).toThrow(LenderValidationError);
  });

  it("rejects lender ID with invalid characters", () => {
    for (const id of ["has spaces", "has.dot", "has@symbol", "has/slash"]) {
      expect(() => validateLenderInput(makeLenderInput({ id }))).toThrow(LenderValidationError);
    }
  });

  it("rejects empty product array", () => {
    expect(() => validateLenderInput(makeLenderInput({ products: [] }))).toThrow(
      LenderValidationError,
    );
  });

  it("rejects products with empty IDs", () => {
    expect(() => validateLenderInput(makeLenderInput({ products: [makeProduct("")] }))).toThrow(
      LenderValidationError,
    );
  });

  it("rejects duplicate product IDs within a lender", () => {
    expect(() =>
      validateLenderInput(
        makeLenderInput({
          products: [makeProduct("dup"), makeProduct("dup")],
        }),
      ),
    ).toThrow(LenderValidationError);
  });

  it("validates presets reference known product IDs", () => {
    const input = makeLenderInput({
      presets: [{ id: "my_preset", name: "My Preset", productIds: ["prod_a"] }],
    });
    const validated = validateLenderInput(input);
    expect(validated.presets).toHaveLength(1);
    expect(validated.presets[0]!.productIds).toEqual(["prod_a"]);
  });

  it("rejects presets referencing unknown product IDs", () => {
    expect(() =>
      validateLenderInput(
        makeLenderInput({
          presets: [{ id: "bad_preset", name: "Bad", productIds: ["nonexistent"] }],
        }),
      ),
    ).toThrow(LenderValidationError);
  });

  it("rejects presets with empty ID", () => {
    expect(() =>
      validateLenderInput(
        makeLenderInput({
          presets: [{ id: "", name: "Empty", productIds: ["prod_a"] }],
        }),
      ),
    ).toThrow(LenderValidationError);
  });

  it("rejects presets with invalid characters in ID", () => {
    expect(() =>
      validateLenderInput(
        makeLenderInput({
          presets: [{ id: "bad preset", name: "Bad", productIds: ["prod_a"] }],
        }),
      ),
    ).toThrow(LenderValidationError);
  });

  it("rejects duplicate preset IDs", () => {
    expect(() =>
      validateLenderInput(
        makeLenderInput({
          presets: [
            { id: "dup", name: "First", productIds: ["prod_a"] },
            { id: "dup", name: "Second", productIds: ["prod_b"] },
          ],
        }),
      ),
    ).toThrow(LenderValidationError);
  });

  it("rejects presets with empty productIds array", () => {
    expect(() =>
      validateLenderInput(
        makeLenderInput({
          presets: [{ id: "empty", name: "Empty", productIds: [] }],
        }),
      ),
    ).toThrow(LenderValidationError);
  });
});

// ---------------------------------------------------------------------------
// LenderRegistry
// ---------------------------------------------------------------------------

describe("LenderRegistry", () => {
  let registry: LenderRegistry;

  beforeEach(() => {
    registry = new LenderRegistry();
  });

  describe("registerLender", () => {
    it("registers a valid lender", () => {
      registry.registerLender(makeLenderInput());
      expect(registry.size).toBe(1);
      expect(registry.hasLender("test_lender")).toBe(true);
    });

    it("rejects duplicate lender IDs", () => {
      registry.registerLender(makeLenderInput());
      expect(() => registry.registerLender(makeLenderInput())).toThrow(LenderRegistryError);
    });

    it("rejects invalid lender input (validation passthrough)", () => {
      expect(() => registry.registerLender(makeLenderInput({ id: "" }))).toThrow(
        LenderValidationError,
      );
    });

    it("registers multiple distinct lenders", () => {
      registry.registerLender(makeLenderInput({ id: "lender_a", name: "A" }));
      registry.registerLender(makeLenderInput({ id: "lender_b", name: "B" }));
      expect(registry.size).toBe(2);
      expect(registry.lenderIds()).toEqual(expect.arrayContaining(["lender_a", "lender_b"]));
    });
  });

  describe("getLender", () => {
    it("returns a validated lender by ID", () => {
      registry.registerLender(makeLenderInput());
      const lender = registry.getLender("test_lender");
      expect(lender.id).toBe("test_lender");
      expect(lender.name).toBe("Test Lender");
    });

    it("throws for unknown lender ID", () => {
      expect(() => registry.getLender("nope")).toThrow(LenderRegistryError);
    });
  });

  describe("getAllLenders", () => {
    it("returns all registered lenders as LenderDefinition objects", () => {
      registry.registerLender(makeLenderInput({ id: "x", name: "X" }));
      registry.registerLender(makeLenderInput({ id: "y", name: "Y" }));
      const all = registry.getAllLenders();
      expect(all).toHaveLength(2);
      expect(all.map((l) => l.id).sort()).toEqual(["x", "y"]);
      // Verify it conforms to LenderDefinition shape
      for (const lender of all) {
        expect(lender).toHaveProperty("id");
        expect(lender).toHaveProperty("name");
        expect(lender).toHaveProperty("products");
      }
    });

    it("returns empty array when no lenders registered", () => {
      expect(registry.getAllLenders()).toEqual([]);
    });
  });

  describe("getProducts", () => {
    it("returns products for a specific lender", () => {
      registry.registerLender(makeLenderInput());
      const products = registry.getProducts("test_lender");
      expect(products).toHaveLength(2);
      expect(products.map((p) => p.id)).toEqual(["prod_a", "prod_b"]);
    });

    it("throws for unknown lender", () => {
      expect(() => registry.getProducts("nonexistent")).toThrow(LenderRegistryError);
    });
  });

  describe("getAllProducts (aggregation)", () => {
    it("aggregates products from all lenders", () => {
      registry.registerLender(
        makeLenderInput({
          id: "a",
          name: "A",
          products: [makeProduct("p1"), makeProduct("p2")],
        }),
      );
      registry.registerLender(
        makeLenderInput({
          id: "b",
          name: "B",
          products: [makeProduct("p3")],
        }),
      );
      const all = registry.getAllProducts();
      expect(all).toHaveLength(3);
      expect(all.map((p) => p.id).sort()).toEqual(["p1", "p2", "p3"]);
    });

    it("returns empty array when no lenders registered", () => {
      expect(registry.getAllProducts()).toEqual([]);
    });
  });

  describe("resolvePreset", () => {
    it("returns products matching the preset", () => {
      registry.registerLender(
        makeLenderInput({
          presets: [{ id: "subset", name: "Subset", productIds: ["prod_b"] }],
        }),
      );
      const result = registry.resolvePreset("test_lender", "subset");
      expect(result).toHaveLength(1);
      expect(result[0]!.id).toBe("prod_b");
    });

    it("returns multiple products for multi-product preset", () => {
      registry.registerLender(
        makeLenderInput({
          presets: [
            {
              id: "both",
              name: "Both",
              productIds: ["prod_a", "prod_b"],
            },
          ],
        }),
      );
      const result = registry.resolvePreset("test_lender", "both");
      expect(result).toHaveLength(2);
    });

    it("throws for unknown preset ID", () => {
      registry.registerLender(makeLenderInput());
      expect(() => registry.resolvePreset("test_lender", "nonexistent")).toThrow(
        LenderRegistryError,
      );
    });

    it("throws for unknown lender ID", () => {
      expect(() => registry.resolvePreset("nope", "any")).toThrow(LenderRegistryError);
    });
  });
});

// ---------------------------------------------------------------------------
// Product-source selection flows
// ---------------------------------------------------------------------------

describe("product-source selection", () => {
  let registry: LenderRegistry;

  beforeEach(() => {
    registry = new LenderRegistry();
    registry.registerLender(
      makeLenderInput({
        id: "lender_x",
        name: "Lender X",
        products: [
          makeProduct("x1", { lenderId: "lender_x" }),
          makeProduct("x2", { lenderId: "lender_x" }),
        ],
        presets: [{ id: "first_only", name: "First Only", productIds: ["x1"] }],
      }),
    );
    registry.registerLender(
      makeLenderInput({
        id: "lender_y",
        name: "Lender Y",
        products: [makeProduct("y1", { lenderId: "lender_y" })],
      }),
    );
  });

  it("resolves generic source to all products from all lenders", () => {
    const selection: ProductSourceSelection = { kind: "generic" };
    const products = registry.resolveProductSource(selection);
    expect(products).toHaveLength(3);
    expect(products.map((p) => p.id).sort()).toEqual(["x1", "x2", "y1"]);
  });

  it("resolves preset source to matching lender preset products", () => {
    const selection: ProductSourceSelection = {
      kind: "preset",
      lenderId: "lender_x",
      presetId: "first_only",
    };
    const products = registry.resolveProductSource(selection);
    expect(products).toHaveLength(1);
    expect(products[0]!.id).toBe("x1");
  });

  it("resolves custom source without lender scope", () => {
    const customProducts = [makeProduct("custom1"), makeProduct("custom2")];
    const selection: ProductSourceSelection = {
      kind: "custom",
      products: customProducts,
    };
    const products = registry.resolveProductSource(selection);
    expect(products).toHaveLength(2);
  });

  it("resolves custom source with lender scope (filters by lenderId)", () => {
    const customProducts = [
      makeProduct("c1", { lenderId: "lender_x" }),
      makeProduct("c2", { lenderId: "lender_y" }),
      makeProduct("c3"),
    ];
    const selection: ProductSourceSelection = {
      kind: "custom",
      lenderId: "lender_x",
      products: customProducts,
    };
    const products = registry.resolveProductSource(selection);
    expect(products).toHaveLength(1);
    expect(products[0]!.id).toBe("c1");
  });

  it("throws for preset source with unknown lender", () => {
    const selection: ProductSourceSelection = {
      kind: "preset",
      lenderId: "unknown",
      presetId: "any",
    };
    expect(() => registry.resolveProductSource(selection)).toThrow(LenderRegistryError);
  });

  it("throws for custom source with unknown lender scope", () => {
    const selection: ProductSourceSelection = {
      kind: "custom",
      lenderId: "unknown",
      products: [makeProduct("p1")],
    };
    expect(() => registry.resolveProductSource(selection)).toThrow(LenderRegistryError);
  });
});

// ---------------------------------------------------------------------------
// UWM lender registration
// ---------------------------------------------------------------------------

describe("UWM lender", () => {
  let registry: LenderRegistry;

  beforeEach(() => {
    registry = new LenderRegistry();
  });

  it("uwmLenderInput has the correct ID and name", () => {
    expect(uwmLenderInput.id).toBe("uwm");
    expect(uwmLenderInput.name).toBe("United Wholesale Mortgage");
  });

  it("uwmLenderInput has a non-empty product catalog", () => {
    expect(uwmLenderInput.products.length).toBeGreaterThan(0);
  });

  it("uwmLenderInput has presets defined", () => {
    expect(uwmLenderInput.presets).toBeDefined();
    expect(uwmLenderInput.presets!.length).toBeGreaterThan(0);
  });

  it("uwmLenderInput presets reference valid product IDs", () => {
    const productIds = new Set(uwmLenderInput.products.map((p) => p.id));
    for (const preset of uwmLenderInput.presets ?? []) {
      for (const pid of preset.productIds) {
        expect(productIds.has(pid)).toBe(true);
      }
    }
  });

  it("getUWMLenderInput returns the same input", () => {
    const input = getUWMLenderInput();
    expect(input.id).toBe(uwmLenderInput.id);
    expect(input.products).toBe(uwmLenderInput.products);
  });

  it("registerUWMLender registers into a provided registry", () => {
    registerUWMLender(registry);
    expect(registry.hasLender("uwm")).toBe(true);
    const lender = registry.getLender("uwm");
    expect(lender.name).toBe("United Wholesale Mortgage");
    expect(lender.products.length).toBeGreaterThan(0);
  });

  it("registerUWMLender rejects double registration", () => {
    registerUWMLender(registry);
    expect(() => registerUWMLender(registry)).toThrow(LenderRegistryError);
  });

  it("UWM products include jumbo product families", () => {
    registerUWMLender(registry);
    const products = registry.getProducts("uwm");
    const families = [...new Set(products.map((p) => p.family).filter(Boolean))];
    expect(families.length).toBeGreaterThan(0);
    const hasJumbo = families.some((f) => f!.toLowerCase().includes("jumbo"));
    expect(hasJumbo).toBe(true);
  });

  it("resolves jumbo_all preset to multiple products", () => {
    registerUWMLender(registry);
    const products = registry.resolvePreset("uwm", "jumbo_all");
    expect(products.length).toBeGreaterThan(1);
    for (const p of products) {
      expect(p.family?.toLowerCase()).toContain("jumbo");
    }
  });

  it("resolves jumbo_pink_30 preset to a single product", () => {
    registerUWMLender(registry);
    const products = registry.resolvePreset("uwm", "jumbo_pink_30");
    expect(products).toHaveLength(1);
    expect(products[0]!.id).toBe("uwm_jumbo_pink");
  });

  it("passes schema validation", () => {
    const validated = validateLenderInput(uwmLenderInput);
    expect(validated.id).toBe("uwm");
    expect(validated.presets.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Default singleton registry
// ---------------------------------------------------------------------------

describe("default registry singleton", () => {
  beforeEach(() => {
    resetDefaultRegistry();
  });

  it("returns the same instance on repeated calls", () => {
    const a = getDefaultRegistry();
    const b = getDefaultRegistry();
    expect(a).toBe(b);
  });

  it("resetDefaultRegistry creates a fresh instance", () => {
    const first = getDefaultRegistry();
    first.registerLender(makeLenderInput({ id: "temp", name: "Temp" }));
    expect(first.size).toBe(1);

    resetDefaultRegistry();

    const second = getDefaultRegistry();
    expect(second.size).toBe(0);
    expect(second).not.toBe(first);
  });

  it("registerUWMLender uses default registry when none provided", () => {
    resetDefaultRegistry();
    registerUWMLender();
    const reg = getDefaultRegistry();
    expect(reg.hasLender("uwm")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Invalid catalog rejection
// ---------------------------------------------------------------------------

describe("invalid catalog rejection", () => {
  let registry: LenderRegistry;

  beforeEach(() => {
    registry = new LenderRegistry();
  });

  it("rejects registration of a lender with no products", () => {
    expect(() =>
      registry.registerLender({
        id: "empty",
        name: "Empty",
        products: [],
      }),
    ).toThrow(LenderValidationError);
  });

  it("rejects registration of a lender with invalid ID characters", () => {
    expect(() =>
      registry.registerLender({
        id: "bad id!",
        name: "Bad",
        products: [makeProduct("p1")],
      }),
    ).toThrow(LenderValidationError);
  });

  it("rejects registration with preset referencing unknown products", () => {
    expect(() =>
      registry.registerLender({
        id: "bad_presets",
        name: "Bad Presets",
        products: [makeProduct("p1")],
        presets: [{ id: "ref_missing", name: "Ref Missing", productIds: ["p999"] }],
      }),
    ).toThrow(LenderValidationError);
  });

  it("rejects registration with duplicate product IDs in catalog", () => {
    expect(() =>
      registry.registerLender({
        id: "dup_products",
        name: "Dup Products",
        products: [makeProduct("same"), makeProduct("same")],
      }),
    ).toThrow(LenderValidationError);
  });
});
