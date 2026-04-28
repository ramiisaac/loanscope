import { CliValidationError } from "../../cli-error";
import { parseCliPositiveNumber } from "../../cli-parsers";
import { validateGoalSeekBounds, validateGoalSeekTolerance } from "../../cli-validators";

export interface GoalSeekBounds {
  readonly min: number;
  readonly max: number;
}

export const parseBounds = (minRaw: string, maxRaw: string, label: string): GoalSeekBounds => {
  const min = parseCliPositiveNumber(minRaw, `${label} min`);
  const max = parseCliPositiveNumber(maxRaw, `${label} max`);
  validateGoalSeekBounds(min, max, label);
  return { min, max };
};

export const parseFicoBounds = (minRaw: string, maxRaw: string, label: string): GoalSeekBounds => {
  const bounds = parseBounds(minRaw, maxRaw, label);
  if (bounds.min < 300 || bounds.max > 850) {
    throw new CliValidationError(
      `Invalid ${label} bounds: FICO range must be within 300..850, got ${bounds.min}..${bounds.max}.`,
    );
  }
  return bounds;
};

export const parseTolerance = (raw: string | undefined, label: string): number | undefined => {
  if (raw === undefined) return undefined;
  const tolerance = parseCliPositiveNumber(raw, `${label} tolerance`);
  validateGoalSeekTolerance(tolerance, label);
  return tolerance;
};

export const parseMaxIterations = (raw: string | undefined, label: string): number | undefined => {
  if (raw === undefined) return undefined;
  const iterations = parseCliPositiveNumber(raw, `${label} max-iterations`);
  if (!Number.isInteger(iterations) || iterations < 1) {
    throw new CliValidationError(
      `Invalid ${label} max-iterations: must be a positive integer, got ${iterations}.`,
    );
  }
  return iterations;
};
