import Decimal from "decimal.js";
import { Money, Months, RatePct, money } from "@loanscope/domain";
import { calculatePMTFixed } from "./payment";

export interface AmortizationRow {
  month: number;
  payment: Money;
  principal: Money;
  interest: Money;
  balance: Money;
}

export const generateAmortizationSchedule = (
  principal: Money,
  rate: RatePct,
  months: Months,
): AmortizationRow[] => {
  const monthlyRate = new Decimal(rate).div(100).div(12);
  let balance = new Decimal(principal);
  const payment = new Decimal(calculatePMTFixed(principal, rate, months));
  const rows: AmortizationRow[] = [];
  for (let i = 1; i <= Number(months); i += 1) {
    const interest = balance.mul(monthlyRate);
    const principalPaid = payment.minus(interest);
    balance = balance.minus(principalPaid);
    rows.push({
      month: i,
      payment: money(payment.toNumber()),
      principal: money(principalPaid.toNumber()),
      interest: money(interest.toNumber()),
      balance: money(Decimal.max(balance, 0).toNumber()),
    });
  }
  return rows;
};

export const getBalanceAtMonth = (
  principal: Money,
  rate: RatePct,
  months: Months,
  targetMonth: number,
): Money => {
  const schedule = generateAmortizationSchedule(principal, rate, months);
  const row = schedule[Math.min(Math.max(targetMonth, 1), schedule.length) - 1];
  return row ? row.balance : money(0);
};

export const getPrincipalPaidByMonth = (
  principal: Money,
  rate: RatePct,
  months: Months,
  targetMonth: number,
): Money => {
  const schedule = generateAmortizationSchedule(principal, rate, months);
  const slice = schedule.slice(0, Math.min(targetMonth, schedule.length));
  const total = slice.reduce((sum, row) => sum.plus(row.principal), new Decimal(0));
  return money(total.toNumber());
};

export const getInterestPaidByMonth = (
  principal: Money,
  rate: RatePct,
  months: Months,
  targetMonth: number,
): Money => {
  const schedule = generateAmortizationSchedule(principal, rate, months);
  const slice = schedule.slice(0, Math.min(targetMonth, schedule.length));
  const total = slice.reduce((sum, row) => sum.plus(row.interest), new Decimal(0));
  return money(total.toNumber());
};
