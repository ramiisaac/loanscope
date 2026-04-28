// Numeric CLI parsers — every helper validates and brands a primitive
// from a raw string argument supplied by Commander.
//
// `parseFiniteNumber` is duplicated here (and in `./enums`) because
// both modules need it and neither is a natural owner. Promote to a
// shared module if a third consumer appears.

import { money, ratio, ratePct, months } from "@loanscope/domain";
import type { Money, Ratio, RatePct, Months, Units } from "@loanscope/domain";
import { CliValidationError } from "../cli-error";

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

/** Parse and brand a Money value from a CLI string. Must be non-negative. */
export const parseCliMoney = (raw: string, label: string): Money => {
  const n = parseFiniteNumber(raw, label);
  if (n < 0) {
    throw new CliValidationError(`Invalid ${label}: ${raw} must be non-negative.`);
  }
  return money(n);
};

/** Parse and brand a Ratio (0..1 inclusive) from a CLI string. */
export const parseCliRatio = (raw: string, label: string): Ratio => {
  const n = parseFiniteNumber(raw, label);
  if (n < 0 || n > 1) {
    throw new CliValidationError(`Invalid ${label}: ${raw} must be between 0 and 1.`);
  }
  return ratio(n);
};

/** Parse and brand a RatePct from a CLI string. Must be in [0, 30]. */
export const parseCliRatePct = (raw: string, label: string): RatePct => {
  const n = parseFiniteNumber(raw, label);
  if (n < 0 || n > 30) {
    throw new CliValidationError(`Invalid ${label}: ${raw} must be between 0 and 30.`);
  }
  return ratePct(n);
};

/** Parse and brand Months from a CLI string. Must be a positive integer. */
export const parseCliMonths = (raw: string, label: string): Months => {
  const n = parseFiniteNumber(raw, label);
  if (!Number.isInteger(n) || n <= 0) {
    throw new CliValidationError(`Invalid ${label}: ${raw} must be a positive integer.`);
  }
  return months(n);
};

/** Parse FICO score (300..850 inclusive). */
export const parseCliFico = (raw: string): number => {
  const n = parseFiniteNumber(raw, "FICO score");
  if (!Number.isInteger(n) || n < 300 || n > 850) {
    throw new CliValidationError(
      `Invalid FICO score: ${raw} must be an integer between 300 and 850.`,
    );
  }
  return n;
};

const isUnits = (n: number): n is Units => n === 1 || n === 2 || n === 3 || n === 4;

/** Parse Units (1..4 inclusive). */
export const parseCliUnits = (raw: string): Units => {
  const n = parseFiniteNumber(raw, "units");
  if (!isUnits(n)) {
    throw new CliValidationError(`Invalid units: ${raw} must be 1, 2, 3, or 4.`);
  }
  return n;
};

/** Parse a non-negative number for goal-seek bounds (zero is allowed). */
export const parseCliPositiveNumber = (raw: string, label: string): number => {
  const n = parseFiniteNumber(raw, label);
  if (n < 0) {
    throw new CliValidationError(`Invalid ${label}: ${raw} must be non-negative.`);
  }
  return n;
};
