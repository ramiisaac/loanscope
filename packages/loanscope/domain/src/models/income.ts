import { IncomeType } from "../enums";
import { Money, Months } from "../primitives";
import type { QualifyingIncomePolicy } from "./income-policy";

export interface IncomeStream {
  id: string;
  borrowerId: string;
  type: IncomeType;
  monthlyAmount: Money;
  qualifying?: boolean;
  vestingMonths?: Months;
  historyMonths?: Months;
  notes?: string;
  qualifyingPolicy?: QualifyingIncomePolicy;
  /**
   * Trailing per-month income amounts (most recent month last). Consumed by
   * `AveragedMonths` qualifying policies — including the engine-resolved
   * default when a `ProgramIncomePolicies.selfEmployedAveragingMonths` is
   * set and the stream is `IncomeType.SelfEmployed`. The array length must
   * be at least the resolved `monthsLookback` for the averaging math to
   * succeed; shorter histories fall back to `monthlyAmount`.
   */
  historicalAmounts?: number[];
}
