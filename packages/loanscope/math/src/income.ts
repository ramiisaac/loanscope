import Decimal from "decimal.js";
import type { Borrower, IncomeStream, Money } from "@loanscope/domain";
import { money } from "@loanscope/domain";

/** Distinguishes "no income data found" from "income streams exist but sum to zero". */
export interface IncomeResult {
  totalMonthlyIncome: Money;
  hasIncomeStreams: boolean;
}

/** Sums qualifying income streams. Returns result with metadata about whether any streams existed. */
export const sumQualifyingIncome = (incomes: IncomeStream[]): IncomeResult => {
  const qualifying = incomes.filter((income) => income.qualifying !== false);
  const total = qualifying.reduce((sum, income) => sum.plus(income.monthlyAmount), new Decimal(0));
  return {
    totalMonthlyIncome: money(total.toNumber()),
    hasIncomeStreams: qualifying.length > 0,
  };
};

/**
 * Derives qualifying income for a set of included borrowers.
 * Returns money(0) with hasIncomeStreams=false when no borrowers or no income streams match.
 */
export const deriveQualifyingIncome = (
  borrowers: Borrower[],
  includedBorrowerIds: string[],
): IncomeResult => {
  const allowed = new Set(includedBorrowerIds);
  const incomes = borrowers
    .filter((borrower) => allowed.has(borrower.id))
    .flatMap((borrower) => borrower.incomes);
  return sumQualifyingIncome(incomes);
};
