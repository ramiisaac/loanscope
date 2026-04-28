import type { EvaluationResult, GraphCheckResult, EdgeRegistry } from "@loanscope/graph";
import { ActionKind, CheckStatus, CheckSeverity, money, ratio } from "@loanscope/domain";
import type {
  AssetAllocationResult,
  CheckResult,
  Money,
  ProductDefinition,
  RatePct,
  Ratio,
  ScopedGraphCheckResult,
  ScopedGraphExecutionError,
  ScopedProductResult,
  ScopedRunResponse,
  Transaction,
  UnderwritingCheck,
  UnderwritingResult,
} from "@loanscope/domain";
import { ltvToLoanAmount } from "@loanscope/math";
import {
  computeEligibility,
  extractChecksFromGraph,
  extractFailureReasons,
  extractWarnings,
} from "./aggregators";
import { getAllEdges } from "@loanscope/calculations";

const edgeRegistry: EdgeRegistry = new Map(getAllEdges().map((edge) => [edge.id, edge]));

/**
 * Retrieves a value from the new EvaluationResult shape.
 * Checks result.inputs first, then result.computed.
 */
const getValue = <T>(result: EvaluationResult, nodeId: string): T | undefined => {
  const fromInputs = result.inputs[nodeId];
  if (fromInputs !== undefined) return fromInputs.value as T;
  const fromComputed = result.computed[nodeId];
  if (fromComputed !== undefined) return fromComputed.value as T;
  return undefined;
};

const setIfDefined = <T>(value: T | undefined, setter: (value: T) => void): void => {
  if (value !== undefined) {
    setter(value);
  }
};

/** Converts first-class GraphCheckResult to the scoped domain shape. */
const toScopedCheck = (gc: GraphCheckResult): ScopedGraphCheckResult => {
  const result: ScopedGraphCheckResult = {
    key: gc.key,
    status: gc.status as CheckStatus,
  };
  if (gc.actual !== undefined) result.actual = gc.actual;
  if (gc.limit !== undefined) result.limit = gc.limit;
  if (gc.message !== undefined) result.message = gc.message;
  if (gc.margin !== undefined) {
    const m: NonNullable<ScopedGraphCheckResult["margin"]> = {
      kind: gc.margin.kind as "Money" | "Ratio" | "Months",
      deltaToPass: gc.margin.deltaToPass,
    };
    if (gc.margin.actionHint !== undefined) m.actionHint = gc.margin.actionHint as ActionKind;
    result.margin = m;
  }
  if (gc.computedBy !== undefined) result.computedBy = gc.computedBy;
  if (gc.severity !== undefined) result.severity = gc.severity as CheckSeverity;
  return result;
};

/** Converts graph execution errors to scoped error shape. */
const toScopedErrors = (graphResult: EvaluationResult): ScopedGraphExecutionError[] =>
  graphResult.errors.map((err) => ({
    edgeId: err.edgeId,
    message: err.message,
    ...(err.code !== undefined ? { code: err.code } : {}),
    ...(err.nodeIds !== undefined ? { nodeIds: err.nodeIds } : {}),
  }));

/**
 * Computes unlocksFeatures for a blocked node by finding all downstream
 * output node IDs that the blocked node feeds into.
 */
const computeUnlocksFeatures = (blockedNodeId: string, graphResult: EvaluationResult): string[] => {
  const features: string[] = [];
  const computedKeys = new Set(Object.keys(graphResult.computed));
  const checkKeys = new Set(Object.keys(graphResult.checks));

  for (const otherBlocked of graphResult.blocked) {
    if (otherBlocked.nodeId !== blockedNodeId) {
      if (otherBlocked.missingInputs.includes(blockedNodeId)) {
        features.push(otherBlocked.nodeId);
      }
    }
  }

  for (const key of computedKeys) {
    const entry = graphResult.computed[key];
    if (entry?.trace && entry.trace.includes(blockedNodeId)) {
      features.push(key);
    }
  }

  for (const key of checkKeys) {
    const entry = graphResult.checks[key];
    if (entry?.computedBy) {
      features.push(key);
    }
  }

  return [...new Set(features)];
};

/**
 * Canonical full-underwriting predicate.
 * Full underwriting is available when:
 * 1. Variant resolved successfully (product result has a variantId)
 * 2. No blocker-path graph execution errors
 * 3. All blocker checks were computed
 * 4. Eligibility was determined from first-class checks
 * 5. All key derived values are present
 */
const isFullyComputable = (
  graphResult: EvaluationResult,
  variantId: string | undefined,
): boolean => {
  if (!variantId) return false;

  const blockerEdgeIds = new Set<string>();
  const blockerOutputNodeIds = new Set<string>();
  for (const [edgeId, edge] of edgeRegistry) {
    if (edge.metadata?.severity === "blocker") {
      blockerEdgeIds.add(edgeId);
      for (const output of edge.outputs) {
        blockerOutputNodeIds.add(output);
      }
    }
  }

  for (const err of graphResult.errors) {
    if (blockerEdgeIds.has(err.edgeId)) return false;
  }

  const computedCheckNodeIds = new Set(Object.keys(graphResult.checks));
  const blockedNodeIds = new Set(graphResult.blocked.map((b) => b.nodeId));
  for (const requiredNodeId of blockerOutputNodeIds) {
    if (!computedCheckNodeIds.has(requiredNodeId) && blockedNodeIds.has(requiredNodeId)) {
      return false;
    }
  }

  if (Object.keys(graphResult.checks).length === 0) return false;

  const hasLoanAmount = getValue(graphResult, "loanAmount") !== undefined;
  const hasDti = getValue(graphResult, "dti") !== undefined;
  const hasLtv = getValue(graphResult, "ltv") !== undefined;
  const hasIncome = getValue(graphResult, "qualifyingIncomeMonthly") !== undefined;

  return hasLoanAmount && hasDti && hasLtv && hasIncome;
};

export const extractScopedProductResult = (
  product: ProductDefinition,
  graphResult: EvaluationResult,
  variantId?: string,
): ScopedProductResult => {
  const loanAmount = getValue<Money>(graphResult, "loanAmount") ?? money(0);
  const propertyValue = getValue<Money>(graphResult, "propertyValue") ?? money(0);
  const ltv = getValue<Ratio>(graphResult, "ltv");
  const cltv = getValue<Ratio>(graphResult, "cltv");
  const dti = getValue<Ratio>(graphResult, "dti");
  const downPayment = getValue<Money>(graphResult, "downPayment") ?? money(0);
  const pitiMonthly = getValue<Money>(graphResult, "pitiMonthly");
  const assetAllocation = getValue<AssetAllocationResult>(graphResult, "assetAllocation");
  const reservesCheck = getValue<CheckResult>(graphResult, "reservesCheck");
  const qualifyingPayment = getValue<Money>(graphResult, "qualifyingPayment");
  const noteRatePct = getValue<RatePct>(graphResult, "noteRatePct");

  const result: ScopedProductResult = {
    productId: product.id,
    productName: product.name,
  };

  if (variantId) {
    result.variantId = variantId;
  }

  if (qualifyingPayment && noteRatePct) {
    result.pricing = { payment: qualifyingPayment, rate: noteRatePct };
  }

  if (ltv) {
    const ltvResult: NonNullable<ScopedProductResult["ltv"]> = {
      ltvPct: ltv,
      downPayment,
      maxLoanByLTV: ltvToLoanAmount(ltv, propertyValue),
    };
    setIfDefined(cltv, (value) => {
      ltvResult.cltvPct = value;
    });
    result.ltv = ltvResult;
  }

  if (dti) {
    result.dti = {
      dtiPct: dti,
      maxLoanByDTI: loanAmount,
    };
  }

  if (pitiMonthly) {
    result.housing = {
      pitiMonthly,
      fullDTI: dti ?? ratio(0),
    };
  }

  if (assetAllocation) {
    result.cash = {
      cashToClose: assetAllocation.totalRequired,
      assetAllocation,
      reservesCheck: reservesCheck ?? { status: CheckStatus.PASS },
    };
  }

  const scopedChecks = Object.values(graphResult.checks).map(toScopedCheck);
  if (scopedChecks.length > 0) {
    result.checks = scopedChecks;
  }

  const checks = extractChecksFromGraph(graphResult);
  const eligible = computeEligibility(graphResult, edgeRegistry);

  if (isFullyComputable(graphResult, variantId)) {
    result.full = buildFullUnderwritingResult(product, variantId, graphResult, checks, eligible);
  }

  return result;
};

/** Conditionally includes a property only when the value is non-nullish. */
function optionalProp<K extends string, V>(
  key: K,
  value: V | null | undefined,
): { [P in K]: V } | Record<string, never> {
  if (value != null) return { [key]: value } as { [P in K]: V };
  return {} as Record<string, never>;
}

/** Builds the full UnderwritingResult when the evaluation is fully computable. */
const buildFullUnderwritingResult = (
  product: ProductDefinition,
  variantId: string | undefined,
  graphResult: EvaluationResult,
  checks: UnderwritingCheck[],
  eligible: boolean,
): UnderwritingResult => ({
  productId: product.id,
  productName: product.name,
  variantId: variantId ?? "unknown",
  eligible,
  checks,
  failureReasons: extractFailureReasons(checks),
  warnings: extractWarnings(checks),
  derived: {
    loanAmount: getValue<Money>(graphResult, "loanAmount") ?? money(0),
    cashFlow: {
      qualifyingIncomeMonthly: getValue<Money>(graphResult, "qualifyingIncomeMonthly") ?? money(0),
      liabilitiesMonthly: getValue<Money>(graphResult, "monthlyLiabilities") ?? money(0),
      pitiMonthly: getValue<Money>(graphResult, "pitiMonthly") ?? money(0),
      dtiBackEndRatio: getValue<Ratio>(graphResult, "dti") ?? ratio(0),
    },
    assetAllocation: getValue<AssetAllocationResult>(graphResult, "assetAllocation") ?? {
      fundsToCloseRequired: money(0),
      payoffsRequired: money(0),
      totalRequired: money(0),
      used: [],
      remainingReservesDollars: money(0),
    },
    ...optionalProp("ltvRatio", getValue<Ratio>(graphResult, "ltv")),
    ...optionalProp("cltvRatio", getValue<Ratio>(graphResult, "cltv")),
    ...optionalProp(
      "requiredReservesDollars",
      getValue<Money>(graphResult, "requiredReservesDollars"),
    ),
    ...optionalProp("qualifyingPayment", getValue<Money>(graphResult, "qualifyingPayment")),
  },
});

export const buildScopedResponse = (
  transaction: Transaction,
  products: ProductDefinition[],
  graphResult: EvaluationResult,
  variantId?: string,
): ScopedRunResponse => {
  return {
    inputScope: graphResult.inputScope,
    effectiveScope: graphResult.effectiveScope,
    blocked: graphResult.blocked.map((blocked) => ({
      nodeId: blocked.nodeId,
      missingInputs: blocked.missingInputs,
      unlocksFeatures: computeUnlocksFeatures(blocked.nodeId, graphResult),
    })),
    estimatesUsed: graphResult.estimatesUsed.map((est) => ({
      field: est.nodeId,
      value: est.value,
      source: est.estimatedBy,
    })),
    errors: toScopedErrors(graphResult),
    products: products.map((product) =>
      extractScopedProductResult(product, graphResult, variantId),
    ),
  };
};
