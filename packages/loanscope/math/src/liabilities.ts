import Decimal from "decimal.js";
import { Liability, Money, money } from "@loanscope/domain";

export const sumMonthlyLiabilities = (liabilities: Liability[], excludePayoffs: boolean): Money => {
  const total = liabilities
    .filter((liability) => liability.includeInDTI !== false)
    .filter((liability) => (excludePayoffs ? liability.payoffAtClose !== true : true))
    .reduce((sum, liability) => sum.plus(liability.monthlyPayment), new Decimal(0));
  return money(total.toNumber());
};

export const deriveMonthlyLiabilities = (
  liabilities: Liability[],
  includedBorrowerIds: string[],
  payoffIds: string[],
): Money => {
  const borrowerSet = new Set(includedBorrowerIds);
  const payoffSet = new Set(payoffIds);
  const relevant = liabilities.filter((liability) =>
    liability.borrowerIds.some((id) => borrowerSet.has(id)),
  );
  const total = relevant
    .filter((liability) => liability.includeInDTI !== false)
    .filter((liability) => !payoffSet.has(liability.id))
    .reduce((sum, liability) => sum.plus(liability.monthlyPayment), new Decimal(0));
  return money(total.toNumber());
};

export const computePayoffsRequired = (liabilities: Liability[], payoffIds: string[]): Money => {
  const payoffSet = new Set(payoffIds);
  const total = liabilities
    .filter((liability) => payoffSet.has(liability.id))
    .reduce((sum, liability) => {
      const payoff = liability.payoffAmount ?? liability.unpaidBalance ?? money(0);
      return sum.plus(payoff);
    }, new Decimal(0));
  return money(total.toNumber());
};
