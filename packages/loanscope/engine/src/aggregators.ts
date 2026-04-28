import type { CheckMargin, UnderwritingCheck } from "@loanscope/domain";
import { ActionKind, CheckStatus } from "@loanscope/domain";
import type { EvaluationResult, GraphCheckResult, EdgeRegistry } from "@loanscope/graph";

export const aggregateChecks = (
  checks: UnderwritingCheck[],
): { passed: number; failed: number; warned: number } => {
  return checks.reduce(
    (acc, check) => {
      if (check.status === CheckStatus.PASS) acc.passed += 1;
      else if (check.status === CheckStatus.FAIL) acc.failed += 1;
      else acc.warned += 1;
      return acc;
    },
    { passed: 0, failed: 0, warned: 0 },
  );
};

export const extractFailureReasons = (checks: UnderwritingCheck[]): string[] => {
  return checks
    .filter((check) => check.status === CheckStatus.FAIL)
    .map((check) => check.message ?? check.key);
};

export const extractWarnings = (checks: UnderwritingCheck[]): string[] => {
  return checks
    .filter((check) => check.status === CheckStatus.WARN)
    .map((check) => check.message ?? check.key);
};

/** All check edge IDs that carry blocker severity in the edge registry. */
const getBlockerCheckEdgeIds = (edgeRegistry: EdgeRegistry): Set<string> => {
  const ids = new Set<string>();
  for (const [edgeId, edge] of edgeRegistry) {
    if (edge.metadata?.severity === "blocker") {
      ids.add(edgeId);
    }
  }
  return ids;
};

/** All output node IDs produced by blocker-severity check edges. */
const getBlockerCheckOutputNodeIds = (edgeRegistry: EdgeRegistry): Set<string> => {
  const nodeIds = new Set<string>();
  for (const [, edge] of edgeRegistry) {
    if (edge.metadata?.severity === "blocker") {
      for (const output of edge.outputs) {
        nodeIds.add(output);
      }
    }
  }
  return nodeIds;
};

/**
 * Converts first-class GraphCheckResult entries into UnderwritingCheck[].
 * Consumes result.checks directly -- no heuristic scanning of values.
 */
export const extractChecksFromGraph = (evalResult: EvaluationResult): UnderwritingCheck[] => {
  const checks: UnderwritingCheck[] = [];
  for (const [, graphCheck] of Object.entries(evalResult.checks)) {
    checks.push(graphCheckToUnderwritingCheck(graphCheck));
  }
  return checks;
};

/** Converts the graph margin shape to the domain CheckMargin shape, narrowing actionHint. */
const toCheckMargin = (m: NonNullable<GraphCheckResult["margin"]>): CheckMargin => ({
  kind: m.kind,
  deltaToPass: m.deltaToPass,
  ...(m.actionHint !== undefined ? { actionHint: m.actionHint as ActionKind } : {}),
});

/** Maps a GraphCheckResult to the domain UnderwritingCheck shape. */
const graphCheckToUnderwritingCheck = (gc: GraphCheckResult): UnderwritingCheck => ({
  key: gc.key,
  status: gc.status as CheckStatus,
  ...(gc.actual !== undefined ? { actual: gc.actual } : {}),
  ...(gc.limit !== undefined ? { limit: gc.limit } : {}),
  ...(gc.message !== undefined ? { message: gc.message } : {}),
  ...(gc.margin !== undefined ? { margin: toCheckMargin(gc.margin) } : {}),
});

/**
 * Determines product eligibility from first-class graph checks.
 *
 * Eligibility is false when any of these conditions hold:
 * 1. A blocker-severity check explicitly FAILed.
 * 2. A blocker-severity check was expected but never computed, AND every one of
 *    its missing inputs was itself successfully resolved (provided or computed).
 *    This catches the case where a check edge should have fired but did not
 *    (likely a bug). Blocked checks whose missing inputs are themselves
 *    unresolved represent cascading unavailability from optional/unprovided
 *    data and do NOT trigger automatic ineligibility.
 * 3. Graph execution produced errors on blocker-severity check edges.
 * 4. No checks were computed at all (partial/empty evaluation).
 */
export const computeEligibility = (
  evalResult: EvaluationResult,
  edgeRegistry: EdgeRegistry,
): boolean => {
  const blockerEdgeIds = getBlockerCheckEdgeIds(edgeRegistry);
  const blockerOutputNodeIds = getBlockerCheckOutputNodeIds(edgeRegistry);

  // Condition 4: no checks at all means we cannot affirm eligibility.
  const checkEntries = Object.entries(evalResult.checks);
  if (checkEntries.length === 0) return false;

  // Condition 1: any blocker check that explicitly failed.
  for (const [nodeId, check] of checkEntries) {
    if (check.status === "FAIL") {
      const isBlocker =
        check.severity === "blocker" ||
        (check.computedBy !== undefined && blockerEdgeIds.has(check.computedBy)) ||
        blockerOutputNodeIds.has(nodeId);
      if (isBlocker) return false;
    }
  }

  // Build a set of all resolved node IDs (provided inputs + computed values).
  const resolvedNodeIds = new Set<string>([
    ...Object.keys(evalResult.inputs),
    ...Object.keys(evalResult.computed),
  ]);

  // Build a lookup from blocked nodeId -> missingInputs.
  const blockedMap = new Map<string, string[]>(
    evalResult.blocked.map((b) => [b.nodeId, b.missingInputs]),
  );

  // Also key checks by computedBy so we can correlate node IDs to check keys.
  const computedByToCheckKey = new Map<string, string>();
  for (const [, check] of checkEntries) {
    if (check.computedBy) {
      computedByToCheckKey.set(check.computedBy, check.key);
    }
  }

  // Condition 2: blocker check output nodes that are blocked (never computed),
  // but only when ALL of their missing inputs were resolved. If any missing
  // input is itself unresolved, the check could not have run due to data
  // unavailability (partial evaluation), not a logic error.
  for (const requiredNodeId of blockerOutputNodeIds) {
    // Skip if the check was already computed (keyed by node ID or by check key).
    if (resolvedNodeIds.has(requiredNodeId)) continue;

    const missing = blockedMap.get(requiredNodeId);
    if (missing === undefined) continue; // not blocked, just absent

    // If the node has no missing inputs listed but is still blocked, it means
    // an upstream edge errored (the node's computation was attempted but failed).
    // However, that error is on a transform edge, not the check edge itself.
    // We rely on condition 3 (blocker check edge errors) for that case.
    if (missing.length === 0) continue;

    // Only flag ineligibility if every missing input is resolved -- meaning
    // the check edge should have been able to fire but somehow did not.
    const allMissingResolved = missing.every((id) => resolvedNodeIds.has(id));
    if (allMissingResolved) return false;
  }

  // Condition 3: graph errors on blocker-severity check edges.
  for (const err of evalResult.errors) {
    if (blockerEdgeIds.has(err.edgeId)) return false;
  }

  return true;
};
