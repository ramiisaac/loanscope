import { describe, expect, it } from "vitest";
import { slugify, timestampSuffix, buildId } from "../ids";
import { CliValidationError } from "../cli-error";
import {
  parseCliEnum,
  parseCliAmortizationTerm,
  parseCliArmFixedPeriod,
  parseCliOccupancy,
  parseCliLoanPurpose,
  parseCliPropertyType,
  parseCliLoanType,
  parseCliProgramKind,
} from "../cli-parsers";
import {
  parseCliMoney,
  parseCliRatio,
  parseCliRatePct,
  parseCliMonths,
  parseCliFico,
  parseCliUnits,
  parseCliPositiveNumber,
} from "../cli-parsers";
import { parseCliRange, parseCliList, parseCliNumberList, parseBorrowerSets } from "../cli-parsers";
import {
  validateLenderId,
  validateLenderIds,
  validateProductId,
  validateProductIds,
  validateGoalSeekBounds,
  validateGoalSeekTolerance,
} from "../cli-validators";
import { parseCliOutputFormat, parseScenarioPayloadFormat } from "../format-parsers";
import {
  Occupancy,
  LoanPurpose,
  PropertyType,
  LoanType,
  ArmFixedPeriod,
  ProgramKind,
} from "@loanscope/domain";
// ---------------------------------------------------------------------------
// Command registration
// ---------------------------------------------------------------------------

describe("parseCliMoney", () => {
  it("parses a valid money amount", () => {
    expect(parseCliMoney("500000", "loan")).toBe(500000);
  });

  it("parses zero as valid", () => {
    expect(parseCliMoney("0", "loan")).toBe(0);
  });

  it("parses a decimal money amount", () => {
    expect(parseCliMoney("123456.78", "loan")).toBeCloseTo(123456.78);
  });

  it("rejects NaN", () => {
    expect(() => parseCliMoney("abc", "loan")).toThrow(CliValidationError);
    expect(() => parseCliMoney("abc", "loan")).toThrow("not a finite number");
  });

  it("rejects empty string", () => {
    expect(() => parseCliMoney("", "loan")).toThrow(CliValidationError);
  });

  it("rejects Infinity", () => {
    expect(() => parseCliMoney("Infinity", "loan")).toThrow(CliValidationError);
    expect(() => parseCliMoney("Infinity", "loan")).toThrow("not a finite number");
  });

  it("rejects negative values", () => {
    expect(() => parseCliMoney("-100", "loan")).toThrow(CliValidationError);
    expect(() => parseCliMoney("-100", "loan")).toThrow("non-negative");
  });
});

describe("parseCliRatio", () => {
  it("parses a valid ratio", () => {
    expect(parseCliRatio("0.75", "LTV")).toBe(0.75);
  });

  it("parses boundary value 0", () => {
    expect(parseCliRatio("0", "LTV")).toBe(0);
  });

  it("parses boundary value 1", () => {
    expect(parseCliRatio("1", "LTV")).toBe(1);
  });

  it("rejects ratio below 0", () => {
    expect(() => parseCliRatio("-0.1", "LTV")).toThrow(CliValidationError);
    expect(() => parseCliRatio("-0.1", "LTV")).toThrow("between 0 and 1");
  });

  it("rejects ratio above 1", () => {
    expect(() => parseCliRatio("1.5", "LTV")).toThrow(CliValidationError);
    expect(() => parseCliRatio("1.5", "LTV")).toThrow("between 0 and 1");
  });

  it("rejects non-numeric", () => {
    expect(() => parseCliRatio("abc", "LTV")).toThrow(CliValidationError);
  });
});

describe("parseCliRatePct", () => {
  it("parses a valid rate", () => {
    expect(parseCliRatePct("6.5", "rate")).toBe(6.5);
  });

  it("parses zero rate", () => {
    expect(parseCliRatePct("0", "rate")).toBe(0);
  });

  it("rejects negative rate", () => {
    expect(() => parseCliRatePct("-1", "rate")).toThrow(CliValidationError);
    expect(() => parseCliRatePct("-1", "rate")).toThrow("between 0 and 30");
  });

  it("rejects rate above 30", () => {
    expect(() => parseCliRatePct("31", "rate")).toThrow(CliValidationError);
    expect(() => parseCliRatePct("31", "rate")).toThrow("between 0 and 30");
  });

  it("rejects non-numeric", () => {
    expect(() => parseCliRatePct("abc", "rate")).toThrow(CliValidationError);
  });
});

describe("program and ARM CLI parsing", () => {
  it("parses program kind case-insensitively", () => {
    expect(parseCliProgramKind("arm")).toBe(ProgramKind.ARM);
    expect(parseCliProgramKind("Fixed")).toBe(ProgramKind.Fixed);
  });

  it("parses valid ARM fixed periods", () => {
    expect(parseCliArmFixedPeriod("60")).toBe(ArmFixedPeriod.M60);
    expect(parseCliArmFixedPeriod("84")).toBe(ArmFixedPeriod.M84);
    expect(parseCliArmFixedPeriod("120")).toBe(ArmFixedPeriod.M120);
  });

  it("rejects unsupported ARM fixed periods", () => {
    expect(() => parseCliArmFixedPeriod("72")).toThrow(CliValidationError);
  });
});

describe("parseCliMonths", () => {
  it("parses a valid month count", () => {
    expect(parseCliMonths("360", "term")).toBe(360);
  });

  it("rejects zero", () => {
    expect(() => parseCliMonths("0", "term")).toThrow(CliValidationError);
    expect(() => parseCliMonths("0", "term")).toThrow("positive integer");
  });

  it("rejects negative", () => {
    expect(() => parseCliMonths("-12", "term")).toThrow(CliValidationError);
  });

  it("rejects non-integer", () => {
    expect(() => parseCliMonths("360.5", "term")).toThrow(CliValidationError);
    expect(() => parseCliMonths("360.5", "term")).toThrow("positive integer");
  });

  it("rejects non-numeric", () => {
    expect(() => parseCliMonths("abc", "term")).toThrow(CliValidationError);
  });
});

describe("parseCliFico", () => {
  it("parses a valid FICO score", () => {
    expect(parseCliFico("740")).toBe(740);
  });

  it("accepts boundary 300", () => {
    expect(parseCliFico("300")).toBe(300);
  });

  it("accepts boundary 850", () => {
    expect(parseCliFico("850")).toBe(850);
  });

  it("rejects below 300", () => {
    expect(() => parseCliFico("299")).toThrow(CliValidationError);
    expect(() => parseCliFico("299")).toThrow("between 300 and 850");
  });

  it("rejects above 850", () => {
    expect(() => parseCliFico("851")).toThrow(CliValidationError);
    expect(() => parseCliFico("851")).toThrow("between 300 and 850");
  });

  it("rejects non-integer", () => {
    expect(() => parseCliFico("740.5")).toThrow(CliValidationError);
  });

  it("rejects non-numeric", () => {
    expect(() => parseCliFico("abc")).toThrow(CliValidationError);
  });

  it("rejects NaN", () => {
    expect(() => parseCliFico("NaN")).toThrow(CliValidationError);
  });

  it("rejects negative", () => {
    expect(() => parseCliFico("-100")).toThrow(CliValidationError);
  });
});

describe("parseCliUnits", () => {
  it("parses valid unit counts 1-4", () => {
    expect(parseCliUnits("1")).toBe(1);
    expect(parseCliUnits("2")).toBe(2);
    expect(parseCliUnits("3")).toBe(3);
    expect(parseCliUnits("4")).toBe(4);
  });

  it("rejects 0", () => {
    expect(() => parseCliUnits("0")).toThrow(CliValidationError);
    expect(() => parseCliUnits("0")).toThrow("1, 2, 3, or 4");
  });

  it("rejects 5", () => {
    expect(() => parseCliUnits("5")).toThrow(CliValidationError);
  });

  it("rejects non-numeric", () => {
    expect(() => parseCliUnits("abc")).toThrow(CliValidationError);
  });
});

describe("parseCliPositiveNumber", () => {
  it("parses a valid positive number", () => {
    expect(parseCliPositiveNumber("100000", "bound")).toBe(100000);
  });

  it("parses zero", () => {
    expect(parseCliPositiveNumber("0", "bound")).toBe(0);
  });

  it("rejects negative", () => {
    expect(() => parseCliPositiveNumber("-1", "bound")).toThrow(CliValidationError);
  });

  it("rejects non-numeric", () => {
    expect(() => parseCliPositiveNumber("xyz", "bound")).toThrow(CliValidationError);
  });
});

describe("parseCliEnum", () => {
  it("parses an exact enum value", () => {
    expect(parseCliEnum("Primary", Occupancy, "occupancy")).toBe(Occupancy.Primary);
  });

  it("parses case-insensitively", () => {
    expect(parseCliEnum("primary", Occupancy, "occupancy")).toBe(Occupancy.Primary);
    expect(parseCliEnum("SECONDARY", Occupancy, "occupancy")).toBe(Occupancy.Secondary);
  });

  it("rejects invalid enum value", () => {
    expect(() => parseCliEnum("Bogus", Occupancy, "occupancy")).toThrow(CliValidationError);
    expect(() => parseCliEnum("Bogus", Occupancy, "occupancy")).toThrow("Valid values:");
  });

  it("includes enum name in error", () => {
    expect(() => parseCliEnum("Nope", LoanPurpose, "loan purpose")).toThrow(
      'Invalid loan purpose: "Nope"',
    );
  });
});

describe("parseCliOccupancy", () => {
  it("parses valid occupancy", () => {
    expect(parseCliOccupancy("Primary")).toBe(Occupancy.Primary);
    expect(parseCliOccupancy("Investment")).toBe(Occupancy.Investment);
  });

  it("rejects invalid occupancy", () => {
    expect(() => parseCliOccupancy("Farm")).toThrow(CliValidationError);
  });
});

describe("parseCliLoanPurpose", () => {
  it("parses valid loan purpose", () => {
    expect(parseCliLoanPurpose("Purchase")).toBe(LoanPurpose.Purchase);
    expect(parseCliLoanPurpose("CashOutRefi")).toBe(LoanPurpose.CashOutRefi);
  });

  it("rejects invalid loan purpose", () => {
    expect(() => parseCliLoanPurpose("Unknown")).toThrow(CliValidationError);
  });
});

describe("parseCliPropertyType", () => {
  it("parses valid property type", () => {
    expect(parseCliPropertyType("SFR")).toBe(PropertyType.SFR);
    expect(parseCliPropertyType("Condo")).toBe(PropertyType.Condo);
  });

  it("rejects invalid property type", () => {
    expect(() => parseCliPropertyType("Castle")).toThrow(CliValidationError);
  });
});

describe("parseCliLoanType", () => {
  it("parses valid loan type", () => {
    expect(parseCliLoanType("Jumbo")).toBe(LoanType.Jumbo);
    expect(parseCliLoanType("Conventional")).toBe(LoanType.Conventional);
  });

  it("rejects invalid loan type", () => {
    expect(() => parseCliLoanType("SuperJumbo")).toThrow(CliValidationError);
  });
});

describe("parseCliAmortizationTerm", () => {
  it("parses valid terms", () => {
    expect(parseCliAmortizationTerm("360")).toBe(360);
    expect(parseCliAmortizationTerm("180")).toBe(180);
    expect(parseCliAmortizationTerm("120")).toBe(120);
  });

  it("rejects invalid terms", () => {
    expect(() => parseCliAmortizationTerm("100")).toThrow(CliValidationError);
    expect(() => parseCliAmortizationTerm("100")).toThrow("Valid values:");
  });

  it("rejects non-numeric", () => {
    expect(() => parseCliAmortizationTerm("abc")).toThrow(CliValidationError);
  });
});

describe("parseCliRange", () => {
  it("parses a valid range", () => {
    const range = parseCliRange("0.75:0.95:0.05", "LTV");
    expect(range.min).toBeCloseTo(0.75);
    expect(range.max).toBeCloseTo(0.95);
    expect(range.step).toBeCloseTo(0.05);
  });

  it("rejects wrong number of parts", () => {
    expect(() => parseCliRange("0.75:0.95", "LTV")).toThrow(CliValidationError);
    expect(() => parseCliRange("0.75:0.95", "LTV")).toThrow("min:max:step");
  });

  it("rejects non-numeric parts", () => {
    expect(() => parseCliRange("abc:0.95:0.05", "LTV")).toThrow(CliValidationError);
  });

  it("rejects zero step", () => {
    expect(() => parseCliRange("0.5:0.9:0", "LTV")).toThrow(CliValidationError);
    expect(() => parseCliRange("0.5:0.9:0", "LTV")).toThrow("step must be positive");
  });

  it("rejects negative step", () => {
    expect(() => parseCliRange("0.5:0.9:-0.1", "LTV")).toThrow(CliValidationError);
  });

  it("rejects min > max", () => {
    expect(() => parseCliRange("0.95:0.75:0.05", "LTV")).toThrow(CliValidationError);
    expect(() => parseCliRange("0.95:0.75:0.05", "LTV")).toThrow("min");
  });
});

describe("parseCliList", () => {
  it("parses comma-separated items", () => {
    expect(parseCliList("a,b,c")).toEqual(["a", "b", "c"]);
  });

  it("trims whitespace", () => {
    expect(parseCliList(" a , b , c ")).toEqual(["a", "b", "c"]);
  });

  it("returns empty array for undefined", () => {
    expect(parseCliList(undefined)).toEqual([]);
  });

  it("filters empty items", () => {
    expect(parseCliList("a,,b")).toEqual(["a", "b"]);
  });
});

describe("parseCliNumberList", () => {
  it("parses comma-separated numbers", () => {
    expect(parseCliNumberList("360,180,120", "terms")).toEqual([360, 180, 120]);
  });

  it("rejects if any value is non-numeric", () => {
    expect(() => parseCliNumberList("360,abc,120", "terms")).toThrow(CliValidationError);
  });

  it("rejects empty list", () => {
    expect(() => parseCliNumberList("", "terms")).toThrow(CliValidationError);
    expect(() => parseCliNumberList("", "terms")).toThrow("at least one value");
  });
});

describe("validateLenderId", () => {
  const known = ["agency", "government", "portfolio", "uwm"];

  it("accepts known lender", () => {
    expect(() => validateLenderId("agency", known)).not.toThrow();
  });

  it("rejects unknown lender", () => {
    expect(() => validateLenderId("unknown_lender", known)).toThrow(CliValidationError);
    expect(() => validateLenderId("unknown_lender", known)).toThrow("Unknown lender");
    expect(() => validateLenderId("unknown_lender", known)).toThrow("Known lenders:");
  });
});

describe("validateLenderIds", () => {
  const known = ["agency", "government"];

  it("accepts all known", () => {
    expect(() => validateLenderIds(["agency", "government"], known)).not.toThrow();
  });

  it("rejects first unknown", () => {
    expect(() => validateLenderIds(["agency", "bad"], known)).toThrow(CliValidationError);
    expect(() => validateLenderIds(["agency", "bad"], known)).toThrow('"bad"');
  });
});

describe("validateProductId", () => {
  const known = ["conv_30", "jumbo_30", "fha_30"];

  it("accepts known product", () => {
    expect(() => validateProductId("conv_30", known)).not.toThrow();
  });

  it("rejects unknown product", () => {
    expect(() => validateProductId("bogus_product", known)).toThrow(CliValidationError);
    expect(() => validateProductId("bogus_product", known)).toThrow("Unknown product");
  });
});

describe("validateProductIds", () => {
  const known = ["conv_30", "jumbo_30"];

  it("accepts all known", () => {
    expect(() => validateProductIds(["conv_30"], known)).not.toThrow();
  });

  it("rejects unknown", () => {
    expect(() => validateProductIds(["conv_30", "nope"], known)).toThrow(CliValidationError);
  });
});

describe("validateGoalSeekBounds", () => {
  it("accepts valid bounds", () => {
    expect(() => validateGoalSeekBounds(100000, 2000000, "max-loan")).not.toThrow();
  });

  it("rejects negative min", () => {
    expect(() => validateGoalSeekBounds(-1, 2000000, "max-loan")).toThrow(CliValidationError);
    expect(() => validateGoalSeekBounds(-1, 2000000, "max-loan")).toThrow("non-negative");
  });

  it("rejects negative max", () => {
    expect(() => validateGoalSeekBounds(0, -1, "max-loan")).toThrow(CliValidationError);
  });

  it("rejects min >= max", () => {
    expect(() => validateGoalSeekBounds(2000000, 2000000, "max-loan")).toThrow(CliValidationError);
    expect(() => validateGoalSeekBounds(2000000, 2000000, "max-loan")).toThrow("less than max");
  });

  it("rejects min > max", () => {
    expect(() => validateGoalSeekBounds(3000000, 2000000, "max-loan")).toThrow(CliValidationError);
  });
});

describe("validateGoalSeekTolerance", () => {
  it("accepts valid tolerance", () => {
    expect(() => validateGoalSeekTolerance(0.01, "max-loan")).not.toThrow();
  });

  it("rejects zero tolerance", () => {
    expect(() => validateGoalSeekTolerance(0, "max-loan")).toThrow(CliValidationError);
    expect(() => validateGoalSeekTolerance(0, "max-loan")).toThrow("positive finite");
  });

  it("rejects negative tolerance", () => {
    expect(() => validateGoalSeekTolerance(-1, "max-loan")).toThrow(CliValidationError);
  });

  it("rejects Infinity tolerance", () => {
    expect(() => validateGoalSeekTolerance(Infinity, "max-loan")).toThrow(CliValidationError);
  });

  it("rejects NaN tolerance", () => {
    expect(() => validateGoalSeekTolerance(NaN, "max-loan")).toThrow(CliValidationError);
  });
});

describe("parseBorrowerSets", () => {
  it("parses semicolon-separated sets with pipe-separated ids", () => {
    expect(parseBorrowerSets("a|b;c|d")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("parses comma-separated ids within a set", () => {
    expect(parseBorrowerSets("a,b")).toEqual([["a", "b"]]);
  });

  it("handles array input", () => {
    expect(parseBorrowerSets(["a|b", "c"])).toEqual([["a", "b"], ["c"]]);
  });

  it("returns empty array for undefined", () => {
    expect(parseBorrowerSets(undefined)).toEqual([]);
  });

  it("filters empty segments", () => {
    expect(parseBorrowerSets("a|b;;")).toEqual([["a", "b"]]);
  });
});

describe("CliValidationError", () => {
  it("is an instance of Error", () => {
    const err = new CliValidationError("test");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(CliValidationError);
  });

  it("has the correct name", () => {
    const err = new CliValidationError("test");
    expect(err.name).toBe("CliValidationError");
  });

  it("preserves the message", () => {
    const err = new CliValidationError("something went wrong");
    expect(err.message).toBe("something went wrong");
  });
});

describe("combined validation edge cases", () => {
  it("parseCliMoney rejects special float values", () => {
    expect(() => parseCliMoney("NaN", "loan")).toThrow(CliValidationError);
    expect(() => parseCliMoney("-Infinity", "loan")).toThrow(CliValidationError);
  });

  it("parseCliRatio rejects NaN and Infinity", () => {
    expect(() => parseCliRatio("NaN", "LTV")).toThrow(CliValidationError);
    expect(() => parseCliRatio("Infinity", "LTV")).toThrow(CliValidationError);
  });

  it("parseCliMonths rejects NaN", () => {
    expect(() => parseCliMonths("NaN", "term")).toThrow(CliValidationError);
  });

  it("parseCliFico rejects Infinity", () => {
    expect(() => parseCliFico("Infinity")).toThrow(CliValidationError);
  });

  it("parseCliRange rejects four-part ranges", () => {
    expect(() => parseCliRange("1:2:3:4", "test")).toThrow(CliValidationError);
  });

  it("parseCliRange rejects single value", () => {
    expect(() => parseCliRange("42", "test")).toThrow(CliValidationError);
  });
});

describe("parseCliOutputFormat", () => {
  it("accepts 'table'", () => {
    expect(parseCliOutputFormat("table")).toBe("table");
  });

  it("accepts 'json'", () => {
    expect(parseCliOutputFormat("json")).toBe("json");
  });

  it("accepts 'csv'", () => {
    expect(parseCliOutputFormat("csv")).toBe("csv");
  });

  it("rejects unknown format", () => {
    expect(() => parseCliOutputFormat("xml")).toThrow(CliValidationError);
    expect(() => parseCliOutputFormat("xml")).toThrow(/Invalid output format/);
  });

  it("rejects empty string", () => {
    expect(() => parseCliOutputFormat("")).toThrow(CliValidationError);
  });
});

describe("slugify", () => {
  it("produces a kebab-case slug from a human label", () => {
    expect(slugify("Smith Family Refi")).toBe("smith-family-refi");
  });

  it("collapses runs of non-alphanumeric characters to single hyphens", () => {
    expect(slugify("  hello___world!! ")).toBe("hello-world");
  });

  it("strips diacritics via NFKD normalization", () => {
    expect(slugify("Café Déjà Vu")).toBe("cafe-deja-vu");
  });

  it("returns the fallback when the label has no usable characters", () => {
    expect(slugify("!!!", "scenario")).toBe("scenario");
    expect(slugify("")).toBe("item");
  });

  it("trims leading and trailing hyphens", () => {
    expect(slugify("---abc---")).toBe("abc");
  });
});

describe("timestampSuffix", () => {
  it("formats a UTC date as yyyymmddHHMMSS", () => {
    const d = new Date(Date.UTC(2026, 0, 10, 7, 5, 9));
    expect(timestampSuffix(d)).toBe("20260110070509");
  });

  it("zero-pads single-digit fields", () => {
    const d = new Date(Date.UTC(2026, 8, 3, 0, 0, 0));
    expect(timestampSuffix(d)).toBe("20260903000000");
  });

  it("produces a 14-character string by default", () => {
    expect(timestampSuffix()).toMatch(/^\d{14}$/);
  });
});

describe("buildId", () => {
  const fixedNow = new Date(Date.UTC(2026, 0, 10, 12, 0, 0));

  it("returns a derived slug suffixed with the timestamp when no explicit id is provided", () => {
    expect(
      buildId(undefined, "Smith Family Refi", {
        now: fixedNow,
        fallback: "scenario",
      }),
    ).toBe("smith-family-refi-20260110120000");
  });

  it("uses the explicit id when provided, trimmed", () => {
    expect(buildId("  custom-id  ", "ignored")).toBe("custom-id");
  });

  it("throws on an explicit id that trims to empty", () => {
    expect(() => buildId("   ", "label")).toThrow(CliValidationError);
  });

  it("falls back to the supplied fallback when the label has no usable characters", () => {
    expect(buildId(undefined, "!!!", { now: fixedNow, fallback: "scenario" })).toBe(
      "scenario-20260110120000",
    );
  });
});

describe("parseScenarioPayloadFormat", () => {
  it("accepts yaml and json", () => {
    expect(parseScenarioPayloadFormat("yaml")).toBe("yaml");
    expect(parseScenarioPayloadFormat("json")).toBe("json");
  });

  it("rejects any other value", () => {
    expect(() => parseScenarioPayloadFormat("xml")).toThrow(CliValidationError);
    expect(() => parseScenarioPayloadFormat("YAML")).toThrow(CliValidationError);
    expect(() => parseScenarioPayloadFormat("")).toThrow(CliValidationError);
  });
});
