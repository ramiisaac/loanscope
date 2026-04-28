import { describe, it, expect, beforeEach } from "vitest";
import type { ProductDefinition } from "@loanscope/domain";
import {
  AmortizationTerm,
  AmortizationType,
  Channel,
  LoanType,
  Occupancy,
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
import {
  CURRENT_PAYLOAD_VERSION,
  assessCatalogPayloadVersion,
  assessPayloadVersion,
} from "../mappers/catalog-mapper";

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
        [Occupancy.Primary]: { maxLTVRatio: ratio(0.95), minFico: 620 },
        [Occupancy.Secondary]: { maxLTVRatio: ratio(0.9), minFico: 680 },
        [Occupancy.Investment]: { maxLTVRatio: ratio(0.85), minFico: 700 },
      },
    },
  ],
});

const PRODUCT_A = makeProduct("p_a", "Product A");
const PRODUCT_B = makeProduct("p_b", "Product B");

describe("CURRENT_PAYLOAD_VERSION", () => {
  it("is a positive integer", () => {
    expect(Number.isInteger(CURRENT_PAYLOAD_VERSION)).toBe(true);
    expect(CURRENT_PAYLOAD_VERSION).toBeGreaterThanOrEqual(1);
  });

  it("matches the importCatalog default", () => {
    // The catalog repository defaults `payloadVersion` to 1 when omitted.
    // CURRENT_PAYLOAD_VERSION must remain 1 until a breaking shape change
    // bumps both in lockstep. Pinning the default-vs-current invariant
    // prevents silent drift if one is bumped without the other.
    const db = createMemoryDatabase();
    applySchema(db);
    const lenderRepo = createLenderRepository(db);
    const catalogRepo = createCatalogRepository(db);
    lenderRepo.create({ id: "uwm", name: "UWM", sourceKind: "imported" });
    const record = catalogRepo.importCatalog({
      lenderId: "uwm",
      version: 1,
      products: [PRODUCT_A],
      contentHash: "default-hash",
    });
    expect(record.payloadVersion).toBe(CURRENT_PAYLOAD_VERSION);
  });
});

describe("assessPayloadVersion classification", () => {
  it("classifies an exact match as current", () => {
    const result = assessPayloadVersion(2, 2);
    expect(result.kind).toBe("current");
    expect(result.stored).toBe(2);
    expect(result.current).toBe(2);
    if (result.kind === "current") {
      // Exhaustiveness: the current-kind variant carries no message field.
      expect("message" in result).toBe(false);
    }
  });

  it("classifies one-major-behind as compatible-prior with a descriptive message", () => {
    const result = assessPayloadVersion(1, 2);
    expect(result.kind).toBe("compatible-prior");
    expect(result.stored).toBe(1);
    expect(result.current).toBe(2);
    if (result.kind === "compatible-prior") {
      expect(result.message).toContain("v1");
      expect(result.message).toContain("v2");
      expect(result.message).toContain("backward-compatible");
    }
  });

  it("classifies two-or-more-majors-behind as unsupported-prior", () => {
    const result = assessPayloadVersion(0, 2);
    expect(result.kind).toBe("unsupported-prior");
    if (result.kind === "unsupported-prior") {
      expect(result.message).toContain("more than one shape behind");
      expect(result.message).toContain("Re-import");
    }

    const result3 = assessPayloadVersion(1, 5);
    expect(result3.kind).toBe("unsupported-prior");
  });

  it("classifies stored ahead of host as future", () => {
    const result = assessPayloadVersion(3, 1);
    expect(result.kind).toBe("future");
    if (result.kind === "future") {
      expect(result.message).toContain("ahead");
      expect(result.message).toContain("v3");
      expect(result.message).toContain("v1");
    }
  });

  it("classifies far-future stored versions as future (any positive delta)", () => {
    const result = assessPayloadVersion(99, 1);
    expect(result.kind).toBe("future");
  });

  it("uses CURRENT_PAYLOAD_VERSION as the default for the second argument", () => {
    const explicit = assessPayloadVersion(CURRENT_PAYLOAD_VERSION, CURRENT_PAYLOAD_VERSION);
    const implicit = assessPayloadVersion(CURRENT_PAYLOAD_VERSION);
    expect(implicit.kind).toBe(explicit.kind);
    expect(implicit.current).toBe(CURRENT_PAYLOAD_VERSION);
  });

  it("rejects a non-integer stored version", () => {
    expect(() => assessPayloadVersion(1.5)).toThrow(
      /payload_version must be a non-negative integer/,
    );
  });

  it("rejects a negative stored version", () => {
    expect(() => assessPayloadVersion(-1)).toThrow(
      /payload_version must be a non-negative integer/,
    );
  });

  it("rejects a non-integer current version", () => {
    expect(() => assessPayloadVersion(1, 2.5)).toThrow(
      /current payload_version must be a positive integer/,
    );
  });

  it("rejects a zero current version", () => {
    expect(() => assessPayloadVersion(1, 0)).toThrow(
      /current payload_version must be a positive integer/,
    );
  });

  it("rejects a negative current version", () => {
    expect(() => assessPayloadVersion(1, -1)).toThrow(
      /current payload_version must be a positive integer/,
    );
  });
});

describe("assessCatalogPayloadVersion", () => {
  it("returns the bare assessment unchanged when stored matches current", () => {
    const assessment = assessCatalogPayloadVersion(
      { lenderId: "uwm", version: 3, payloadVersion: CURRENT_PAYLOAD_VERSION },
      CURRENT_PAYLOAD_VERSION,
    );
    expect(assessment.kind).toBe("current");
  });

  it("threads the lender id and catalog version into compatible-prior messages", () => {
    const assessment = assessCatalogPayloadVersion(
      { lenderId: "uwm", version: 7, payloadVersion: 1 },
      2,
    );
    expect(assessment.kind).toBe("compatible-prior");
    if (assessment.kind === "compatible-prior") {
      expect(assessment.message).toContain('Lender "uwm"');
      expect(assessment.message).toContain("catalog v7");
      expect(assessment.message).toContain("v1");
      expect(assessment.message).toContain("v2");
    }
  });

  it("threads the lender id and catalog version into unsupported-prior messages", () => {
    const assessment = assessCatalogPayloadVersion(
      { lenderId: "agency", version: 12, payloadVersion: 0 },
      3,
    );
    expect(assessment.kind).toBe("unsupported-prior");
    if (assessment.kind === "unsupported-prior") {
      expect(assessment.message).toContain('Lender "agency"');
      expect(assessment.message).toContain("catalog v12");
      expect(assessment.message).toContain("Re-import");
    }
  });

  it("threads the lender id and catalog version into future messages", () => {
    const assessment = assessCatalogPayloadVersion(
      { lenderId: "uwm", version: 4, payloadVersion: 9 },
      1,
    );
    expect(assessment.kind).toBe("future");
    if (assessment.kind === "future") {
      expect(assessment.message).toContain('Lender "uwm"');
      expect(assessment.message).toContain("catalog v4");
      expect(assessment.message).toContain("ahead");
    }
  });

  it("uses CURRENT_PAYLOAD_VERSION as the default for the second argument", () => {
    const assessment = assessCatalogPayloadVersion({
      lenderId: "uwm",
      version: 1,
      payloadVersion: CURRENT_PAYLOAD_VERSION,
    });
    expect(assessment.kind).toBe("current");
    expect(assessment.current).toBe(CURRENT_PAYLOAD_VERSION);
  });
});

describe("end-to-end migration semantics against stored catalogs", () => {
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

  it("a current-version catalog read assesses as current and deserializes cleanly", () => {
    const record = catalogRepo.importCatalog({
      lenderId: "uwm",
      version: 1,
      payloadVersion: CURRENT_PAYLOAD_VERSION,
      products: [PRODUCT_A, PRODUCT_B],
      contentHash: "current-hash",
    });

    const assessment = assessCatalogPayloadVersion(record);
    expect(assessment.kind).toBe("current");

    const products = catalogRepo.getProducts(record.id);
    expect(products).toHaveLength(2);
    expect(products.map((p) => p.id).sort()).toEqual(["p_a", "p_b"]);
  });

  it("a one-version-behind catalog assesses as compatible-prior and still deserializes cleanly", () => {
    // Simulate the live host code at a hypothetical v2 by passing 2 as the
    // explicit current. The stored row is at v1 (the default). The contract
    // is: backward-compatible — read succeeds, assessment surfaces a warning.
    const record = catalogRepo.importCatalog({
      lenderId: "uwm",
      version: 1,
      payloadVersion: 1,
      products: [PRODUCT_A],
      contentHash: "v1-hash",
    });

    const assessment = assessCatalogPayloadVersion(record, 2);
    expect(assessment.kind).toBe("compatible-prior");

    const products = catalogRepo.getProducts(record.id);
    expect(products).toHaveLength(1);
    expect(products[0]?.id).toBe("p_a");
  });

  it("a two-or-more-versions-behind catalog assesses as unsupported-prior", () => {
    // Pre-versioning sentinel (v0) read against a hypothetical host at v2.
    const record = catalogRepo.importCatalog({
      lenderId: "uwm",
      version: 1,
      payloadVersion: 0,
      products: [PRODUCT_A],
      contentHash: "v0-hash",
    });

    const assessment = assessCatalogPayloadVersion(record, 2);
    expect(assessment.kind).toBe("unsupported-prior");

    // Even when unsupported, getProducts still attempts the read — the
    // contract is that *the host code chooses* whether to honor the result.
    // The repository does not fail closed; that is the caller's policy.
    const products = catalogRepo.getProducts(record.id);
    expect(products).toHaveLength(1);
  });

  it("a future-version catalog assesses as future", () => {
    // Stored payload was written by a build ahead of the host. getProducts
    // still succeeds because the JSON shape is structurally compatible at
    // v2 (no breaking shape changes have actually landed yet); the warning
    // is the contract that says "your host is older than this data".
    const record = catalogRepo.importCatalog({
      lenderId: "uwm",
      version: 1,
      payloadVersion: 7,
      products: [PRODUCT_A, PRODUCT_B],
      contentHash: "future-hash",
    });

    const assessment = assessCatalogPayloadVersion(record);
    expect(assessment.kind).toBe("future");

    const products = catalogRepo.getProducts(record.id);
    expect(products).toHaveLength(2);
  });

  it("mixed-version histories assess each row independently", () => {
    catalogRepo.importCatalog({
      lenderId: "uwm",
      version: 1,
      payloadVersion: 0,
      products: [PRODUCT_A],
      contentHash: "v0",
    });
    catalogRepo.importCatalog({
      lenderId: "uwm",
      version: 2,
      payloadVersion: 1,
      products: [PRODUCT_A, PRODUCT_B],
      contentHash: "v1",
    });
    catalogRepo.importCatalog({
      lenderId: "uwm",
      version: 3,
      payloadVersion: 2,
      products: [PRODUCT_A],
      contentHash: "v2",
    });

    const history = catalogRepo.getVersionHistory("uwm");
    const assessments = history.map((row) => assessCatalogPayloadVersion(row, 2));

    // Newest first: payloadVersion 2 (current), 1 (compatible-prior), 0 (unsupported-prior).
    expect(assessments.map((a) => a.kind)).toEqual([
      "current",
      "compatible-prior",
      "unsupported-prior",
    ]);
  });

  it("catalog history with a future row surfaces the future assessment", () => {
    catalogRepo.importCatalog({
      lenderId: "uwm",
      version: 1,
      payloadVersion: 1,
      products: [PRODUCT_A],
      contentHash: "v1-curr",
    });
    catalogRepo.importCatalog({
      lenderId: "uwm",
      version: 2,
      payloadVersion: 5,
      products: [PRODUCT_B],
      contentHash: "v5-future",
    });

    const history = catalogRepo.getVersionHistory("uwm");
    const assessments = history.map((row) => assessCatalogPayloadVersion(row));
    expect(assessments[0]?.kind).toBe("future");
    expect(assessments[1]?.kind).toBe("current");
  });

  it("getLatestProducts ignores the assessment and always returns the deserialized payload", () => {
    catalogRepo.importCatalog({
      lenderId: "uwm",
      version: 1,
      payloadVersion: 0,
      products: [PRODUCT_A],
      contentHash: "v0-unsupported",
    });

    const products = catalogRepo.getLatestProducts("uwm");
    expect(products).toHaveLength(1);
    expect(products[0]?.id).toBe("p_a");
  });
});

describe('"one breaking shape change behind" invariant', () => {
  // The migration compatibility contract: when CURRENT_PAYLOAD_VERSION = N, the host code
  // must read v(N-1) cleanly. Bumping CURRENT_PAYLOAD_VERSION without
  // verifying v(N-1) compatibility is a regression. These tests pin the
  // contract independently of what N happens to be at any given moment.
  it("v(N-1) classifies as compatible-prior for any current N >= 2", () => {
    for (const current of [2, 3, 5, 10]) {
      const result = assessPayloadVersion(current - 1, current);
      expect(result.kind).toBe("compatible-prior");
    }
  });

  it("v(N-2) and below always classify as unsupported-prior for any current N >= 3", () => {
    for (const current of [3, 4, 7]) {
      for (const stored of [0, 1, current - 2]) {
        const result = assessPayloadVersion(stored, current);
        expect(result.kind).toBe("unsupported-prior");
      }
    }
  });

  it("vN exactly equal to current always classifies as current", () => {
    for (const current of [1, 2, 5, 10]) {
      const result = assessPayloadVersion(current, current);
      expect(result.kind).toBe("current");
    }
  });

  it("v(N+k) for any positive k always classifies as future", () => {
    for (const current of [1, 3, 5]) {
      for (const ahead of [1, 2, 10, 100]) {
        const result = assessPayloadVersion(current + ahead, current);
        expect(result.kind).toBe("future");
      }
    }
  });
});
