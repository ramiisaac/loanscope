import { Money, money } from "@loanscope/domain";

/** National conforming and high-balance limits by year (FHFA announcements). */
const LIMITS_BY_YEAR: Record<number, { conforming: Money; highBalance: Money }> = {
  2023: { conforming: money(726200), highBalance: money(1089300) },
  2024: { conforming: money(766550), highBalance: money(1149825) },
  2025: { conforming: money(806500), highBalance: money(1209750) },
};

const DEFAULT_YEAR = 2024;

export const CONFORMING_LIMIT_2024: Money = money(766550);
export const HIGH_BALANCE_LIMIT_2024: Money = money(1149825);

/**
 * Return national conforming and high-balance limits for a given origination
 * year. Falls back to 2024 limits for years without data.
 */
export const getLimitsForYear = (year: number): { conforming: Money; highBalance: Money } => {
  return LIMITS_BY_YEAR[year] ?? LIMITS_BY_YEAR[DEFAULT_YEAR]!;
};

/**
 * Return county-specific conforming and high-balance limits.
 *
 * County-specific limits currently fall back to the national defaults until a
 * county-limit dataset is integrated.
 */
export const getCountyLimits = (countyFips: string): { conforming: Money; highBalance: Money } => {
  void countyFips;
  return {
    conforming: CONFORMING_LIMIT_2024,
    highBalance: HIGH_BALANCE_LIMIT_2024,
  };
};
