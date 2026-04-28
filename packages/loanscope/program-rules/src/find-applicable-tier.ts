import type { LoanAmountTier, Money } from "@loanscope/domain";

const effectiveMin = (tier: LoanAmountTier): number => tier.range.min ?? 0;
const effectiveMax = (tier: LoanAmountTier): number =>
  tier.range.max ?? Number.POSITIVE_INFINITY;

const formatRange = (tier: LoanAmountTier): string => {
  const min = tier.range.min ?? "-∞";
  const max = tier.range.max ?? "+∞";
  return `[${String(min)}, ${String(max)}]`;
};

/**
 * Validate that a `LoanAmountTier[]` is ascending by effective min and
 * non-overlapping. Catalogs are the source of truth; a misordered or
 * overlapping tier array is treated as an upstream bug and is surfaced
 * as a thrown `Error` rather than silently masked.
 *
 * Overlap predicate: two consecutive tiers `a`, `b` overlap when
 * `effectiveMax(a) > effectiveMin(b)` (strict). Adjacent tiers sharing
 * a single inclusive boundary (e.g. `[0, 1_000_000]` and
 * `[1_000_000, 1_500_000]`) are permitted — this matches the existing
 * catalog convention used across `@loanscope/products` (see
 * `uwm/jumbo.ts`, `uwm/prime-jumbo.ts`). At a shared boundary the
 * lower tier wins by first-match semantics. Integer-gap conventions
 * (e.g. max `1_000_000` / next min `1_000_001`) are equally accepted
 * since the strict inequality does not fire in that case either.
 *
 * The function does not mutate the input.
 */
const assertTiersWellFormed = (tiers: LoanAmountTier[]): void => {
  for (let i = 0; i < tiers.length - 1; i++) {
    const current = tiers[i];
    const next = tiers[i + 1];
    if (!current || !next) continue;
    const currentMin = effectiveMin(current);
    const nextMin = effectiveMin(next);
    if (currentMin > nextMin) {
      throw new Error(
        `LoanAmountTier array is not ascending by min: ${formatRange(current)} precedes ${formatRange(next)}`,
      );
    }
    if (effectiveMax(current) > nextMin) {
      throw new Error(
        `LoanAmountTier ranges overlap: ${formatRange(current)} overlaps ${formatRange(next)}`,
      );
    }
  }
};

/**
 * Find the first `LoanAmountTier` whose range contains `loanAmount`.
 * Missing bounds are treated as open: `min ?? 0` and `max ?? +Infinity`,
 * so a tier declared with only an upper bound matches every loan
 * amount at or below it, and a tier with only a lower bound matches
 * every amount at or above it.
 *
 * Returns `undefined` when the product has no tiers or when no tier's
 * range contains the amount — callers decide how to handle "no
 * applicable tier" (typically by falling back to the program's
 * base-level min/max loan amount).
 *
 * Before searching, the input is validated for ascending order by
 * effective min and for non-overlap (see `assertTiersWellFormed`).
 * Misordered or overlapping tier arrays throw rather than silently
 * producing a first-match-wins answer that depends on authoring order.
 * The input array is not mutated.
 */
export const findApplicableTier = (
  tiers: LoanAmountTier[] | undefined,
  loanAmount: Money,
): LoanAmountTier | undefined => {
  if (!tiers || tiers.length === 0) return undefined;
  if (tiers.length > 1) assertTiersWellFormed(tiers);
  return tiers.find((tier) => {
    const min = effectiveMin(tier);
    const max = effectiveMax(tier);
    return loanAmount >= min && loanAmount <= max;
  });
};
