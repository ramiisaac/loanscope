// Parsers for CLI inputs that represent ranges, comma-separated lists,
// and borrower sets.

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

export interface ParsedRange {
  min: number;
  max: number;
  step: number;
}

/** Parse a colon-separated range (min:max:step), validating all parts are finite and step is positive. */
export const parseCliRange = (raw: string, label: string): ParsedRange => {
  const parts = raw.split(":");
  if (parts.length !== 3) {
    throw new CliValidationError(`Invalid ${label} range: "${raw}". Expected format min:max:step`);
  }
  const min = parseFiniteNumber(parts[0]!, label + " min");
  const max = parseFiniteNumber(parts[1]!, label + " max");
  const step = parseFiniteNumber(parts[2]!, label + " step");

  if (step <= 0) {
    throw new CliValidationError(`Invalid ${label} range: step must be positive, got ${step}.`);
  }
  if (min > max) {
    throw new CliValidationError(`Invalid ${label} range: min (${min}) must be <= max (${max}).`);
  }
  return { min, max, step };
};

/** Parse a comma-separated list, trimming whitespace and filtering empties. */
export const parseCliList = (raw: string | undefined): string[] =>
  raw
    ? raw
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean)
    : [];

/** Parse a comma-separated list of numbers, validating each (must be non-empty). */
export const parseCliNumberList = (raw: string, label: string): number[] => {
  const items = parseCliList(raw);
  if (items.length === 0) {
    throw new CliValidationError(`Invalid ${label}: list must contain at least one value.`);
  }
  return items.map((item) => parseFiniteNumber(item, label));
};

/**
 * Parse one or more borrower-set specifications. Each set is a
 * pipe-or-comma separated list of borrower ids; multiple sets may be
 * separated by `;`. Empty entries are dropped at every level so
 * stray separators in the CLI input are tolerated.
 */
export const parseBorrowerSets = (values?: string[] | string): string[][] => {
  if (!values) return [];
  const raw = Array.isArray(values) ? values : [values];
  const expanded = raw
    .flatMap((value) => value.split(";"))
    .map((value) => value.trim())
    .filter(Boolean);
  return expanded.map((set) =>
    set
      .split(/[|,]/)
      .map((id) => id.trim())
      .filter(Boolean),
  );
};
