import { describe, expect, it } from "vitest";
import { renderScopeAnalysis } from "../output";
import { formatMoney, formatRatio, formatRatePct } from "../output";
import { renderEvaluationCSV, renderGoalSeekCSV, renderSimulationCSV } from "../output";
import { CheckStatus, CheckSeverity, ActionKind, money, ratio, ratePct } from "@loanscope/domain";
import type { ScopedRunResponse } from "@loanscope/domain";
// ---------------------------------------------------------------------------
// Command registration
// ---------------------------------------------------------------------------

describe("renderScopeAnalysis", () => {
  const emptyResponse: ScopedRunResponse = {
    inputScope: [],
    effectiveScope: [],
    blocked: [],
    estimatesUsed: [],
    errors: [],
    products: [],
  };

  it("renders clean message for complete scope", () => {
    const output = renderScopeAnalysis(emptyResponse);
    expect(output).toContain("Scope complete");
  });

  it("renders blocked inputs with missing fields", () => {
    const response: ScopedRunResponse = {
      ...emptyResponse,
      blocked: [
        {
          nodeId: "dti",
          missingInputs: ["monthlyIncome", "monthlyDebts"],
          unlocksFeatures: ["full DTI analysis"],
        },
      ],
    };
    const output = renderScopeAnalysis(response);
    expect(output).toContain("Blocked");
    expect(output).toContain("dti");
    expect(output).toContain("monthlyIncome");
    expect(output).toContain("monthlyDebts");
    expect(output).toContain("Unlocks");
    expect(output).toContain("full DTI analysis");
  });

  it("renders empty missing-input lists as (none)", () => {
    const response: ScopedRunResponse = {
      ...emptyResponse,
      blocked: [
        {
          nodeId: "monthlyIncome",
          missingInputs: [],
          unlocksFeatures: ["fullUnderwriting"],
        },
      ],
    };

    const output = renderScopeAnalysis(response);

    expect(output).toContain("Missing: (none)");
  });

  it("renders errors from scoped evaluation", () => {
    const response: ScopedRunResponse = {
      ...emptyResponse,
      errors: [
        {
          edgeId: "edge-1",
          message: "Division by zero in DTI calc",
          code: "CALC_ERROR",
          nodeIds: ["node-a", "node-b"],
        },
      ],
    };
    const output = renderScopeAnalysis(response);
    expect(output).toContain("Errors");
    expect(output).toContain("Division by zero in DTI calc");
    expect(output).toContain("CALC_ERROR");
    expect(output).toContain("edge-1");
    expect(output).toContain("node-a");
  });

  it("renders estimates used", () => {
    const response: ScopedRunResponse = {
      ...emptyResponse,
      estimatesUsed: [
        { field: "annualTaxes", value: 6000, source: "county average" },
        { field: "annualInsurance", value: 1500, source: "default" },
      ],
    };
    const output = renderScopeAnalysis(response);
    expect(output).toContain("Estimates");
    expect(output).toContain("annualTaxes");
    expect(output).toContain("6000");
    expect(output).toContain("county average");
    expect(output).toContain("annualInsurance");
  });

  it("renders scope distinction", () => {
    const response: ScopedRunResponse = {
      ...emptyResponse,
      inputScope: ["ltv", "payment"],
      effectiveScope: ["ltv", "payment", "dti"],
    };
    const output = renderScopeAnalysis(response);
    expect(output).toContain("Scope");
    expect(output).toContain("Input scope:");
    expect(output).toContain("Effective scope:");
    expect(output).toContain("ltv");
    expect(output).toContain("dti");
    expect(output).toContain("Added by engine");
  });

  it("renders removed/blocked scope items", () => {
    const response: ScopedRunResponse = {
      ...emptyResponse,
      inputScope: ["ltv", "payment", "reserves"],
      effectiveScope: ["ltv", "payment"],
    };
    const output = renderScopeAnalysis(response);
    expect(output).toContain("Removed/blocked");
    expect(output).toContain("reserves");
  });

  it("renders check information for products", () => {
    const response: ScopedRunResponse = {
      ...emptyResponse,
      products: [
        {
          productId: "conv_30",
          productName: "Conv 30yr",
          checks: [
            {
              key: "maxLTV",
              status: CheckStatus.PASS,
              actual: "80%",
              limit: "95%",
              message: "LTV within limit",
            },
            {
              key: "maxDTI",
              status: CheckStatus.FAIL,
              actual: "50%",
              limit: "45%",
              message: "DTI exceeds limit",
              margin: {
                kind: "Ratio",
                deltaToPass: -0.05,
                actionHint: ActionKind.PayoffLiability,
              },
              severity: CheckSeverity.Blocker,
            },
            {
              key: "minFico",
              status: CheckStatus.WARN,
              actual: "640",
              limit: "680",
              message: "FICO below preferred",
              severity: CheckSeverity.Warning,
            },
          ],
        },
      ],
    };
    const output = renderScopeAnalysis(response);
    expect(output).toContain("Checks: Conv 30yr");
    expect(output).toContain("[PASS]");
    expect(output).toContain("maxLTV");
    expect(output).toContain("[FAIL]");
    expect(output).toContain("maxDTI");
    expect(output).toContain("Delta to pass");
    expect(output).toContain(ActionKind.PayoffLiability);
    expect(output).toContain("blocker");
    expect(output).toContain("[WARN]");
    expect(output).toContain("minFico");
  });

  it("renders product variant id in check header when present", () => {
    const response: ScopedRunResponse = {
      ...emptyResponse,
      products: [
        {
          productId: "conv_30",
          productName: "Conv 30yr",
          variantId: "variant-a",
          checks: [
            {
              key: "test",
              status: CheckStatus.PASS,
            },
          ],
        },
      ],
    };
    const output = renderScopeAnalysis(response);
    expect(output).toContain("Conv 30yr (variant-a)");
  });

  it("handles estimates with null/undefined values", () => {
    const response: ScopedRunResponse = {
      ...emptyResponse,
      estimatesUsed: [
        { field: "hoa", value: null, source: "default" },
        { field: "taxes", value: undefined, source: "default" },
      ],
    };
    const output = renderScopeAnalysis(response);
    expect(output).toContain("N/A");
  });
});

describe("JSON output structure for scoped responses", () => {
  it("serializes scope with blocked and estimates to JSON", () => {
    const response: ScopedRunResponse = {
      inputScope: ["ltv"],
      effectiveScope: ["ltv", "payment"],
      blocked: [
        {
          nodeId: "dti",
          missingInputs: ["monthlyIncome"],
          unlocksFeatures: ["DTI check"],
        },
      ],
      estimatesUsed: [{ field: "annualTaxes", value: 6000, source: "county-avg" }],
      errors: [
        {
          edgeId: "e1",
          message: "calc failed",
          code: "ERR_CALC",
        },
      ],
      products: [],
    };

    const json = JSON.stringify({ scope: response }, null, 2);
    const parsed = JSON.parse(json) as { scope: ScopedRunResponse };

    expect(parsed.scope.blocked).toHaveLength(1);
    expect(parsed.scope.blocked[0]!.nodeId).toBe("dti");
    expect(parsed.scope.blocked[0]!.missingInputs).toContain("monthlyIncome");

    expect(parsed.scope.estimatesUsed).toHaveLength(1);
    expect(parsed.scope.estimatesUsed[0]!.field).toBe("annualTaxes");
    expect(parsed.scope.estimatesUsed[0]!.value).toBe(6000);

    expect(parsed.scope.errors).toHaveLength(1);
    expect(parsed.scope.errors[0]!.code).toBe("ERR_CALC");

    expect(parsed.scope.inputScope).toEqual(["ltv"]);
    expect(parsed.scope.effectiveScope).toEqual(["ltv", "payment"]);
  });

  it("serializes empty scope cleanly", () => {
    const response: ScopedRunResponse = {
      inputScope: [],
      effectiveScope: [],
      blocked: [],
      estimatesUsed: [],
      errors: [],
      products: [],
    };

    const json = JSON.stringify({ scope: response }, null, 2);
    const parsed = JSON.parse(json) as { scope: ScopedRunResponse };

    expect(parsed.scope.blocked).toEqual([]);
    expect(parsed.scope.estimatesUsed).toEqual([]);
    expect(parsed.scope.errors).toEqual([]);
  });

  it("serializes scope with product checks to JSON", () => {
    const response: ScopedRunResponse = {
      inputScope: [],
      effectiveScope: [],
      blocked: [],
      estimatesUsed: [],
      errors: [],
      products: [
        {
          productId: "conv_30",
          productName: "Conv 30yr",
          checks: [
            {
              key: "maxLTV",
              status: CheckStatus.FAIL,
              actual: "96%",
              limit: "95%",
              message: "Over limit",
              margin: {
                kind: "Ratio",
                deltaToPass: -0.01,
                actionHint: ActionKind.AdjustDownPayment,
              },
              severity: CheckSeverity.Blocker,
            },
          ],
        },
      ],
    };

    const json = JSON.stringify({ scope: response }, null, 2);
    const parsed = JSON.parse(json) as { scope: ScopedRunResponse };

    expect(parsed.scope.products).toHaveLength(1);
    const product = parsed.scope.products[0]!;
    expect(product.checks).toHaveLength(1);
    expect(product.checks![0]!.key).toBe("maxLTV");
    expect(product.checks![0]!.status).toBe("FAIL");
    expect(product.checks![0]!.margin!.actionHint).toBe(ActionKind.AdjustDownPayment);
  });
});

describe("formatMoney", () => {
  it("formats a money value as USD", () => {
    expect(formatMoney(money(1000))).toBe("$1,000");
  });

  it("formats large amounts with commas", () => {
    expect(formatMoney(money(1250000))).toBe("$1,250,000");
  });

  it("returns dash for undefined", () => {
    expect(formatMoney(undefined)).toBe("-");
  });

  it("formats zero", () => {
    expect(formatMoney(money(0))).toBe("$0");
  });
});

describe("formatRatio", () => {
  it("formats a ratio as percentage", () => {
    const output = formatRatio(ratio(0.8));
    expect(output).toBe("80%");
  });

  it("formats fractional percentages", () => {
    const output = formatRatio(ratio(0.955));
    expect(output).toMatch(/95\.5/);
  });

  it("returns dash for undefined", () => {
    expect(formatRatio(undefined)).toBe("-");
  });
});

describe("formatRatePct", () => {
  it("formats a rate percentage with 3 decimals", () => {
    expect(formatRatePct(ratePct(6.5))).toBe("6.500%");
  });

  it("returns dash for undefined", () => {
    expect(formatRatePct(undefined)).toBe("-");
  });

  it("formats zero rate", () => {
    expect(formatRatePct(ratePct(0))).toBe("0.000%");
  });
});

describe("renderEvaluationCSV", () => {
  it("renders header row for empty groups", () => {
    const csv = renderEvaluationCSV([]);
    expect(csv).toBe("variant,product,eligible,warnings,ltv,dti,payment");
  });

  it("renders data rows with proper quoting", () => {
    const groups = [
      {
        variantLabel: "Fixed 30yr",
        results: [
          {
            productName: "Test Product",
            eligible: true,
            warnings: [],
            failureReasons: [],
            derived: {
              ltvRatio: ratio(0.8),
              qualifyingPayment: money(5000),
              cashFlow: { dtiBackEndRatio: ratio(0.35) },
            },
          },
        ],
      },
    ];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- minimal fixture
    const csv = renderEvaluationCSV(groups as any);
    const lines = csv.split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain("Test Product");
    expect(lines[1]).toContain("PASS");
  });
});

describe("renderGoalSeekCSV", () => {
  it("renders header and data row", () => {
    const csv = renderGoalSeekCSV({
      found: true,
      targetValue: 500000,
      iterations: 12,
      converged: true,
      finalResult: {} as never,
    });
    const lines = csv.split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe("found,target,iterations,converged");
    expect(lines[1]).toContain("yes");
    expect(lines[1]).toContain("500000.00");
  });
});

describe("renderSimulationCSV", () => {
  it("renders header for empty report", () => {
    const csv = renderSimulationCSV({
      perProductFixes: [],
      bestStates: [],
      statesExplored: 0,
      terminated: "complete",
    });
    expect(csv).toBe("product,eligible,actions,cashRequired");
  });
});
