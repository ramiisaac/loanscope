import type { EdgeDefinition } from "@loanscope/graph";
import type { Borrower, IncomeStream, Money, ProgramIncomePolicies } from "@loanscope/domain";
import { money } from "@loanscope/domain";
import { sumQualifyingIncomeWithPolicies } from "@loanscope/math";
import Decimal from "decimal.js";
import { toArray, toMoney } from "../coercions";

/**
 * Narrow an `unknown` input to `ProgramIncomePolicies | undefined`. The
 * graph runtime hands edge inputs through as a loose value bag; we accept
 * `null` (the declared default) and `undefined` as "no overrides", and
 * otherwise treat the value as a structurally-typed `ProgramIncomePolicies`.
 * No runtime schema validation is performed here because the value is
 * produced by the engine layer from a typed `ProductDefinition`, not from
 * an untrusted IO boundary.
 */
const coerceIncomePolicies = (value: unknown): ProgramIncomePolicies | undefined => {
  if (value === null || value === undefined) {
    return undefined;
  }
  if (typeof value !== "object") {
    return undefined;
  }
  return value as ProgramIncomePolicies;
};

/**
 * Canonical producer of `qualifyingIncomeMonthly`. Filters the borrower set
 * down to `includedBorrowerIds`, flattens their income streams, and reduces
 * via per-stream qualifying-income policy (with sensible income-type
 * defaults). Streams flagged `qualifying === false` are excluded by the
 * underlying reducer.
 *
 * When the engine supplies a `ProgramIncomePolicies` object on the
 * `incomePolicies` input, per-`IncomeType` overrides and the rental
 * factor cap are honored by `sumQualifyingIncomeWithPolicies`.
 */
const readSubjectRentalIncome = (value: unknown): Money => {
  if (value === undefined || value === null) return money(0);
  return toMoney(value, "subjectRentalIncome");
};

export const incomePolicyEdges: EdgeDefinition[] = [
  {
    id: "apply-income-policies",
    kind: "transform",
    inputs: ["borrowers", "includedBorrowerIds", "incomePolicies", "subjectRentalIncome"],
    outputs: ["qualifyingIncomeMonthly"],
    confidence: "derived",
    compute: (inputs) => {
      const borrowers = toArray<Borrower>(inputs.borrowers, "borrowers");
      const allowed = new Set(toArray<string>(inputs.includedBorrowerIds, "includedBorrowerIds"));
      const streams: IncomeStream[] = borrowers
        .filter((borrower) => allowed.has(borrower.id))
        .flatMap((borrower) => borrower.incomes);

      const programOverrides = coerceIncomePolicies(inputs.incomePolicies);
      const streamIncome =
        streams.length > 0 ? sumQualifyingIncomeWithPolicies(streams, programOverrides) : money(0);

      const subjectIncome = readSubjectRentalIncome(inputs.subjectRentalIncome);

      // Suppress emission entirely when the borrower set has no income and
      // there is no subject-rental contribution; the downstream check edge
      // already handles a missing `qualifyingIncomeMonthly` by blocking.
      if (streamIncome === 0 && subjectIncome === 0) {
        return {};
      }

      const total = new Decimal(streamIncome).plus(subjectIncome);
      return {
        qualifyingIncomeMonthly: money(total.toNumber()),
      };
    },
  },
];
