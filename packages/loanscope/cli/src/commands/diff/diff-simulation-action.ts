import type { DatabaseManager } from "@loanscope/db";
import { CliValidationError } from "../../cli-error";
import { requireSimulation } from "../db";
import { computeDeepDiff } from "./compute-deep-diff";
import { diffResultPayloads, finalizeDiffReport, type DiffActionInput } from "./diff-finalize";
import { buildSimulationDelta, isSimulationReport, type DiffReport } from "./diff-types";

const extractSimulationReport = (resultPayload: unknown) => {
  if (typeof resultPayload !== "object" || resultPayload === null || Array.isArray(resultPayload)) {
    return null;
  }
  const report = (resultPayload as Record<string, unknown>)["report"];
  return isSimulationReport(report) ? report : null;
};

export const diffSimulationsAction = (
  manager: DatabaseManager,
  { idA, idB, output }: DiffActionInput,
): string => {
  if (idA === idB) {
    throw new CliValidationError(`Cannot diff a simulation against itself: "${idA}".`);
  }
  const a = requireSimulation(manager, idA);
  const b = requireSimulation(manager, idB);
  const resultDiff = diffResultPayloads(a.resultPayload, b.resultPayload);
  const reportA = extractSimulationReport(a.resultPayload);
  const reportB = extractSimulationReport(b.resultPayload);

  const report: DiffReport = {
    kind: "simulation",
    metadata: {
      a: { id: a.simulationId, name: a.name, createdAt: a.createdAt },
      b: { id: b.simulationId, name: b.name, createdAt: b.createdAt },
    },
    configPayload: computeDeepDiff(a.configPayload, b.configPayload),
    resultPayload: resultDiff.entries,
    resultAsymmetry: resultDiff.asymmetry,
    ...(reportA !== null && reportB !== null
      ? { simulationDelta: buildSimulationDelta(reportA, reportB) }
      : {}),
  };

  return finalizeDiffReport(report, output);
};
