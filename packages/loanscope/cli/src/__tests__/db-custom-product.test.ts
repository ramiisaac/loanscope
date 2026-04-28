import { describe, expect, it } from "vitest";
import { DatabaseManager } from "@loanscope/db";
import { dumpYaml } from "@loanscope/config";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  createCustomProductSetAction,
  deleteCustomProductSetAction,
  listCustomProductSetsAction,
  readProductsFile,
  requireCustomProductSet,
  showCustomProductSetAction,
  validateCustomProductSetAction,
} from "../commands/custom-product";
import { CliValidationError } from "../cli-error";
// ---------------------------------------------------------------------------
// Command registration
// ---------------------------------------------------------------------------

describe("custom-product actions", () => {
  const fixedNow = new Date(Date.UTC(2026, 0, 10, 12, 0, 0));

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
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "loanscope-cp-"));
    const filePath = path.join(dir, `products${extension}`);
    fs.writeFileSync(filePath, contents, "utf8");
    return filePath;
  };

  const writeYamlFile = (payload: unknown): string => {
    const dumped = dumpYamlForTest(payload);
    return writeTempFile(dumped, ".yaml");
  };

  const writeJsonFile = (payload: unknown): string =>
    writeTempFile(JSON.stringify(payload, null, 2), ".json");

  const dumpYamlForTest = (value: unknown): string => dumpYaml(value);

  it("creates a custom product set from a YAML file", () => {
    const manager = DatabaseManager.memory();
    const filePath = writeYamlFile({
      products: [validProduct("sample_a", "Sample A")],
    });

    const result = createCustomProductSetAction(manager, {
      filePath,
      name: "Smoke Set",
      now: fixedNow,
    });

    expect(result.setId).toBe("smoke-set-20260110120000");
    expect(result.productCount).toBe(1);
    expect(result.validationStatus).toBe("valid");
    const stored = manager.customProducts.getSet(result.setId);
    expect(stored?.products).toHaveLength(1);
    expect(stored?.products[0]?.id).toBe("sample_a");
  });

  it("creates a custom product set from a JSON file", () => {
    const manager = DatabaseManager.memory();
    const filePath = writeJsonFile({
      products: [validProduct("sample_json", "Sample JSON")],
    });

    const result = createCustomProductSetAction(manager, {
      filePath,
      name: "JSON Set",
      setId: "json-set",
    });

    expect(result.setId).toBe("json-set");
    expect(result.validationStatus).toBe("valid");
  });

  it("rejects a file with no top-level products array", () => {
    const manager = DatabaseManager.memory();
    const filePath = writeYamlFile({ nothing: "here" });

    expect(() =>
      createCustomProductSetAction(manager, {
        filePath,
        name: "Missing",
        now: fixedNow,
      }),
    ).toThrow(CliValidationError);
    expect(() =>
      createCustomProductSetAction(manager, {
        filePath,
        name: "Missing",
        now: fixedNow,
      }),
    ).toThrow(/top-level .products. array/);
  });

  it("rejects unsupported file extensions", () => {
    const manager = DatabaseManager.memory();
    const filePath = writeTempFile("products: []", ".txt");

    expect(() =>
      createCustomProductSetAction(manager, {
        filePath,
        name: "Bad Ext",
        now: fixedNow,
      }),
    ).toThrow(CliValidationError);
    expect(() =>
      createCustomProductSetAction(manager, {
        filePath,
        name: "Bad Ext",
        now: fixedNow,
      }),
    ).toThrow(/Unsupported product file extension/);
  });

  it("aggregates structural validation errors across products", () => {
    const manager = DatabaseManager.memory();
    const bad = validProduct("", "");
    // Strip variants so we accumulate more than one message per product.
    (bad as { variants: unknown[] }).variants = [];
    const filePath = writeYamlFile({
      products: [bad, { ...validProduct("ok", "OK"), channel: "Farm" }],
    });

    let caught: unknown;
    try {
      createCustomProductSetAction(manager, {
        filePath,
        name: "Invalid Set",
        now: fixedNow,
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(CliValidationError);
    const message = (caught as CliValidationError).message;
    expect(message).toContain("failed structural validation");
    expect(message).toContain("Product id must be a non-empty string");
    expect(message).toContain("Product name must be a non-empty string");
    expect(message).toContain("Product must have at least one variant");
    expect(message).toContain('Invalid channel "Farm"');
  });

  it("round-trips list / show / validate / delete", () => {
    const manager = DatabaseManager.memory();
    const filePath = writeYamlFile({
      products: [validProduct("round_a", "Round A"), validProduct("round_b", "Round B")],
    });
    const created = createCustomProductSetAction(manager, {
      filePath,
      name: "Round Trip",
      setId: "round-trip",
    });

    const listed = listCustomProductSetsAction(manager, { output: "text" });
    expect(listed).toContain("round-trip");
    expect(listed).toContain("Round Trip");
    expect(listed).toContain("[valid]");

    const listedJson = listCustomProductSetsAction(manager, { output: "json" });
    const parsedList = JSON.parse(listedJson) as Array<{
      setId: string;
      productCount: number;
    }>;
    expect(parsedList).toHaveLength(1);
    expect(parsedList[0]?.setId).toBe("round-trip");
    expect(parsedList[0]?.productCount).toBe(2);

    const shown = showCustomProductSetAction(manager, {
      setId: created.setId,
      output: "text",
    });
    expect(shown).toContain("round-trip");
    expect(shown).toContain("round_a");
    expect(shown).toContain("round_b");

    const shownJson = showCustomProductSetAction(manager, {
      setId: created.setId,
      output: "json",
    });
    const parsedShow = JSON.parse(shownJson) as {
      setId: string;
      products: Array<{ id: string }>;
    };
    expect(parsedShow.setId).toBe("round-trip");
    expect(parsedShow.products.map((p) => p.id)).toEqual(["round_a", "round_b"]);

    const validated = validateCustomProductSetAction(manager, {
      setId: created.setId,
    });
    expect(validated.validationStatus).toBe("valid");
    expect(validated.message).toContain("round-trip");

    const deleteMessage = deleteCustomProductSetAction(manager, {
      setId: created.setId,
    });
    expect(deleteMessage).toContain("round-trip");
    expect(manager.customProducts.getSet(created.setId)).toBeUndefined();
  });

  it("validate transitions an initially-invalid set to valid after repair", () => {
    // We create a set directly via the service bypassing CLI structural
    // gating so that validationStatus can legitimately be "invalid", then
    // mutate the stored row's products and re-validate.
    const manager = DatabaseManager.memory();
    const createdBad = manager.customProducts.createSet({
      setId: "fixme",
      name: "Fix Me",
      products: [
        // Intentionally invalid: missing name, empty variants.
        {
          id: "broken",
          name: "",
          loanType: "Conventional",
          channel: "Agency",
          variants: [],
        } as unknown as import("@loanscope/domain").ProductDefinition,
      ],
    });
    expect(createdBad.validationStatus).toBe("invalid");

    const firstCheck = validateCustomProductSetAction(manager, {
      setId: "fixme",
    });
    expect(firstCheck.validationStatus).toBe("invalid");

    // Replace with a structurally-valid payload via the repository layer,
    // then re-validate.
    manager.customProducts.deleteSet("fixme");
    manager.customProducts.createSet({
      setId: "fixme",
      name: "Fix Me",
      products: [
        validProduct(
          "repaired",
          "Repaired",
        ) as unknown as import("@loanscope/domain").ProductDefinition,
      ],
    });
    const secondCheck = validateCustomProductSetAction(manager, {
      setId: "fixme",
    });
    expect(secondCheck.validationStatus).toBe("valid");
  });

  it("show after delete throws CliValidationError", () => {
    const manager = DatabaseManager.memory();
    const filePath = writeYamlFile({
      products: [validProduct("gone", "Gone")],
    });
    const created = createCustomProductSetAction(manager, {
      filePath,
      name: "Gone",
      setId: "gone",
    });
    deleteCustomProductSetAction(manager, { setId: created.setId });
    expect(() =>
      showCustomProductSetAction(manager, {
        setId: created.setId,
        output: "text",
      }),
    ).toThrow(CliValidationError);
  });

  it("requireCustomProductSet throws CliValidationError for an unknown id", () => {
    const manager = DatabaseManager.memory();
    expect(() => requireCustomProductSet(manager, "missing")).toThrow(CliValidationError);
  });

  it("readProductsFile rejects malformed JSON with a CliValidationError", () => {
    const filePath = writeTempFile("{not valid json", ".json");
    expect(() => readProductsFile(filePath)).toThrow(CliValidationError);
    expect(() => readProductsFile(filePath)).toThrow(/Failed to parse JSON product file/);
  });
});
