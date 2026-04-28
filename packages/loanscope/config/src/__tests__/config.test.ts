import { describe, expect, it } from "vitest";
import { z } from "zod";
import { parseQuickQuote, parseConfig } from "../loader";
import { ConfigValidationError, configErrorFromZod, zodErrorToIssues } from "../errors";
import {
  moneySchema,
  ratioSchema,
  ratePctSchema,
  monthsSchema,
  unitsSchema,
  ficoSchema,
  lenderIdSchema,
  productSourceSelectionSchema,
} from "../schema/primitives";
import { scenarioSchema } from "../schema/scenario";
import { transactionSchema } from "../schema/transaction";
import { quickQuoteSchema } from "../schema/quick-quote";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function validQuickQuote(overrides: Record<string, unknown> = {}) {
  return {
    loanAmount: 800000,
    purchasePrice: 1000000,
    fico: 740,
    occupancy: "Primary",
    propertyType: "SFR",
    loanPurpose: "Purchase",
    monthlyIncome: 15000,
    monthlyDebts: 2000,
    noteRatePct: 6.75,
    amortizationMonths: 360,
    totalLiquidAssets: 200000,
    stateCode: "CA",
    ...overrides,
  };
}

function validScenario(overrides: Record<string, unknown> = {}) {
  return {
    loanPurpose: "Purchase",
    occupancy: "Primary",
    propertyType: "SFR",
    requestedLoanAmount: 800000,
    purchasePrice: 1000000,
    downPayment: 200000,
    rateNote: { noteRatePct: 6.5 },
    closingCosts: { estimatedTotal: 15000 },
    ...overrides,
  };
}

function validBorrower(overrides: Record<string, unknown> = {}) {
  return {
    id: "b1",
    fico: 740,
    incomes: [{ id: "inc1", borrowerId: "b1", type: "W2", monthlyAmount: 15000 }],
    ...overrides,
  };
}

function validTransaction(overrides: Record<string, unknown> = {}) {
  return {
    id: "txn-1",
    scenario: validScenario(),
    borrowers: [validBorrower()],
    variants: [{ id: "v1", label: "Primary", includedBorrowerIds: ["b1"] }],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Primitive schema validation
// ---------------------------------------------------------------------------

describe("moneySchema", () => {
  it("accepts zero", () => {
    expect(moneySchema.parse(0)).toBe(0);
  });

  it("accepts positive values", () => {
    expect(moneySchema.parse(500000)).toBe(500000);
  });

  it("rejects negative values", () => {
    expect(() => moneySchema.parse(-1)).toThrow();
    expect(() => moneySchema.parse(-100000)).toThrow();
  });

  it("rejects NaN", () => {
    expect(() => moneySchema.parse(NaN)).toThrow();
  });

  it("rejects Infinity", () => {
    expect(() => moneySchema.parse(Infinity)).toThrow();
    expect(() => moneySchema.parse(-Infinity)).toThrow();
  });

  it("rejects non-numeric strings that coerce to NaN", () => {
    expect(() => moneySchema.parse("not-a-number")).toThrow();
  });
});

describe("ratioSchema", () => {
  it("accepts 0", () => {
    expect(ratioSchema.parse(0)).toBe(0);
  });

  it("accepts 1", () => {
    expect(ratioSchema.parse(1)).toBe(1);
  });

  it("accepts value in range", () => {
    expect(ratioSchema.parse(0.75)).toBe(0.75);
  });

  it("rejects values above 1", () => {
    expect(() => ratioSchema.parse(1.01)).toThrow();
  });

  it("rejects negative values", () => {
    expect(() => ratioSchema.parse(-0.1)).toThrow();
  });

  it("rejects NaN", () => {
    expect(() => ratioSchema.parse(NaN)).toThrow();
  });

  it("rejects Infinity", () => {
    expect(() => ratioSchema.parse(Infinity)).toThrow();
  });
});

describe("ratePctSchema", () => {
  it("accepts zero rate", () => {
    expect(ratePctSchema.parse(0)).toBe(0);
  });

  it("accepts positive rate", () => {
    expect(ratePctSchema.parse(6.5)).toBe(6.5);
  });

  it("rejects negative rate", () => {
    expect(() => ratePctSchema.parse(-1)).toThrow();
  });

  it("rejects NaN", () => {
    expect(() => ratePctSchema.parse(NaN)).toThrow();
  });

  it("rejects Infinity", () => {
    expect(() => ratePctSchema.parse(Infinity)).toThrow();
  });
});

describe("monthsSchema", () => {
  it("accepts positive integer", () => {
    expect(monthsSchema.parse(360)).toBe(360);
  });

  it("rejects zero", () => {
    expect(() => monthsSchema.parse(0)).toThrow();
  });

  it("rejects negative", () => {
    expect(() => monthsSchema.parse(-12)).toThrow();
  });

  it("rejects non-integer", () => {
    expect(() => monthsSchema.parse(6.5)).toThrow();
  });

  it("rejects NaN", () => {
    expect(() => monthsSchema.parse(NaN)).toThrow();
  });

  it("rejects Infinity", () => {
    expect(() => monthsSchema.parse(Infinity)).toThrow();
  });
});

describe("unitsSchema", () => {
  it("accepts 1 through 4", () => {
    expect(unitsSchema.parse(1)).toBe(1);
    expect(unitsSchema.parse(2)).toBe(2);
    expect(unitsSchema.parse(3)).toBe(3);
    expect(unitsSchema.parse(4)).toBe(4);
  });

  it("rejects 0", () => {
    expect(() => unitsSchema.parse(0)).toThrow();
  });

  it("rejects 5", () => {
    expect(() => unitsSchema.parse(5)).toThrow();
  });

  it("rejects non-integer", () => {
    expect(() => unitsSchema.parse(2.5)).toThrow();
  });

  it("rejects NaN", () => {
    expect(() => unitsSchema.parse(NaN)).toThrow();
  });

  it("rejects Infinity", () => {
    expect(() => unitsSchema.parse(Infinity)).toThrow();
  });
});

describe("ficoSchema", () => {
  it("accepts 300", () => {
    expect(ficoSchema.parse(300)).toBe(300);
  });

  it("accepts 850", () => {
    expect(ficoSchema.parse(850)).toBe(850);
  });

  it("accepts 740", () => {
    expect(ficoSchema.parse(740)).toBe(740);
  });

  it("rejects 299", () => {
    expect(() => ficoSchema.parse(299)).toThrow();
  });

  it("rejects 851", () => {
    expect(() => ficoSchema.parse(851)).toThrow();
  });

  it("rejects 0", () => {
    expect(() => ficoSchema.parse(0)).toThrow();
  });

  it("rejects non-integer", () => {
    expect(() => ficoSchema.parse(740.5)).toThrow();
  });

  it("rejects NaN", () => {
    expect(() => ficoSchema.parse(NaN)).toThrow();
  });

  it("rejects Infinity", () => {
    expect(() => ficoSchema.parse(Infinity)).toThrow();
  });

  it("rejects negative", () => {
    expect(() => ficoSchema.parse(-600)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Lender ID validation
// ---------------------------------------------------------------------------

describe("lenderIdSchema", () => {
  it("accepts valid alphanumeric-dash-underscore IDs", () => {
    expect(lenderIdSchema.parse("lender-123")).toBe("lender-123");
    expect(lenderIdSchema.parse("ABC_DEF")).toBe("ABC_DEF");
  });

  it("rejects empty string", () => {
    expect(() => lenderIdSchema.parse("")).toThrow();
  });

  it("rejects IDs with spaces", () => {
    expect(() => lenderIdSchema.parse("lender 123")).toThrow();
  });

  it("rejects IDs with special characters", () => {
    expect(() => lenderIdSchema.parse("lender@123")).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Product source selection (discriminated union)
// ---------------------------------------------------------------------------

describe("productSourceSelectionSchema", () => {
  it("accepts generic source", () => {
    const result = productSourceSelectionSchema.parse({ kind: "generic" });
    expect(result.kind).toBe("generic");
  });

  it("accepts preset source with valid lenderId and presetId", () => {
    const result = productSourceSelectionSchema.parse({
      kind: "preset",
      lenderId: "uwm-main",
      presetId: "conforming-30yr",
    });
    expect(result.kind).toBe("preset");
    if (result.kind === "preset") {
      expect(result.lenderId).toBe("uwm-main");
      expect(result.presetId).toBe("conforming-30yr");
    }
  });

  it("rejects preset source with empty lenderId", () => {
    expect(() =>
      productSourceSelectionSchema.parse({
        kind: "preset",
        lenderId: "",
        presetId: "conforming-30yr",
      }),
    ).toThrow();
  });

  it("rejects preset source without presetId", () => {
    expect(() =>
      productSourceSelectionSchema.parse({
        kind: "preset",
        lenderId: "uwm-main",
      }),
    ).toThrow();
  });

  it("accepts custom source with products array", () => {
    const result = productSourceSelectionSchema.parse({
      kind: "custom",
      products: [{ name: "my-product", rate: 6.5 }],
    });
    expect(result.kind).toBe("custom");
  });

  it("rejects custom source with empty products array", () => {
    expect(() =>
      productSourceSelectionSchema.parse({
        kind: "custom",
        products: [],
      }),
    ).toThrow();
  });

  it("rejects unknown kind", () => {
    expect(() => productSourceSelectionSchema.parse({ kind: "unknown" })).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Cross-field validation: scenario
// ---------------------------------------------------------------------------

describe("scenarioSchema cross-field validation", () => {
  it("rejects when loan + downPayment != purchasePrice", () => {
    const result = scenarioSchema.safeParse({
      ...validScenario(),
      requestedLoanAmount: 700000,
      purchasePrice: 1000000,
      downPayment: 200000,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages.some((m) => m.includes("purchasePrice") || m.includes("Loan amount"))).toBe(
        true,
      );
    }
  });

  it("accepts consistent loan + downPayment = purchasePrice", () => {
    const result = scenarioSchema.safeParse(
      validScenario({
        requestedLoanAmount: 800000,
        purchasePrice: 1000000,
        downPayment: 200000,
      }),
    );
    expect(result.success).toBe(true);
  });

  it("rejects downPayment exceeding purchasePrice", () => {
    const result = scenarioSchema.safeParse(
      validScenario({
        requestedLoanAmount: 0,
        purchasePrice: 500000,
        downPayment: 600000,
      }),
    );
    expect(result.success).toBe(false);
  });

  it("rejects CashOutRefi without cashOut details", () => {
    const result = scenarioSchema.safeParse(
      validScenario({
        loanPurpose: "CashOutRefi",
        purchasePrice: undefined,
        downPayment: undefined,
      }),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages.some((m) => m.includes("Cash-out details"))).toBe(true);
    }
  });

  it("accepts CashOutRefi with cashOut details", () => {
    const result = scenarioSchema.safeParse(
      validScenario({
        loanPurpose: "CashOutRefi",
        purchasePrice: undefined,
        downPayment: undefined,
        cashOut: { requestedAmount: 100000 },
      }),
    );
    expect(result.success).toBe(true);
  });

  it("rejects cashOut on Purchase loan", () => {
    const result = scenarioSchema.safeParse(
      validScenario({
        cashOut: { requestedAmount: 100000 },
      }),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages.some((m) => m.includes("not applicable"))).toBe(true);
    }
  });

  it("rejects Purchase without purchasePrice", () => {
    const result = scenarioSchema.safeParse(
      validScenario({
        loanPurpose: "Purchase",
        purchasePrice: undefined,
        downPayment: undefined,
      }),
    );
    expect(result.success).toBe(false);
  });

  it("rejects loan amount exceeding purchase price on Purchase", () => {
    const result = scenarioSchema.safeParse(
      validScenario({
        requestedLoanAmount: 1200000,
        purchasePrice: 1000000,
        downPayment: undefined,
      }),
    );
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Cross-field validation: rateNote / product kind compatibility
// ---------------------------------------------------------------------------

describe("rateNote cross-field validation", () => {
  it("rejects ARM product kind without arm details", () => {
    const result = scenarioSchema.safeParse(
      validScenario({
        rateNote: { noteRatePct: 5.5, productKind: "ARM" },
      }),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages.some((m) => m.includes("ARM details"))).toBe(true);
    }
  });

  it("accepts ARM product kind with arm details", () => {
    const result = scenarioSchema.safeParse(
      validScenario({
        rateNote: {
          noteRatePct: 5.5,
          productKind: "ARM",
          arm: { initialFixedMonths: 60 },
        },
      }),
    );
    expect(result.success).toBe(true);
  });

  it("rejects InterestOnly without interestOnlyMonths", () => {
    const result = scenarioSchema.safeParse(
      validScenario({
        rateNote: { noteRatePct: 5.5, productKind: "InterestOnly" },
      }),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages.some((m) => m.includes("interestOnlyMonths"))).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Transaction-level: lender and preset reference validation
// ---------------------------------------------------------------------------

describe("transactionSchema lender/preset references", () => {
  it("rejects preset source when lenderId is not in knownLenderIds", () => {
    const result = transactionSchema.safeParse(
      validTransaction({
        productSource: {
          kind: "preset",
          lenderId: "unknown-lender",
          presetId: "preset-1",
        },
        knownLenderIds: ["uwm-main", "chase"],
        knownPresetIds: ["preset-1"],
      }),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(
        messages.some((m) => m.includes("unknown-lender") && m.includes("knownLenderIds")),
      ).toBe(true);
    }
  });

  it("rejects preset source when presetId is not in knownPresetIds", () => {
    const result = transactionSchema.safeParse(
      validTransaction({
        productSource: {
          kind: "preset",
          lenderId: "uwm-main",
          presetId: "nonexistent-preset",
        },
        knownLenderIds: ["uwm-main"],
        knownPresetIds: ["preset-1", "preset-2"],
      }),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages.some((m) => m.includes("nonexistent-preset"))).toBe(true);
    }
  });

  it("accepts valid preset source with known lender and preset", () => {
    const result = transactionSchema.safeParse(
      validTransaction({
        productSource: {
          kind: "preset",
          lenderId: "uwm-main",
          presetId: "preset-1",
        },
        knownLenderIds: ["uwm-main"],
        knownPresetIds: ["preset-1"],
      }),
    );
    expect(result.success).toBe(true);
  });

  it("rejects custom source with unknown lenderId", () => {
    const result = transactionSchema.safeParse(
      validTransaction({
        productSource: {
          kind: "custom",
          lenderId: "bogus-lender",
          products: [{ name: "p1" }],
        },
        knownLenderIds: ["uwm-main"],
      }),
    );
    expect(result.success).toBe(false);
  });

  it("accepts custom source without lenderId", () => {
    const result = transactionSchema.safeParse(
      validTransaction({
        productSource: {
          kind: "custom",
          products: [{ name: "p1" }],
        },
        knownLenderIds: ["uwm-main"],
      }),
    );
    expect(result.success).toBe(true);
  });

  it("accepts generic source without knownLenderIds", () => {
    const result = transactionSchema.safeParse(
      validTransaction({
        productSource: { kind: "generic" },
      }),
    );
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Reserve tier overlap validation
// ---------------------------------------------------------------------------

describe("transactionSchema reserve tier overlap", () => {
  it("accepts non-overlapping reserve tiers", () => {
    const result = transactionSchema.safeParse(
      validTransaction({
        reserveTiers: [
          { minMonths: 0, maxMonths: 6 },
          { minMonths: 7, maxMonths: 12 },
          { minMonths: 13, maxMonths: 24 },
        ],
      }),
    );
    expect(result.success).toBe(true);
  });

  it("rejects overlapping reserve tiers", () => {
    const result = transactionSchema.safeParse(
      validTransaction({
        reserveTiers: [
          { minMonths: 0, maxMonths: 6 },
          { minMonths: 5, maxMonths: 12 },
        ],
      }),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages.some((m) => m.includes("overlap"))).toBe(true);
    }
  });

  it("rejects tier where minMonths exceeds maxMonths", () => {
    const result = transactionSchema.safeParse(
      validTransaction({
        reserveTiers: [{ minMonths: 12, maxMonths: 6 }],
      }),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages.some((m) => m.includes("minMonths") && m.includes("maxMonths"))).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Quick quote: FICO boundary enforcement
// ---------------------------------------------------------------------------

describe("quickQuoteSchema FICO validation", () => {
  it("rejects FICO below 300", () => {
    const result = quickQuoteSchema.safeParse(validQuickQuote({ fico: 200 }));
    expect(result.success).toBe(false);
  });

  it("rejects FICO above 850", () => {
    const result = quickQuoteSchema.safeParse(validQuickQuote({ fico: 900 }));
    expect(result.success).toBe(false);
  });

  it("rejects non-integer FICO", () => {
    const result = quickQuoteSchema.safeParse(validQuickQuote({ fico: 740.5 }));
    expect(result.success).toBe(false);
  });

  it("accepts FICO at lower bound 300", () => {
    const result = quickQuoteSchema.safeParse(validQuickQuote({ fico: 300 }));
    expect(result.success).toBe(true);
  });

  it("accepts FICO at upper bound 850", () => {
    const result = quickQuoteSchema.safeParse(validQuickQuote({ fico: 850 }));
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Quick quote: cross-field
// ---------------------------------------------------------------------------

describe("quickQuoteSchema cross-field validation", () => {
  it("rejects Purchase without purchasePrice", () => {
    const data = validQuickQuote();
    delete (data as Record<string, unknown>)["purchasePrice"];
    const result = quickQuoteSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it("rejects loan amount exceeding purchase price on Purchase", () => {
    const result = quickQuoteSchema.safeParse(
      validQuickQuote({ loanAmount: 1200000, purchasePrice: 1000000 }),
    );
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Loader-level: parseQuickQuote
// ---------------------------------------------------------------------------

describe("parseQuickQuote", () => {
  it("parses valid quick quote object", () => {
    const result = parseQuickQuote(validQuickQuote());
    expect(result.loanAmount).toBe(800000);
    expect(result.fico).toBe(740);
    expect(result.occupancy).toBe("Primary");
  });

  it("throws ConfigValidationError for invalid input", () => {
    expect(() => parseQuickQuote({ loanAmount: "not a number" })).toThrow(ConfigValidationError);
  });

  it("requires minimum fields", () => {
    expect(() => parseQuickQuote({ loanAmount: 500000 })).toThrow(ConfigValidationError);
  });

  it("throws ConfigValidationError for negative money", () => {
    expect(() => parseQuickQuote(validQuickQuote({ loanAmount: -100 }))).toThrow(
      ConfigValidationError,
    );
  });

  it("throws ConfigValidationError for non-finite numbers", () => {
    expect(() => parseQuickQuote(validQuickQuote({ loanAmount: Infinity }))).toThrow(
      ConfigValidationError,
    );
  });

  it("throws ConfigValidationError for invalid FICO", () => {
    expect(() => parseQuickQuote(validQuickQuote({ fico: 100 }))).toThrow(ConfigValidationError);
  });
});

// ---------------------------------------------------------------------------
// Loader-level: parseConfig
// ---------------------------------------------------------------------------

describe("parseConfig", () => {
  it("parses valid transaction config", () => {
    const result = parseConfig({ transaction: validTransaction() });
    expect(result.transaction).toBeDefined();
    expect(result.transaction?.id).toBe("txn-1");
  });

  it("throws ConfigValidationError for invalid transaction FICO", () => {
    expect(() =>
      parseConfig({
        transaction: validTransaction({
          borrowers: [validBorrower({ fico: 100 })],
        }),
      }),
    ).toThrow(ConfigValidationError);
  });

  it("throws ConfigValidationError for negative loan amount", () => {
    expect(() =>
      parseConfig({
        transaction: validTransaction({
          scenario: validScenario({ requestedLoanAmount: -5000 }),
        }),
      }),
    ).toThrow(ConfigValidationError);
  });

  it("throws ConfigValidationError for Infinity in money fields", () => {
    expect(() =>
      parseConfig({
        transaction: validTransaction({
          scenario: validScenario({
            requestedLoanAmount: Infinity,
          }),
        }),
      }),
    ).toThrow(ConfigValidationError);
  });

  it("throws ConfigValidationError for cross-field inconsistency", () => {
    expect(() =>
      parseConfig({
        transaction: validTransaction({
          scenario: validScenario({
            requestedLoanAmount: 500000,
            purchasePrice: 1000000,
            downPayment: 200000,
          }),
        }),
      }),
    ).toThrow(ConfigValidationError);
  });
});

// ---------------------------------------------------------------------------
// ConfigValidationError structure
// ---------------------------------------------------------------------------

describe("ConfigValidationError", () => {
  it("contains validation details and path", () => {
    const error = new ConfigValidationError("fieldPath", "validation message");
    expect(error.message).toContain("fieldPath");
    expect(error.message).toContain("validation message");
    expect(error.path).toBe("fieldPath");
    expect(error.details).toBe("validation message");
    expect(error.name).toBe("ConfigValidationError");
  });

  it("carries structured issues array", () => {
    const issues = [
      { path: "scenario.fico", message: "Too low" },
      { path: "scenario.loan", message: "Negative" },
    ];
    const error = new ConfigValidationError("config", "details", issues);
    expect(error.issues).toHaveLength(2);
    expect(error.issues[0]?.path).toBe("scenario.fico");
  });

  it("issues are frozen (immutable)", () => {
    const error = new ConfigValidationError("config", "details", [{ path: "a", message: "b" }]);
    expect(() => {
      (error.issues as ConfigValidationIssue[]).push({
        path: "c",
        message: "d",
      });
    }).toThrow();
  });

  it("formatReport produces human-readable output", () => {
    const error = new ConfigValidationError("config", "details", [
      { path: "scenario.fico", message: "FICO minimum is 300" },
    ]);
    const report = error.formatReport();
    expect(report).toContain("config");
    expect(report).toContain("scenario.fico");
    expect(report).toContain("FICO minimum is 300");
  });
});

// We need the import for the frozen-array test above
import type { ConfigValidationIssue } from "../errors";

describe("configErrorFromZod", () => {
  it("creates ConfigValidationError from ZodError with structured issues", () => {
    const schema = z.object({ age: z.number().int().min(0) });
    const result = schema.safeParse({ age: -1 });
    if (!result.success) {
      const error = configErrorFromZod("user", result.error);
      expect(error).toBeInstanceOf(ConfigValidationError);
      expect(error.path).toBe("user");
      expect(error.issues.length).toBeGreaterThan(0);
      expect(error.issues[0]?.path).toContain("age");
    }
  });
});

describe("zodErrorToIssues", () => {
  it("includes rootPath prefix in issue paths", () => {
    const schema = z.object({ name: z.string().min(1) });
    const result = schema.safeParse({ name: "" });
    if (!result.success) {
      const issues = zodErrorToIssues(result.error, "config.borrower");
      expect(issues[0]?.path).toBe("config.borrower.name");
    }
  });
});

// ---------------------------------------------------------------------------
// Non-finite number edge cases across schemas
// ---------------------------------------------------------------------------

describe("non-finite number rejection across schemas", () => {
  it("rejects NaN in ratePctSchema", () => {
    expect(() => ratePctSchema.parse(NaN)).toThrow();
  });

  it("rejects -Infinity in moneySchema", () => {
    expect(() => moneySchema.parse(-Infinity)).toThrow();
  });

  it("rejects NaN in ratioSchema", () => {
    expect(() => ratioSchema.parse(NaN)).toThrow();
  });

  it("rejects Infinity in monthsSchema", () => {
    expect(() => monthsSchema.parse(Infinity)).toThrow();
  });

  it("rejects NaN in unitsSchema", () => {
    expect(() => unitsSchema.parse(NaN)).toThrow();
  });

  it("rejects NaN in ficoSchema", () => {
    expect(() => ficoSchema.parse(NaN)).toThrow();
  });
});
