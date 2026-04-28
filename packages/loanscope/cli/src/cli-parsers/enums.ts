// CLI parsers for domain enums.
//
// Each helper validates a raw CLI string against the corresponding
// `@loanscope/domain` enum and returns the narrowed value. The shared
// `parseCliEnum` helper performs case-insensitive matching against the
// enum's declared values.

import {
  Occupancy,
  LoanPurpose,
  PropertyType,
  LoanType,
  ProgramKind,
  ArmFixedPeriod,
  AmortizationTerm,
} from "@loanscope/domain";
import { CliValidationError } from "../cli-error";
import { parseCliMonths } from "./numeric";

/** Parses a raw CLI string to a finite number, throwing on NaN / Infinity / empty. */
const parseFiniteNumber = (raw: string, label: string): number => {
  const trimmed = raw.trim();
  if (trimmed === "") {
    throw new CliValidationError(`Invalid ${label}: value must not be empty.`);
  }
  const n = Number(trimmed);
  if (!Number.isFinite(n)) {
    throw new CliValidationError(`Invalid ${label}: "${raw}" is not a finite number.`);
  }
  return n;
};

/**
 * Validates a raw CLI string against a TypeScript enum's values.
 * Performs case-insensitive matching and returns the canonical enum value.
 */
export const parseCliEnum = <T extends string>(
  raw: string,
  enumObj: Record<string, T>,
  label: string,
): T => {
  const values = Object.values(enumObj);
  const exact = values.find((v) => v === raw);
  if (exact) return exact;

  const lowerRaw = raw.toLowerCase();
  const caseInsensitive = values.find((v) => v.toLowerCase() === lowerRaw);
  if (caseInsensitive) return caseInsensitive;

  throw new CliValidationError(`Invalid ${label}: "${raw}". Valid values: ${values.join(", ")}`);
};

export const parseCliOccupancy = (raw: string): Occupancy =>
  parseCliEnum(raw, Occupancy, "occupancy");

export const parseCliLoanPurpose = (raw: string): LoanPurpose =>
  parseCliEnum(raw, LoanPurpose, "loan purpose");

export const parseCliPropertyType = (raw: string): PropertyType =>
  parseCliEnum(raw, PropertyType, "property type");

export const parseCliLoanType = (raw: string): LoanType => parseCliEnum(raw, LoanType, "loan type");

export const parseCliProgramKind = (raw: string): ProgramKind =>
  parseCliEnum(raw, ProgramKind, "program kind");

export const parseCliArmFixedPeriod = (raw: string): ArmFixedPeriod => {
  const monthsValue = parseCliMonths(raw, "ARM fixed period");
  if (
    monthsValue !== ArmFixedPeriod.M60 &&
    monthsValue !== ArmFixedPeriod.M84 &&
    monthsValue !== ArmFixedPeriod.M120
  ) {
    throw new CliValidationError(`Invalid ARM fixed period: ${raw}. Valid values: 60, 84, 120`);
  }
  return monthsValue;
};

const AMORTIZATION_TERM_VALUES: readonly number[] = Object.values(AmortizationTerm).filter(
  (v): v is number => typeof v === "number",
);

const isAmortizationTerm = (n: number): n is AmortizationTerm =>
  AMORTIZATION_TERM_VALUES.includes(n);

export const parseCliAmortizationTerm = (raw: string): AmortizationTerm => {
  const n = parseFiniteNumber(raw, "amortization term");
  if (!isAmortizationTerm(n)) {
    throw new CliValidationError(
      `Invalid amortization term: ${raw}. Valid values: ${AMORTIZATION_TERM_VALUES.join(", ")}`,
    );
  }
  return n;
};
