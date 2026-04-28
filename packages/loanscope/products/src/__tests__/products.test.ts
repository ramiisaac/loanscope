import { describe, expect, it } from "vitest";
import { getAllProducts, getAllLenders, resolveProductDefinition, resolveVariant } from "../index";
import { AmortizationType, Channel, LoanPurpose, LoanType, Occupancy } from "@loanscope/domain";
import type { ProductDefinition } from "@loanscope/domain";
import { InterestOnlyAmortization } from "../amortization";
import { JumboPink, UWMJumboProducts } from "../uwm/jumbo";
import { uwmLender } from "../uwm/lender";

describe("product catalog", () => {
  it("defines products with variants and base constraints", () => {
    const products = getAllProducts();
    expect(products.length).toBeGreaterThan(0);
    for (const product of products) {
      expect(product.id).toBeTruthy();
      expect(product.name).toBeTruthy();
      // Base products (used for inheritance) may have no variants
      if (!product.id.endsWith("_base")) {
        expect(product.variants.length).toBeGreaterThan(0);
      }
      expect(product.baseConstraints).toBeTruthy();
    }
  });

  it("ensures constraint consistency (maxLTV <= maxCLTV)", () => {
    const products = getAllProducts();
    for (const product of products) {
      for (const variant of product.variants) {
        for (const occupancy of Object.values(Occupancy)) {
          const constraints = variant.constraints[occupancy];
          if (!constraints) continue;
          if (constraints.maxLTVRatio !== undefined && constraints.maxCLTVRatio !== undefined) {
            expect(Number(constraints.maxLTVRatio)).toBeLessThanOrEqual(
              Number(constraints.maxCLTVRatio),
            );
          }
        }
      }
    }
  });
});

describe("UWM jumbo tiers", () => {
  // Jumbo tier refinement: Jumbo Pink was refined to a dedicated 4-tier loan-amount
  // grid with per-band FICO/LTV envelopes. The remaining color products
  // (Purple/Blue/Green/Yellow/White) still share the baseline 3-tier shape,
  // so cross-color shape-consistency is asserted only over the non-Pink set.
  it("has consistent tier ranges across non-Pink jumbo colors", () => {
    const tiers = UWMJumboProducts.filter((product) => product.id !== "uwm_jumbo_pink").map(
      (product) => product.tiers ?? [],
    );
    const first = tiers[0];
    if (!first) throw new Error("expected at least one tier list");
    expect(first.length).toBeGreaterThan(0);
    for (const list of tiers) {
      expect(list.length).toBe(first.length);
      for (let i = 0; i < list.length; i += 1) {
        expect(Number(list[i]?.range.min ?? 0)).toBe(Number(first[i]?.range.min ?? 0));
        expect(Number(list[i]?.range.max ?? 0)).toBe(Number(first[i]?.range.max ?? 0));
      }
    }
  });

  it("Jumbo Pink carries the refined 4-tier grid (Jumbo tier refinement)", () => {
    const pink = UWMJumboProducts.find((p) => p.id === "uwm_jumbo_pink");
    expect(pink).toBeDefined();
    expect(pink!.tiers?.length).toBe(4);
  });
});

describe("variant resolution", () => {
  it("resolves term/amortization/occupancy-specific constraints", () => {
    const variant = resolveVariant(
      JumboPink,
      480,
      Occupancy.Primary,
      AmortizationType.InterestOnly,
    );
    expect(variant.amortization.type).toBe(AmortizationType.InterestOnly);
    expect(variant.constraints[Occupancy.Primary]?.minFico).toBe(720);
  });
});

describe("product inheritance", () => {
  it("resolves base constraints through inheritance chain", () => {
    const products = getAllProducts();
    const catalog = new Map(products.map((product) => [product.id, product]));
    const resolved = resolveProductDefinition(JumboPink, catalog);
    expect(resolved.baseConstraints?.allowedPurposes).toEqual([
      LoanPurpose.Purchase,
      LoanPurpose.RateTermRefi,
    ]);
  });

  it("throws on a two-node circular extends chain (A -> B -> A)", () => {
    const a: ProductDefinition = {
      id: "circ_a",
      name: "Circular A",
      loanType: LoanType.Conventional,
      channel: Channel.Portfolio,
      extends: "circ_b",
      variants: [],
    };
    const b: ProductDefinition = {
      id: "circ_b",
      name: "Circular B",
      loanType: LoanType.Conventional,
      channel: Channel.Portfolio,
      extends: "circ_a",
      variants: [],
    };
    const catalog = new Map<string, ProductDefinition>([
      [a.id, a],
      [b.id, b],
    ]);
    expect(() => resolveProductDefinition(a, catalog)).toThrow(/Circular extends chain detected/);
  });

  it("throws on a self-referential extends (A -> A)", () => {
    const self: ProductDefinition = {
      id: "circ_self",
      name: "Self-Ref",
      loanType: LoanType.Conventional,
      channel: Channel.Portfolio,
      extends: "circ_self",
      variants: [],
    };
    const catalog = new Map<string, ProductDefinition>([[self.id, self]]);
    expect(() => resolveProductDefinition(self, catalog)).toThrow(
      /Circular extends chain detected/,
    );
  });

  it("throws on a longer circular chain (A -> B -> C -> A)", () => {
    const mk = (id: string, ext: string): ProductDefinition => ({
      id,
      name: id,
      loanType: LoanType.Conventional,
      channel: Channel.Portfolio,
      extends: ext,
      variants: [],
    });
    const a = mk("circ_a3", "circ_b3");
    const b = mk("circ_b3", "circ_c3");
    const c = mk("circ_c3", "circ_a3");
    const catalog = new Map<string, ProductDefinition>([
      [a.id, a],
      [b.id, b],
      [c.id, c],
    ]);
    expect(() => resolveProductDefinition(a, catalog)).toThrow(/Circular extends chain detected/);
  });

  it("throws with a descriptive base-not-found error when extends references a missing product", () => {
    const orphan: ProductDefinition = {
      id: "orphan",
      name: "Orphan",
      loanType: LoanType.Conventional,
      channel: Channel.Portfolio,
      extends: "missing_parent",
      variants: [],
    };
    const catalog = new Map<string, ProductDefinition>([[orphan.id, orphan]]);
    expect(() => resolveProductDefinition(orphan, catalog)).toThrow(
      /Base product missing_parent not found for orphan/,
    );
  });
});

describe("amortization behaviors", () => {
  it("uses IO qualifying payment policy for interest-only", () => {
    expect(InterestOnlyAmortization.type).toBe(AmortizationType.InterestOnly);
    expect(InterestOnlyAmortization.qualifyingPaymentPolicy.kind).toBe("IOUsesFullyAmortizing");
  });
});

// ---------------------------------------------------------------------------
// Wave 8-A: Lender/product-source selection flows (catalog-level)
// ---------------------------------------------------------------------------

describe("lender/product-source selection flows", () => {
  it("generic: getAllLenders returns all channel-level and UWM lenders", () => {
    const lenders = getAllLenders();
    const ids = lenders.map((l) => l.id);
    expect(ids).toContain("uwm");
    expect(ids).toContain("agency");
    expect(ids).toContain("government");
    expect(ids).toContain("portfolio");
    expect(lenders.length).toBeGreaterThanOrEqual(4);
  });

  it("generic: getAllProducts returns fully resolved products across all lenders", () => {
    const products = getAllProducts();
    expect(products.length).toBeGreaterThan(0);

    // Should include agency products
    const agencyIds = products.filter((p) => p.channel === Channel.Agency).map((p) => p.id);
    expect(agencyIds).toContain("agency_conforming");

    // Should include UWM portfolio products
    const portfolioIds = products.filter((p) => p.channel === Channel.Portfolio).map((p) => p.id);
    expect(portfolioIds).toContain("uwm_jumbo_pink");
  });

  it("preset-style: UWM lender defines products that can be filtered by family", () => {
    const uwmProducts = uwmLender.products;
    expect(uwmProducts.length).toBeGreaterThan(0);

    // Simulate a preset: filter to jumbo family only
    const jumboOnly = uwmProducts.filter((p) => p.family?.toLowerCase().includes("jumbo"));
    expect(jumboOnly.length).toBeGreaterThan(1);

    // All filtered products should be jumbo loan type
    for (const product of jumboOnly) {
      expect(product.loanType).toBe(LoanType.Jumbo);
    }

    // Simulate a single-product preset (like jumbo_pink_30)
    const pinkOnly = uwmProducts.filter((p) => p.id === "uwm_jumbo_pink");
    expect(pinkOnly.length).toBe(1);
    expect(pinkOnly[0]?.id).toBe("uwm_jumbo_pink");
  });

  it("custom: caller can provide a custom product subset scoped to UWM lenderId", () => {
    const allProducts = getAllProducts();

    // Custom selection: provide arbitrary products, filter to lenderId
    const customList = allProducts.filter(
      (p) => p.id === "uwm_jumbo_pink" || p.id === "agency_conforming",
    );
    expect(customList.length).toBe(2);

    // Scope to UWM only by lenderId
    const uwmScoped = customList.filter((p) => p.lenderId === "uwm");
    expect(uwmScoped.length).toBe(1);
    expect(uwmScoped[0]?.id).toBe("uwm_jumbo_pink");
  });

  it("custom: without lender scoping, all provided products are returned", () => {
    const allProducts = getAllProducts();
    const subset = allProducts.slice(0, 3);
    // Without filtering by lenderId, all three come through
    expect(subset.length).toBe(3);
    for (const p of subset) {
      expect(p.id).toBeTruthy();
    }
  });

  it("each lender has a non-empty product list", () => {
    const lenders = getAllLenders();
    for (const lender of lenders) {
      expect(lender.id).toBeTruthy();
      expect(lender.name).toBeTruthy();
      expect(lender.products.length).toBeGreaterThan(0);
    }
  });

  it("lender product IDs are unique within each lender", () => {
    const lenders = getAllLenders();
    for (const lender of lenders) {
      const ids = lender.products.map((p) => p.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    }
  });

  it("UWM lender products all carry lenderId uwm", () => {
    for (const product of uwmLender.products) {
      expect(product.lenderId).toBe("uwm");
    }
  });

  it("UWM lender contains both jumbo color and prime jumbo families", () => {
    const families = new Set(uwmLender.products.map((p) => p.family));
    expect(families.has("Jumbo Pink")).toBe(true);
    expect(families.has("Jumbo White")).toBe(true);
    expect(families.has("Prime Jumbo")).toBe(true);
  });

  it("agency lender products do not carry UWM lenderId", () => {
    const lenders = getAllLenders();
    const agencyLender = lenders.find((l) => l.id === "agency");
    expect(agencyLender).toBeDefined();
    for (const product of agencyLender!.products) {
      expect(product.lenderId).not.toBe("uwm");
    }
  });

  it("resolving all products preserves product count across lenders", () => {
    const lenders = getAllLenders();
    const totalFromLenders = lenders.reduce((sum, l) => sum + l.products.length, 0);
    const resolved = getAllProducts();
    // Resolved should match the total from lenders (base products included)
    expect(resolved.length).toBe(totalFromLenders);
  });

  it("getAllProducts returns products with resolved inheritance chains", () => {
    const products = getAllProducts();
    // Products that extend a base should have merged baseConstraints
    const jumboGreen = products.find((p) => p.id === "uwm_jumbo_green");
    expect(jumboGreen).toBeDefined();
    // After resolution, it should have allowedPurposes from portfolio_base
    expect(jumboGreen!.baseConstraints?.allowedPurposes).toBeDefined();
    expect(jumboGreen!.baseConstraints!.allowedPurposes!.length).toBeGreaterThan(0);
  });
});
