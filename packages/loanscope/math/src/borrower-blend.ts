import Decimal from "decimal.js";
import type { Borrower, BorrowerBlendPolicy } from "@loanscope/domain";
import { assertNever } from "@loanscope/domain";

/**
 * Default policy used when no explicit `borrowerBlendPolicy` is supplied at
 * the transaction level. Mirrors the Fannie/Freddie "representative FICO"
 * convention: per-borrower mid score, then minimum across the included set.
 */
export const DEFAULT_BLEND_POLICY: BorrowerBlendPolicy = { kind: "LowestMid" };

const FICO_FLOOR = 300;
const FICO_CEILING = 850;

/** Round half-up to nearest integer and clamp to the valid FICO band. */
const roundAndClampFico = (value: Decimal): number => {
  const rounded = value.toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
  if (!Number.isFinite(rounded)) {
    throw new RangeError(`Computed FICO is not finite: ${rounded}`);
  }
  if (rounded < FICO_FLOOR) return FICO_FLOOR;
  if (rounded > FICO_CEILING) return FICO_CEILING;
  return rounded;
};

/**
 * Industry "mid" score for a single borrower: the median of the bureau
 * scores when at least three are present, otherwise the borrower's primary
 * `fico`. Taking the min of fewer than three bureau scores would be
 * non-standard and is intentionally avoided.
 */
const borrowerMidScore = (borrower: Borrower): number => {
  const scores = borrower.ficoScores;
  if (!scores || scores.length < 3) {
    return borrower.fico;
  }
  const sorted = [...scores].sort((a, b) => a - b);
  const midIndex = Math.floor(sorted.length / 2);
  const mid = sorted[midIndex];
  if (mid === undefined) {
    // Unreachable given length >= 3, but keeps the type system honest.
    return borrower.fico;
  }
  return mid;
};

/** Sum of a borrower's monthly income across all attached streams. */
const borrowerMonthlyIncome = (borrower: Borrower): Decimal =>
  borrower.incomes.reduce((acc, stream) => acc.plus(Number(stream.monthlyAmount)), new Decimal(0));

/** Filter borrowers to the included set, preserving input order. */
const selectIncluded = (
  borrowers: readonly Borrower[],
  includedBorrowerIds: readonly string[],
): Borrower[] => {
  const allowed = new Set(includedBorrowerIds);
  return borrowers.filter((b) => allowed.has(b.id));
};

const computeLowestMid = (included: readonly Borrower[]): number => {
  let minMid = Number.POSITIVE_INFINITY;
  for (const borrower of included) {
    const mid = borrowerMidScore(borrower);
    if (mid < minMid) minMid = mid;
  }
  return roundAndClampFico(new Decimal(minMid));
};

const computeUnweightedMean = (included: readonly Borrower[]): Decimal => {
  const sum = included.reduce((acc, b) => acc.plus(b.fico), new Decimal(0));
  return sum.dividedBy(included.length);
};

const computeWeightedAverage = (included: readonly Borrower[], incomeWeighted: boolean): number => {
  if (!incomeWeighted) {
    return roundAndClampFico(computeUnweightedMean(included));
  }
  const weights = included.map((b) => borrowerMonthlyIncome(b));
  const totalWeight = weights.reduce((acc, w) => acc.plus(w), new Decimal(0));
  if (totalWeight.isZero()) {
    // Degenerate: no income recorded for any included borrower; fall back
    // to the unweighted arithmetic mean rather than dividing by zero.
    return roundAndClampFico(computeUnweightedMean(included));
  }
  const weightedSum = included.reduce((acc, borrower, idx) => {
    const weight = weights[idx];
    if (weight === undefined) return acc;
    return acc.plus(weight.times(borrower.fico));
  }, new Decimal(0));
  return roundAndClampFico(weightedSum.dividedBy(totalWeight));
};

const computePrimaryOnly = (included: readonly Borrower[], primaryBorrowerId: string): number => {
  const primary = included.find((b) => b.id === primaryBorrowerId);
  if (!primary) {
    throw new RangeError(
      `PrimaryOnly blend policy references borrower '${primaryBorrowerId}' which is not in includedBorrowerIds`,
    );
  }
  return roundAndClampFico(new Decimal(primary.fico));
};

/**
 * Applies a `BorrowerBlendPolicy` to a borrower set and returns a single
 * representative FICO in [300, 850]. All math runs through `decimal.js` to
 * avoid binary-float drift; the result is rounded half-up to the nearest
 * integer and clamped to the valid FICO band.
 *
 * Throws `RangeError` when the included set is empty or when a
 * `PrimaryOnly` policy references an excluded borrower.
 */
export const computeRepresentativeFico = (
  borrowers: readonly Borrower[],
  includedBorrowerIds: readonly string[],
  policy: BorrowerBlendPolicy,
): number => {
  const included = selectIncluded(borrowers, includedBorrowerIds);
  if (included.length === 0) {
    throw new RangeError("At least one borrower must be included for FICO blending");
  }

  switch (policy.kind) {
    case "LowestMid":
    case "RepresentativeFico":
      return computeLowestMid(included);
    case "WeightedAverage":
      return computeWeightedAverage(included, policy.incomeWeighted);
    case "PrimaryOnly":
      return computePrimaryOnly(included, policy.primaryBorrowerId);
    default:
      return assertNever(
        policy,
        `Unknown borrower blend policy kind: ${(policy as { kind: string }).kind}`,
      );
  }
};
