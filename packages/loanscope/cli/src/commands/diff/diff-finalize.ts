import { renderDiffReport } from "../../output";
import { renderJson, type ActionOutputFormat } from "../../output";
import { computeDeepDiff } from "./compute-deep-diff";
import type { DiffReport, DiffEntry } from "./diff-types";

export interface DiffActionInput {
  readonly idA: string;
  readonly idB: string;
  readonly output: ActionOutputFormat;
}

interface ResultDiffOutput {
  readonly entries: ReadonlyArray<DiffEntry>;
  readonly asymmetry: "a-only" | "b-only" | "none" | "both-null";
}

export const diffResultPayloads = (a: unknown | null, b: unknown | null): ResultDiffOutput => {
  if (a === null && b === null) {
    return { entries: [], asymmetry: "both-null" };
  }
  if (a !== null && b === null) {
    return {
      entries: [{ path: "resultPayload", kind: "removed", before: a }],
      asymmetry: "a-only",
    };
  }
  if (a === null && b !== null) {
    return {
      entries: [{ path: "resultPayload", kind: "added", after: b }],
      asymmetry: "b-only",
    };
  }
  return { entries: computeDeepDiff(a, b), asymmetry: "none" };
};

export const finalizeDiffReport = (report: DiffReport, output: ActionOutputFormat): string =>
  output === "json" ? renderJson(report) : renderDiffReport(report);
