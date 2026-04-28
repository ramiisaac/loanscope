import Decimal from "decimal.js";
import type { LoanPurpose, Occupancy } from "@loanscope/domain";
import type { Money, Months } from "@loanscope/domain";
import type { ReservesPolicy, ReservesTier } from "@loanscope/domain";
import { assertNever, money, months as monthsFn } from "@loanscope/domain";

/** Calculates the dollar amount of required reserves from PITI and month count. */
export const calculateRequiredReserves = (pitiMonthly: Money, reserveMonths: Months): Money => {
  if (!Number.isFinite(pitiMonthly) || !Number.isFinite(reserveMonths)) {
    throw new RangeError("Reserve inputs must be finite");
  }
  if (reserveMonths < 0) {
    throw new RangeError(`reserveMonths must be non-negative, got ${reserveMonths}`);
  }
  return money(new Decimal(pitiMonthly).mul(reserveMonths).toNumber());
};

/**
 * Resolves the number of reserve months required by a policy.
 * Throws on unrecognized policy kind instead of silently falling back.
 */
export const resolveReserveMonths = (
  policy: ReservesPolicy,
  loanAmount: Money,
  occupancy: Occupancy,
  purpose: LoanPurpose,
): Months | "AUS" => {
  switch (policy.kind) {
    case "None":
      return monthsFn(0);
    case "FixedMonths":
      return policy.months;
    case "AUSDetermined":
      return "AUS";
    case "Tiered":
      return resolveTiered(policy.tiers, loanAmount, occupancy, purpose);
    default:
      return assertNever(
        policy,
        `Unknown reserves policy kind: ${(policy as { kind: string }).kind}`,
      );
  }
};

/**
 * Returns the additional reserve-month floor a Tiered policy wants to layer
 * on top of an upstream AUS finding. When the matching tier sets
 * `additionalToAus: true`, the tier's `months` value becomes a hard floor:
 * the engine takes `max(ausFinding.reservesMonths, tier.months)`.
 *
 * Returns `monthsFn(0)` (no floor) for every other policy kind, for tiers
 * without `additionalToAus`, when no tier matches the
 * `(loanAmount, occupancy, purpose)` triple, or when the matching tier's
 * `additionalToAus` is `false` / absent. Pure function; matches the
 * `resolveReserveMonths` lookup semantics so the two stay in lockstep.
 *
 * Callers should use this in conjunction with `resolveReserveMonths`:
 * when the latter returns `"AUS"`, the consumer resolves the AUS finding
 * (typically `transaction.ausFindings.reservesMonths`) and then takes
 * `Math.max(ausMonths, resolveReserveFloor(...))` to honor the floor.
 */
export const resolveReserveFloor = (
  policy: ReservesPolicy,
  loanAmount: Money,
  occupancy: Occupancy,
  purpose: LoanPurpose,
): Months => {
  if (policy.kind !== "Tiered") {
    return monthsFn(0);
  }

  const sorted = normalizeTiers(policy.tiers);

  for (const tier of sorted) {
    const min = tier.loanAmount.min ?? 0;
    const max = tier.loanAmount.max ?? Number.POSITIVE_INFINITY;
    if (loanAmount < min || loanAmount > max) continue;
    if (tier.occupancies && !tier.occupancies.includes(occupancy)) continue;
    if (tier.purposes && !tier.purposes.includes(purpose)) continue;
    return tier.additionalToAus === true ? tier.months : monthsFn(0);
  }

  return monthsFn(0);
};

/**
 * Normalizes tiers by sorting on loanAmount.min ascending (defaulting to 0)
 * so that tier evaluation order is deterministic regardless of input ordering.
 * When min values are equal, sorts by max ascending (defaulting to +Infinity).
 */
const normalizeTiers = (tiers: readonly ReservesTier[]): ReservesTier[] => {
  return [...tiers].sort((a, b) => {
    const minA = a.loanAmount.min ?? 0;
    const minB = b.loanAmount.min ?? 0;
    if (minA !== minB) return minA - minB;
    const maxA = a.loanAmount.max ?? Number.POSITIVE_INFINITY;
    const maxB = b.loanAmount.max ?? Number.POSITIVE_INFINITY;
    return maxA - maxB;
  });
};

const resolveTiered = (
  tiers: ReservesTier[],
  loanAmount: Money,
  occupancy: Occupancy,
  purpose: LoanPurpose,
): Months | "AUS" => {
  if (tiers.length === 0) {
    return monthsFn(0);
  }

  const sorted = normalizeTiers(tiers);

  for (const tier of sorted) {
    const min = tier.loanAmount.min ?? 0;
    const max = tier.loanAmount.max ?? Number.POSITIVE_INFINITY;
    if (loanAmount < min || loanAmount > max) continue;
    if (tier.occupancies && !tier.occupancies.includes(occupancy)) continue;
    if (tier.purposes && !tier.purposes.includes(purpose)) continue;
    // When additionalToAus is true, the tier's `months` is a floor over the
    // upstream AUS finding, not the resolved value. Defer to AUS so the
    // consumer applies max(ausFinding, tier.months) via resolveReserveFloor.
    if (tier.additionalToAus === true) {
      return "AUS";
    }
    return tier.months;
  }

  return monthsFn(0);
};
