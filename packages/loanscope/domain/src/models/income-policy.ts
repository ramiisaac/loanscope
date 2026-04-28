import type { Money, Ratio } from "../primitives";

/**
 * Per-stream policy for converting a borrower's stated income into the
 * qualifying figure used for DTI. Defined in `@loanscope/domain` so it can
 * be referenced by `IncomeStream` without introducing a runtime dependency
 * on `@loanscope/math`.
 *
 * - `AsStated`: count `monthlyAmount` at face value.
 * - `AveragedMonths`: arithmetic mean of `historicalAmounts` over
 *   `monthsLookback` (e.g. 24-month average for self-employment / bonus).
 * - `RentalGross`: convert a gross rent figure to net by applying a vacancy
 *   factor (defaults to 25% when omitted).
 * - `PercentOfStated`: multiply `monthlyAmount` by `factor` (e.g. 0.75 for
 *   the standard rental haircut on already-net rental income).
 */
export type QualifyingIncomePolicy =
  | { readonly kind: "AsStated" }
  | {
      readonly kind: "AveragedMonths";
      readonly monthsLookback: number;
      readonly historicalAmounts: readonly number[];
    }
  | {
      readonly kind: "RentalGross";
      readonly grossRent: Money;
      readonly vacancyFactor?: Ratio;
    }
  | { readonly kind: "PercentOfStated"; readonly factor: Ratio };
