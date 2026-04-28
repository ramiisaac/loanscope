import { ProgramKind, type ArmFixedPeriod, type Transaction } from "@loanscope/domain";
import { CliValidationError } from "../cli-error";
import { parseCliArmFixedPeriod, parseCliProgramKind } from "../cli-parsers";
import { parseCliMonths, parseCliRatePct } from "../cli-parsers";
export interface ScenarioOverrideOptions {
  rate?: string;
  term?: string;
  program?: string;
  armFixed?: string;
}

interface ParsedScenarioOverrides {
  rate?: ReturnType<typeof parseCliRatePct>;
  term?: ReturnType<typeof parseCliMonths>;
  program?: ProgramKind;
  armFixed?: ArmFixedPeriod;
}

const parseScenarioOverrides = (options: ScenarioOverrideOptions): ParsedScenarioOverrides => {
  const parsed: ParsedScenarioOverrides = {};

  if (options.rate) {
    parsed.rate = parseCliRatePct(options.rate, "note rate");
  }
  if (options.term) {
    parsed.term = parseCliMonths(options.term, "term");
  }
  if (options.program) {
    parsed.program = parseCliProgramKind(options.program);
  }
  if (options.armFixed) {
    parsed.armFixed = parseCliArmFixedPeriod(options.armFixed);
  }

  if (parsed.armFixed !== undefined && parsed.program === undefined) {
    throw new CliValidationError("ARM fixed period override requires --program ARM.");
  }

  if (parsed.program === ProgramKind.ARM && parsed.armFixed === undefined) {
    throw new CliValidationError("ARM program override requires --arm-fixed 60|84|120.");
  }

  return parsed;
};

export const applyScenarioOverrides = (
  transaction: Transaction,
  options: ScenarioOverrideOptions,
): Transaction => {
  const parsed = parseScenarioOverrides(options);
  const next: Transaction = {
    ...transaction,
    scenario: {
      ...transaction.scenario,
      rateNote: {
        ...transaction.scenario.rateNote,
      },
    },
  };

  if (parsed.rate !== undefined) {
    next.scenario.rateNote.noteRatePct = parsed.rate;
  }
  if (parsed.term !== undefined) {
    next.scenario.rateNote.amortizationMonths = parsed.term;
  }
  if (parsed.program !== undefined) {
    next.scenario.rateNote.productKind = parsed.program;
  }

  const effectiveProgram =
    parsed.program ?? next.scenario.rateNote.productKind ?? ProgramKind.Fixed;

  if (effectiveProgram === ProgramKind.ARM) {
    const arm = next.scenario.rateNote.arm ?? {};
    if (parsed.armFixed !== undefined) {
      arm.initialFixedMonths = parsed.armFixed;
    }
    next.scenario.rateNote.arm = arm;
  }

  if (effectiveProgram !== ProgramKind.ARM && parsed.program !== undefined) {
    delete next.scenario.rateNote.arm;
  }

  return next;
};
