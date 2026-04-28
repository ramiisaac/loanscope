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
import { createLenderRepository } from "../repositories/lender-repository";
import { CustomProductService, validateProductStructure } from "../custom-product-service";

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

/* ------------------------------------------------------------------ */
/*  validateProductStructure unit tests                                */
/* ------------------------------------------------------------------ */

describe("validateProductStructure", () => {
  it("returns no errors for a structurally valid product", () => {
    expect(validateProductStructure(PRODUCT_A)).toEqual([]);
  });

  it("reports empty id", () => {
    const product = makeProduct("", "Good Name");
    const errors = validateProductStructure(product);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/id/i);
  });

  it("reports whitespace-only id", () => {
    const product = makeProduct("   ", "Good Name");
    const errors = validateProductStructure(product);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/id/i);
  });

  it("reports empty name", () => {
    const product = makeProduct("good_id", "");
    const errors = validateProductStructure(product);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/name/i);
  });

  it("reports invalid loanType", () => {
    const product: ProductDefinition = {
      ...makeProduct("p1", "P1"),
      loanType: "Nonexistent" as LoanType,
    };
    const errors = validateProductStructure(product);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/loanType/i);
  });

  it("reports invalid channel", () => {
    const product: ProductDefinition = {
      ...makeProduct("p1", "P1"),
      channel: "Bogus" as Channel,
    };
    const errors = validateProductStructure(product);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/channel/i);
  });

  it("reports missing variants (empty array)", () => {
    const product: ProductDefinition = {
      ...makeProduct("p1", "P1"),
      variants: [],
    };
    const errors = validateProductStructure(product);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/variant/i);
  });

  it("reports multiple errors at once", () => {
    const product: ProductDefinition = {
      id: "",
      name: "",
      loanType: "Bad" as LoanType,
      channel: "Bad" as Channel,
      variants: [],
    };
    const errors = validateProductStructure(product);
    expect(errors).toHaveLength(5);
  });
});

/* ------------------------------------------------------------------ */
/*  CustomProductService tests                                        */
/* ------------------------------------------------------------------ */

describe("CustomProductService", () => {
  let db: LoanScopeDB;
  let service: CustomProductService;

  beforeEach(() => {
    db = createMemoryDatabase();
    applySchema(db);
    service = new CustomProductService(db);
  });

  /* ---- create / get ------------------------------------------------ */

  it("creates a valid set with validationStatus 'valid'", () => {
    const record = service.createSet({
      setId: "valid_set",
      name: "Valid Set",
      products: [PRODUCT_A, PRODUCT_B],
    });

    expect(record.setId).toBe("valid_set");
    expect(record.name).toBe("Valid Set");
    expect(record.validationStatus).toBe("valid");
    expect(record.products).toHaveLength(2);
    expect(record.lenderId).toBeNull();
    expect(record.createdAt).toBeTruthy();
    expect(record.updatedAt).toBeTruthy();
  });

  it("creates a set with invalid products → validationStatus 'invalid'", () => {
    const badProduct: ProductDefinition = {
      ...makeProduct("", ""),
      variants: [],
    };

    const record = service.createSet({
      setId: "bad_set",
      name: "Bad Set",
      products: [PRODUCT_A, badProduct],
    });

    expect(record.validationStatus).toBe("invalid");
  });

  it("marks a set with all invalid products as 'invalid'", () => {
    const bad1: ProductDefinition = {
      id: "",
      name: "",
      loanType: "X" as LoanType,
      channel: "Y" as Channel,
      variants: [],
    };
    const bad2: ProductDefinition = {
      id: "",
      name: "Z",
      loanType: LoanType.Jumbo,
      channel: Channel.Portfolio,
      variants: [],
    };

    const record = service.createSet({
      setId: "all_bad",
      name: "All Bad",
      products: [bad1, bad2],
    });

    expect(record.validationStatus).toBe("invalid");
  });

  /* ---- getSet ------------------------------------------------------ */

  it("getSet returns the record by setId", () => {
    service.createSet({
      setId: "lookup",
      name: "Lookup Set",
      products: [PRODUCT_A],
    });

    const found = service.getSet("lookup");
    expect(found).toBeDefined();
    expect(found?.setId).toBe("lookup");
    expect(found?.name).toBe("Lookup Set");
  });

  it("getSet returns undefined for non-existent setId", () => {
    expect(service.getSet("ghost")).toBeUndefined();
  });

  /* ---- listSets ---------------------------------------------------- */

  it("listSets returns all sets", () => {
    service.createSet({
      setId: "s1",
      name: "Set 1",
      products: [PRODUCT_A],
    });
    service.createSet({
      setId: "s2",
      name: "Set 2",
      products: [PRODUCT_B],
    });

    const sets = service.listSets();
    expect(sets).toHaveLength(2);
  });

  it("listSets returns empty array when no sets exist", () => {
    expect(service.listSets()).toHaveLength(0);
  });

  /* ---- deleteSet --------------------------------------------------- */

  it("deleteSet removes the set", () => {
    service.createSet({
      setId: "delete_me",
      name: "Delete Me",
      products: [PRODUCT_A],
    });
    expect(service.getSet("delete_me")).toBeDefined();

    service.deleteSet("delete_me");
    expect(service.getSet("delete_me")).toBeUndefined();
  });

  it("deleteSet on non-existent set does not throw", () => {
    expect(() => service.deleteSet("nothing")).not.toThrow();
  });

  /* ---- revalidateSet ----------------------------------------------- */

  it("revalidateSet returns 'valid' for a valid set", () => {
    service.createSet({
      setId: "reval",
      name: "Revalidate Me",
      products: [PRODUCT_A],
    });

    const status = service.revalidateSet("reval");
    expect(status).toBe("valid");

    const record = service.getSet("reval");
    expect(record?.validationStatus).toBe("valid");
  });

  it("revalidateSet returns 'invalid' for an invalid set", () => {
    const bad: ProductDefinition = {
      ...makeProduct("bad", "Bad"),
      variants: [],
    };

    service.createSet({
      setId: "reval_bad",
      name: "Bad Revalidate",
      products: [bad],
    });

    const status = service.revalidateSet("reval_bad");
    expect(status).toBe("invalid");

    const record = service.getSet("reval_bad");
    expect(record?.validationStatus).toBe("invalid");
  });

  it("revalidateSet throws for non-existent set", () => {
    expect(() => service.revalidateSet("missing")).toThrow(/not found/i);
  });

  /* ---- getProducts ------------------------------------------------- */

  it("getProducts returns deserialized ProductDefinition[]", () => {
    service.createSet({
      setId: "products_test",
      name: "Products Test",
      products: [PRODUCT_A, PRODUCT_B],
    });

    const products = service.getProducts("products_test");
    expect(products).toHaveLength(2);
    expect(products[0]?.id).toBe("prod_a");
    expect(products[1]?.id).toBe("prod_b");
  });

  it("getProducts throws for non-existent set", () => {
    expect(() => service.getProducts("nope")).toThrow(/not found/i);
  });

  /* ---- round-trip fidelity ----------------------------------------- */

  it("products round-trip preserves all fields through JSON serialization", () => {
    service.createSet({
      setId: "fidelity",
      name: "Fidelity Test",
      products: [PRODUCT_A],
    });

    const products = service.getProducts("fidelity");
    expect(products).toHaveLength(1);

    const p = products[0];
    expect(p).toBeDefined();
    expect(p?.id).toBe("prod_a");
    expect(p?.name).toBe("Product A");
    expect(p?.loanType).toBe(LoanType.Conventional);
    expect(p?.channel).toBe(Channel.Agency);
    expect(p?.variants).toHaveLength(1);

    const variant = p?.variants[0];
    expect(variant).toBeDefined();
    expect(variant?.programKind).toBe(ProgramKind.Fixed);
    expect(variant?.amortization.type).toBe(AmortizationType.FullyAmortizing);
    expect(variant?.amortization.qualifyingPaymentPolicy).toEqual({
      kind: "NotePayment",
    });
    expect(variant?.terms).toEqual([AmortizationTerm.M360]);
    expect(variant?.constraints.Primary.maxLTVRatio).toBe(ratio(0.95));
    expect(variant?.constraints.Primary.minFico).toBe(620);
    expect(variant?.constraints.Secondary.maxLTVRatio).toBe(ratio(0.9));
    expect(variant?.constraints.Investment.maxLTVRatio).toBe(ratio(0.85));
  });

  /* ---- optional lenderId ------------------------------------------- */

  it("associates a set with a lender when lenderId is provided", () => {
    const lenderRepo = createLenderRepository(db);
    lenderRepo.create({ id: "uwm", name: "UWM", sourceKind: "builtin" });

    const record = service.createSet({
      setId: "lender_linked",
      name: "Lender Linked",
      lenderId: "uwm",
      products: [PRODUCT_A],
    });

    expect(record.lenderId).toBe("uwm");

    const retrieved = service.getSet("lender_linked");
    expect(retrieved?.lenderId).toBe("uwm");
  });

  it("creates a set without lenderId (null association)", () => {
    const record = service.createSet({
      setId: "no_lender",
      name: "No Lender",
      products: [PRODUCT_A],
    });

    expect(record.lenderId).toBeNull();
  });

  /* ---- CRUD round-trip --------------------------------------------- */

  it("full CRUD round-trip: create → get → list → delete → verify gone", () => {
    // Create
    const created = service.createSet({
      setId: "crud",
      name: "CRUD Test",
      products: [PRODUCT_A, PRODUCT_B],
    });
    expect(created.setId).toBe("crud");

    // Get
    const got = service.getSet("crud");
    expect(got).toBeDefined();
    expect(got?.products).toHaveLength(2);

    // List
    const listed = service.listSets();
    expect(listed).toHaveLength(1);
    expect(listed[0]?.setId).toBe("crud");

    // Delete
    service.deleteSet("crud");

    // Verify gone
    expect(service.getSet("crud")).toBeUndefined();
    expect(service.listSets()).toHaveLength(0);
  });
});
