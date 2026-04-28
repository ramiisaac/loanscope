import Decimal from "decimal.js";
import type { IncomeStream, Money, ProgramIncomePolicies, Ratio } from "@loanscope/domain";
import { IncomeType, assertNever, money, ratio } from "@loanscope/domain";
import type { QualifyingIncomePolicy } from "@loanscope/domain";

/** Default vacancy/expense haircut applied to gross rent when none is supplied. */
const DEFAULT_RENTAL_VACANCY_FACTOR = 0.25;

/** Industry-standard 75% net factor on already-net rental income. */
const RENTAL_NET_FACTOR = 0.75;

/** Default vacancy / expense factor on subject-property gross rents (25%). */
const SUBJECT_RENTAL_DEFAULT_VACANCY = 0.25;

/**
 * Computes the qualifying-income uplift from subject-property rental on a
 * 2-4 unit purchase or refi. Returns `money(0)` when `units < 2` (a 1-unit
 * primary cannot generate subject rental for the borrower-occupied unit).
 *
 * The uplift is `grossMonthlyRent * (1 - vacancyFactor)` where
 * `vacancyFactor` defaults to 25% (industry-standard 75% net haircut on
 * appraisal-derived gross rents). The borrower-occupied unit is assumed
 * to already be excluded from `grossMonthlyRent`; callers supply the
 * non-owner-occupied units' aggregate gross rent.
 *
 * Per-program qualifying-income haircuts (FHA's 75% cap on rental,
 * Fannie/Freddie B3-3.1 self-sufficiency tests for 3-4 unit primaries)
 * are applied at the engine level via `ProgramIncomePolicies`, not here.
 */
export const calculateSubjectRentalIncome = (
  grossMonthlyRent: Money,
  units: number,
  vacancyFactor?: Ratio,
): Money => {
  if (!Number.isFinite(grossMonthlyRent) || grossMonthlyRent < 0) {
    throw new RangeError(
      `grossMonthlyRent must be a non-negative finite number, got ${grossMonthlyRent}`,
    );
  }
  if (!Number.isInteger(units) || units < 1 || units > 4) {
    throw new RangeError(`units must be an integer in [1, 4] for subject-rental, got ${units}`);
  }
  if (units < 2) {
    return money(0);
  }
  const vacancy =
    vacancyFactor !== undefined ? Number(vacancyFactor) : SUBJECT_RENTAL_DEFAULT_VACANCY;
  if (!Number.isFinite(vacancy) || vacancy < 0 || vacancy > 1) {
    throw new RangeError(`vacancyFactor must be in [0, 1] when supplied, got ${vacancy}`);
  }
  const net = new Decimal(grossMonthlyRent).mul(1 - vacancy);
  return money(roundCents(net));
};

/** Round a Decimal to whole cents (banker-agnostic, half-up). */
const roundCents = (value: Decimal): number =>
  value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();

/**
 * Applies a per-stream qualifying-income policy to a single income stream's
 * monthly amount, returning the income that should count toward DTI.
 *
 * Throws `RangeError` for malformed policy inputs (empty averaging window,
 * non-positive `monthsLookback`). Vacancy and percent factors are not
 * range-checked here because they are already branded `Ratio` values.
 */
export const applyQualifyingIncomePolicy = (
  stream: IncomeStream,
  policy: QualifyingIncomePolicy,
): Money => {
  switch (policy.kind) {
    case "AsStated":
      return stream.monthlyAmount;

    case "AveragedMonths": {
      if (policy.monthsLookback <= 0) {
        throw new RangeError(
          `AveragedMonths.monthsLookback must be > 0, got ${policy.monthsLookback}`,
        );
      }
      if (policy.historicalAmounts.length === 0) {
        throw new RangeError("AveragedMonths.historicalAmounts must not be empty");
      }
      const sum = policy.historicalAmounts.reduce(
        (acc, amount) => acc.plus(amount),
        new Decimal(0),
      );
      const average = sum.dividedBy(policy.monthsLookback);
      return money(roundCents(average));
    }

    case "RentalGross": {
      const vacancy =
        policy.vacancyFactor === undefined
          ? DEFAULT_RENTAL_VACANCY_FACTOR
          : Number(policy.vacancyFactor);
      const net = new Decimal(Number(policy.grossRent)).times(new Decimal(1).minus(vacancy));
      return money(roundCents(net));
    }

    case "PercentOfStated": {
      const adjusted = new Decimal(Number(stream.monthlyAmount)).times(Number(policy.factor));
      return money(roundCents(adjusted));
    }

    default:
      return assertNever(
        policy,
        `Unknown qualifying income policy kind: ${(policy as { kind: string }).kind}`,
      );
  }
};

/**
 * Default policy resolution for an income stream that has no explicit
 * `qualifyingPolicy`. Pure function of `stream.type`.
 *
 * Notes on conservative deferrals:
 * - `SelfEmployed`, `Bonus`, and `RSU` traditionally require 24-month
 *   averaging from tax returns / vesting schedules. That historical data is
 *   not available at this layer, so the default resolves to
 *   `PercentOfStated` with `factor = 1.0` and the product layer
 *   (Income averaging refinement) is responsible for supplying real averaging windows
 *   when it lands.
 * - `Rental` defaults to a 75% net factor against `monthlyAmount`, which is
 *   the industry-standard vacancy/expense haircut on already-net rental
 *   income. Pair with an explicit `RentalGross` policy when the input is a
 *   gross-rent figure rather than already-net.
 *
 * When `programOverrides.perIncomeType[type]` is supplied, the override
 * wins over the built-in default for that `IncomeType`.
 */
export const defaultPolicyForIncomeType = (
  type: IncomeType,
  programOverrides?: ProgramIncomePolicies,
): QualifyingIncomePolicy => {
  const override = programOverrides?.perIncomeType?.[type];
  if (override !== undefined) {
    return override;
  }
  switch (type) {
    case IncomeType.W2:
    case IncomeType.SocialSecurity:
    case IncomeType.Pension:
    case IncomeType.Alimony:
    case IncomeType.ChildSupport:
      return { kind: "AsStated" };

    case IncomeType.SelfEmployed:
    case IncomeType.Bonus:
    case IncomeType.RSU:
      return { kind: "PercentOfStated", factor: ratio(1.0) };

    case IncomeType.Rental:
    case IncomeType.RentalDeparting:
      // RentalDeparting (income from a primary residence being converted to
      // a rental at purchase of a new primary) defaults to the same 75%
      // gross-to-net factor as standard rental income. Per-program rules
      // (FHA's 12-month landlord-history requirement, Fannie/Freddie B3-3.1
      // departure-residence haircuts) refine this via
      // `ProgramIncomePolicies.perIncomeType[RentalDeparting]`.
      return { kind: "PercentOfStated", factor: ratio(RENTAL_NET_FACTOR) };

    default:
      return assertNever(type, `Unknown IncomeType: ${String(type)}`);
  }
};

/**
 * Resolves the effective policy for a stream, falling back to the
 * income-type default (optionally overridden by `programOverrides`) when
 * no explicit policy is attached.
 */
export const resolveQualifyingPolicy = (
  stream: IncomeStream,
  programOverrides?: ProgramIncomePolicies,
): QualifyingIncomePolicy => {
  if (stream.qualifyingPolicy !== undefined) {
    return stream.qualifyingPolicy;
  }
  // Self-employed averaging: when the program declares an averaging window
  // and the stream supplies enough trailing history, resolve to
  // AveragedMonths instead of the built-in PercentOfStated 1.0 default.
  // Shorter histories fall back to the default so the math layer never
  // throws on an under-supplied stream.
  const lookback = programOverrides?.selfEmployedAveragingMonths;
  if (
    stream.type === IncomeType.SelfEmployed &&
    lookback !== undefined &&
    Number.isInteger(lookback) &&
    lookback > 0 &&
    Array.isArray(stream.historicalAmounts) &&
    stream.historicalAmounts.length >= lookback
  ) {
    return {
      kind: "AveragedMonths",
      monthsLookback: lookback,
      historicalAmounts: stream.historicalAmounts.slice(-lookback),
    };
  }
  return defaultPolicyForIncomeType(stream.type, programOverrides);
};

/**
 * Caps an explicit qualifying policy's effective rental factor at
 * `maxRentalFactor` for `Rental` streams. Applies only to `RentalGross`
 * (via the vacancy-factor complement) and `PercentOfStated` (via the
 * `factor`); `AsStated` and `AveragedMonths` have no single
 * multiplicative factor and are returned unchanged.
 */
const capRentalFactor = (
  policy: QualifyingIncomePolicy,
  maxRentalFactor: number,
): QualifyingIncomePolicy => {
  switch (policy.kind) {
    case "RentalGross": {
      const vacancy =
        policy.vacancyFactor === undefined
          ? DEFAULT_RENTAL_VACANCY_FACTOR
          : Number(policy.vacancyFactor);
      const effective = 1 - vacancy;
      if (effective <= maxRentalFactor) {
        return policy;
      }
      return {
        kind: "RentalGross",
        grossRent: policy.grossRent,
        vacancyFactor: ratio(1 - maxRentalFactor),
      };
    }
    case "PercentOfStated": {
      if (Number(policy.factor) <= maxRentalFactor) {
        return policy;
      }
      return { kind: "PercentOfStated", factor: ratio(maxRentalFactor) };
    }
    case "AsStated":
    case "AveragedMonths":
      return policy;
    default:
      return assertNever(
        policy,
        `Unknown qualifying income policy kind: ${(policy as { kind: string }).kind}`,
      );
  }
};

/**
 * Reduces a list of income streams to a single qualifying-income figure
 * after per-stream policy application. Streams with `qualifying === false`
 * are excluded entirely. Streams without an explicit `qualifyingPolicy`
 * fall back to `defaultPolicyForIncomeType(stream.type, programOverrides)`.
 *
 * When `programOverrides.maxRentalFactor` is set, any explicit rental
 * policy whose effective factor exceeds the cap is tightened to the cap
 * before evaluation. Defaulted policies already honor the override via
 * `defaultPolicyForIncomeType`.
 */
export const sumQualifyingIncomeWithPolicies = (
  streams: readonly IncomeStream[],
  programOverrides?: ProgramIncomePolicies,
): Money => {
  const maxRentalFactor = programOverrides?.maxRentalFactor;
  const total = streams
    .filter((stream) => stream.qualifying !== false)
    .reduce((acc, stream) => {
      const resolved = resolveQualifyingPolicy(stream, programOverrides);
      const policy =
        stream.qualifyingPolicy !== undefined &&
        stream.type === IncomeType.Rental &&
        maxRentalFactor !== undefined
          ? capRentalFactor(resolved, maxRentalFactor)
          : resolved;
      const adjusted = applyQualifyingIncomePolicy(stream, policy);
      return acc.plus(Number(adjusted));
    }, new Decimal(0));
  return money(roundCents(total));
};

/** Re-export the policy type and a typed alias for downstream convenience. */
export type { QualifyingIncomePolicy };
export type RentalVacancyFactor = Ratio;
