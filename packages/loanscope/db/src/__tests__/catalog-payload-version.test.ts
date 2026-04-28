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
import { createCatalogRepository } from "../repositories/catalog-repository";
import type { CatalogRepository } from "../repositories/catalog-repository";
import type { LenderRepository } from "../repositories/lender-repository";

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

const PRODUCT_A = makeProduct("p_a", "Product A");
const PRODUCT_B = makeProduct("p_b", "Product B");

describe("catalog_versions.payload_version", () => {
  let db: LoanScopeDB;
  let lenderRepo: LenderRepository;
  let catalogRepo: CatalogRepository;

  beforeEach(() => {
    db = createMemoryDatabase();
    applySchema(db);
    lenderRepo = createLenderRepository(db);
    catalogRepo = createCatalogRepository(db);
    lenderRepo.create({ id: "uwm", name: "UWM", sourceKind: "imported" });
  });

  it("defaults payloadVersion to 1 when not supplied on importCatalog", () => {
    const record = catalogRepo.importCatalog({
      lenderId: "uwm",
      version: 1,
      products: [PRODUCT_A],
      contentHash: "hash-default",
    });

    expect(record.payloadVersion).toBe(1);

    const fetched = catalogRepo.getLatestVersion("uwm");
    expect(fetched?.payloadVersion).toBe(1);
  });

  it("persists an explicit payloadVersion through round-trip", () => {
    const record = catalogRepo.importCatalog({
      lenderId: "uwm",
      version: 1,
      payloadVersion: 2,
      products: [PRODUCT_A],
      contentHash: "hash-v2",
    });

    expect(record.payloadVersion).toBe(2);

    const fetched = catalogRepo.getLatestVersion("uwm");
    expect(fetched?.payloadVersion).toBe(2);

    const products = catalogRepo.getProducts(record.id);
    expect(products).toHaveLength(1);
    expect(products[0]?.id).toBe("p_a");
  });

  it("preserves payloadVersion across version history with mixed values", () => {
    catalogRepo.importCatalog({
      lenderId: "uwm",
      version: 1,
      payloadVersion: 1,
      products: [PRODUCT_A],
      contentHash: "hash-v1-payload-v1",
    });
    catalogRepo.importCatalog({
      lenderId: "uwm",
      version: 2,
      payloadVersion: 1,
      products: [PRODUCT_A, PRODUCT_B],
      contentHash: "hash-v2-payload-v1",
    });
    catalogRepo.importCatalog({
      lenderId: "uwm",
      version: 3,
      payloadVersion: 2,
      products: [PRODUCT_A],
      contentHash: "hash-v3-payload-v2",
    });

    const history = catalogRepo.getVersionHistory("uwm");
    expect(history.map((h) => h.version)).toEqual([3, 2, 1]);
    expect(history.map((h) => h.payloadVersion)).toEqual([2, 1, 1]);
  });

  it("treats payloadVersion as independent of the per-lender import counter `version`", () => {
    catalogRepo.importCatalog({
      lenderId: "uwm",
      version: 1,
      payloadVersion: 5,
      products: [PRODUCT_A],
      contentHash: "hash-skip-ahead",
    });

    const record = catalogRepo.getLatestVersion("uwm");
    expect(record?.version).toBe(1);
    expect(record?.payloadVersion).toBe(5);
  });

  it("isolates payloadVersion per lender", () => {
    lenderRepo.create({ id: "agency", name: "Agency", sourceKind: "builtin" });

    catalogRepo.importCatalog({
      lenderId: "uwm",
      version: 1,
      payloadVersion: 2,
      products: [PRODUCT_A],
      contentHash: "uwm-hash",
    });
    catalogRepo.importCatalog({
      lenderId: "agency",
      version: 1,
      payloadVersion: 1,
      products: [PRODUCT_A],
      contentHash: "agency-hash",
    });

    expect(catalogRepo.getLatestVersion("uwm")?.payloadVersion).toBe(2);
    expect(catalogRepo.getLatestVersion("agency")?.payloadVersion).toBe(1);
  });

  it("supports a payloadVersion of 0 (sentinel for pre-versioning) without rejection", () => {
    const record = catalogRepo.importCatalog({
      lenderId: "uwm",
      version: 1,
      payloadVersion: 0,
      products: [PRODUCT_A],
      contentHash: "hash-zero",
    });

    expect(record.payloadVersion).toBe(0);
    expect(catalogRepo.getLatestVersion("uwm")?.payloadVersion).toBe(0);
  });

  it("getLatestProducts deserializes payloads regardless of the row's payloadVersion", () => {
    catalogRepo.importCatalog({
      lenderId: "uwm",
      version: 1,
      payloadVersion: 7,
      products: [PRODUCT_A, PRODUCT_B],
      contentHash: "future-shape-hash",
    });

    const products = catalogRepo.getLatestProducts("uwm");
    expect(products.map((p) => p.id).sort()).toEqual(["p_a", "p_b"]);
  });
});
