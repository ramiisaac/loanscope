import { LoanType, Location } from "@loanscope/domain";
import { Money, money } from "@loanscope/domain";

export const DEFAULT_CONFORMING_LIMIT = money(766550);
export const DEFAULT_HIGH_BALANCE_LIMIT = money(1149825);

export const classifyLoanType = (
  loanAmount: Money,
  conformingLimit: Money,
  highBalanceLimit: Money,
  isHighCostArea: boolean,
): LoanType => {
  if (loanAmount <= conformingLimit) return LoanType.Conventional;
  if (isHighCostArea && loanAmount <= highBalanceLimit) return LoanType.HighBalance;
  return LoanType.Jumbo;
};

export const getEffectiveLimits = (
  location?: Location,
): { conforming: Money; highBalance: Money } => {
  return {
    conforming: location?.conformingLimitOverride ?? DEFAULT_CONFORMING_LIMIT,
    highBalance: location?.highBalanceLimitOverride ?? DEFAULT_HIGH_BALANCE_LIMIT,
  };
};
