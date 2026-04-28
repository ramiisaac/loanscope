import type {
  BorrowerBlendPolicy,
  Money,
  Ratio,
  RatePct,
  Months,
  QualifyingPaymentPolicy,
  ReservesPolicy,
} from "@loanscope/domain";
import { money, ratio, ratePct, months } from "@loanscope/domain";

const BORROWER_BLEND_POLICY_KINDS = new Set([
  "LowestMid",
  "RepresentativeFico",
  "WeightedAverage",
  "PrimaryOnly",
]);

const QUALIFYING_PAYMENT_KINDS = new Set([
  "NotePayment",
  "IOUsesFullyAmortizing",
  "ARMQualifyMaxNotePlus",
  "ARMQualifyFullyIndexedOrNote",
]);

const RESERVES_POLICY_KINDS = new Set(["None", "FixedMonths", "AUSDetermined", "Tiered"]);

/**
 * Parse and validate a `BorrowerBlendPolicy` discriminated union arriving at
 * the graph boundary as `unknown`. Mirrors the validation pattern used for
 * `QualifyingPaymentPolicy` / `ReservesPolicy`: structural checks on `kind`
 * and per-variant required fields. The terminating cast is the documented
 * boundary adapter for an externally-supplied object the executor cannot
 * statically type.
 */
export const toBorrowerBlendPolicy = (value: unknown, field: string): BorrowerBlendPolicy => {
  if (!value || typeof value !== "object") {
    throw new Error(`Expected ${field} to be a policy object, got ${typeof value}`);
  }
  const obj = value as Record<string, unknown>;
  const kind = obj.kind;
  if (typeof kind !== "string" || !BORROWER_BLEND_POLICY_KINDS.has(kind)) {
    throw new Error(
      `${field}.kind must be one of [${[...BORROWER_BLEND_POLICY_KINDS].join(", ")}], got '${String(kind)}'`,
    );
  }
  if (kind === "WeightedAverage") {
    if (typeof obj.incomeWeighted !== "boolean") {
      throw new Error(`${field}.incomeWeighted must be a boolean for WeightedAverage policy`);
    }
  }
  if (kind === "PrimaryOnly") {
    if (typeof obj.primaryBorrowerId !== "string" || obj.primaryBorrowerId.length === 0) {
      throw new Error(
        `${field}.primaryBorrowerId must be a non-empty string for PrimaryOnly policy`,
      );
    }
  }
  return value as BorrowerBlendPolicy;
};

/** Reject NaN, +Infinity, -Infinity. */
const assertFinite = (value: number, field: string): void => {
  if (!Number.isFinite(value)) {
    throw new Error(`${field} must be finite, got ${value}`);
  }
};

/** Validate and brand a number as Money (>= 0, finite). */
export const toMoney = (value: unknown, field: string): Money => {
  if (typeof value !== "number") {
    throw new Error(`Expected ${field} to be number, got ${typeof value}`);
  }
  assertFinite(value, field);
  if (value < 0) {
    throw new Error(`${field} must be >= 0, got ${value}`);
  }
  return money(value);
};

/** Validate and brand a number as Ratio (0..1 inclusive, finite). */
export const toRatio = (value: unknown, field: string): Ratio => {
  if (typeof value !== "number") {
    throw new Error(`Expected ${field} to be number, got ${typeof value}`);
  }
  assertFinite(value, field);
  if (value < 0 || value > 1) {
    throw new Error(`${field} must be in [0, 1], got ${value}`);
  }
  return ratio(value);
};

/** Validate and brand a number as RatePct (>= 0, finite). */
export const toRatePct = (value: unknown, field: string): RatePct => {
  if (typeof value !== "number") {
    throw new Error(`Expected ${field} to be number, got ${typeof value}`);
  }
  assertFinite(value, field);
  if (value < 0) {
    throw new Error(`${field} must be >= 0, got ${value}`);
  }
  return ratePct(value);
};

/** Validate and brand a number as Months (positive integer, finite). */
export const toMonths = (value: unknown, field: string): Months => {
  if (typeof value !== "number") {
    throw new Error(`Expected ${field} to be number, got ${typeof value}`);
  }
  assertFinite(value, field);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${field} must be a positive integer, got ${value}`);
  }
  return months(value);
};

/** Validate and brand a number as Months (non-negative integer, finite). */
export const toNonNegativeMonths = (value: unknown, field: string): Months => {
  if (typeof value !== "number") {
    throw new Error(`Expected ${field} to be number, got ${typeof value}`);
  }
  assertFinite(value, field);
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${field} must be a non-negative integer, got ${value}`);
  }
  return months(value);
};

/** Validate value is a finite number. */
export const toNumber = (value: unknown, field: string): number => {
  if (typeof value !== "number") {
    throw new Error(`Expected ${field} to be number, got ${typeof value}`);
  }
  assertFinite(value, field);
  return value;
};

/** Validate value is a string. */
export const toString = (value: unknown, field: string): string => {
  if (typeof value !== "string") {
    throw new Error(`Expected ${field} to be string, got ${typeof value}`);
  }
  return value;
};

/** Parse an optional string, returning undefined for null/undefined. */
export const toOptionalString = (value: unknown): string | undefined => {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") {
    throw new Error("Expected optional string");
  }
  return value;
};

/** Validate value is an array. */
export const toArray = <T>(value: unknown, field: string): T[] => {
  if (!Array.isArray(value)) {
    throw new Error(`Expected ${field} to be array, got ${typeof value}`);
  }
  return value as T[];
};

/** Validate and narrow a string against a set of allowed values. */
export const toEnum = <T extends string>(
  value: unknown,
  field: string,
  allowed: ReadonlySet<string>,
): T => {
  if (typeof value !== "string") {
    throw new Error(`Expected ${field} to be string, got ${typeof value}`);
  }
  if (!allowed.has(value)) {
    throw new Error(`${field} must be one of [${[...allowed].join(", ")}], got '${value}'`);
  }
  return value as T;
};

/** Parse and validate a QualifyingPaymentPolicy discriminated union. */
export const toQualifyingPaymentPolicy = (
  value: unknown,
  field: string,
): QualifyingPaymentPolicy => {
  if (!value || typeof value !== "object") {
    throw new Error(`Expected ${field} to be a policy object, got ${typeof value}`);
  }
  const obj = value as Record<string, unknown>;
  const kind = obj.kind;
  if (typeof kind !== "string" || !QUALIFYING_PAYMENT_KINDS.has(kind)) {
    throw new Error(
      `${field}.kind must be one of [${[...QUALIFYING_PAYMENT_KINDS].join(", ")}], got '${String(kind)}'`,
    );
  }
  if (kind === "IOUsesFullyAmortizing") {
    if (
      typeof obj.amortMonths !== "number" ||
      !Number.isFinite(obj.amortMonths) ||
      obj.amortMonths <= 0
    ) {
      throw new Error(`${field}.amortMonths must be a positive finite number`);
    }
  }
  if (kind === "ARMQualifyMaxNotePlus") {
    if (
      typeof obj.addPctPoints !== "number" ||
      !Number.isFinite(obj.addPctPoints) ||
      obj.addPctPoints < 0
    ) {
      throw new Error(`${field}.addPctPoints must be a non-negative finite number`);
    }
  }
  return value as QualifyingPaymentPolicy;
};

/** Parse and validate a ReservesPolicy discriminated union. */
export const toReservesPolicy = (value: unknown, field: string): ReservesPolicy => {
  if (!value || typeof value !== "object") {
    throw new Error(`Expected ${field} to be a policy object, got ${typeof value}`);
  }
  const obj = value as Record<string, unknown>;
  const kind = obj.kind;
  if (typeof kind !== "string" || !RESERVES_POLICY_KINDS.has(kind)) {
    throw new Error(
      `${field}.kind must be one of [${[...RESERVES_POLICY_KINDS].join(", ")}], got '${String(kind)}'`,
    );
  }
  if (kind === "FixedMonths") {
    if (typeof obj.months !== "number" || !Number.isFinite(obj.months) || obj.months <= 0) {
      throw new Error(`${field}.months must be a positive finite number`);
    }
  }
  if (kind === "Tiered") {
    if (!Array.isArray(obj.tiers)) {
      throw new Error(`${field}.tiers must be an array`);
    }
  }
  return value as ReservesPolicy;
};
