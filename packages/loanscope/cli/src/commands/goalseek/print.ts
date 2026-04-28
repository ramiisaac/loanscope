import type { Command } from "commander";
import type { GoalSeekResult } from "@loanscope/compare";
import { renderJson } from "../../output";
import { renderGoalSeekCSV, renderGoalSeekResult } from "../../output";
import { parseCliOutputFormat, type CliOutputFormat } from "../../format-parsers";

export const printGoalSeekResult = (result: GoalSeekResult, output: CliOutputFormat): void => {
  if (output === "json") {
    console.log(renderJson(result));
  } else if (output === "csv") {
    console.log(renderGoalSeekCSV(result));
  } else {
    console.log(renderGoalSeekResult(result));
  }
};

export const resolveGoalSeekOutput = (
  options: { output?: string },
  command: Command,
): CliOutputFormat => {
  const parentOpts = command.parent?.opts() ?? {};
  const rootOpts = command.parent?.parent?.opts() ?? {};
  return parseCliOutputFormat(options.output ?? parentOpts.output ?? rootOpts.output ?? "table");
};
