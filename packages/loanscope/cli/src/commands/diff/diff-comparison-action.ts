import type { DatabaseManager } from "@loanscope/db";
import { CliValidationError } from "../../cli-error";
import { requireComparison } from "../db";
import { computeDeepDiff } from "./compute-deep-diff";
import { diffResultPayloads, finalizeDiffReport, type DiffActionInput } from "./diff-finalize";
import { buildGridSummaryDelta, isGridSummary, type DiffReport } from "./diff-types";

const extractGridSummary = (resultPayload: unknown) => {
  if (typeof resultPayload !== "object" || resultPayload === null || Array.isArray(resultPayload)) {
    return null;
  }
  const summary = (resultPayload as Record<string, unknown>)["summary"];
  return isGridSummary(summary) ? summary : null;
};

export const diffComparisonsAction = (
  manager: DatabaseManager,
  { idA, idB, output }: DiffActionInput,
): string => {
  if (idA === idB) {
    throw new CliValidationError(`Cannot diff a comparison against itself: "${idA}".`);
  }
  const a = requireComparison(manager, idA);
  const b = requireComparison(manager, idB);
  const resultDiff = diffResultPayloads(a.resultPayload, b.resultPayload);
  const summaryA = extractGridSummary(a.resultPayload);
  const summaryB = extractGridSummary(b.resultPayload);

  const report: DiffReport = {
    kind: "comparison",
    metadata: {
      a: { id: a.comparisonId, name: a.name, createdAt: a.createdAt },
      b: { id: b.comparisonId, name: b.name, createdAt: b.createdAt },
    },
    configPayload: computeDeepDiff(a.configPayload, b.configPayload),
    resultPayload: resultDiff.entries,
    resultAsymmetry: resultDiff.asymmetry,
    ...(summaryA !== null && summaryB !== null
      ? { gridSummaryDelta: buildGridSummaryDelta(summaryA, summaryB) }
      : {}),
  };

  return finalizeDiffReport(report, output);
};
