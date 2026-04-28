import type { DatabaseManager } from "@loanscope/db";
import { CliValidationError } from "../../cli-error";
import { requireScenario } from "../db";
import { computeDeepDiff } from "./compute-deep-diff";
import { diffResultPayloads, finalizeDiffReport, type DiffActionInput } from "./diff-finalize";
import type { DiffReport } from "./diff-types";

export const diffScenariosAction = (
  manager: DatabaseManager,
  { idA, idB, output }: DiffActionInput,
): string => {
  if (idA === idB) {
    throw new CliValidationError(`Cannot diff a scenario against itself: "${idA}".`);
  }
  const a = requireScenario(manager, idA);
  const b = requireScenario(manager, idB);
  const resultDiff = diffResultPayloads(a.resultPayload, b.resultPayload);

  const report: DiffReport = {
    kind: "scenario",
    metadata: {
      a: {
        id: a.scenarioId,
        name: a.name,
        description: a.description,
        createdAt: a.createdAt,
      },
      b: {
        id: b.scenarioId,
        name: b.name,
        description: b.description,
        createdAt: b.createdAt,
      },
    },
    configPayload: computeDeepDiff(a.configPayload, b.configPayload),
    resultPayload: resultDiff.entries,
    resultAsymmetry: resultDiff.asymmetry,
  };

  return finalizeDiffReport(report, output);
};
