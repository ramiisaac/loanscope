import { Money, Ratio, RatePct } from "@loanscope/domain";

const moneyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const percentFormatter = new Intl.NumberFormat("en-US", {
  style: "percent",
  maximumFractionDigits: 2,
});

export const formatMoney = (amount: Money | undefined): string => {
  if (amount === undefined) return "-";
  return moneyFormatter.format(Number(amount));
};

export const formatRatio = (ratio: Ratio | undefined): string => {
  if (ratio === undefined) return "-";
  return percentFormatter.format(Number(ratio));
};

export const formatRatePct = (rate: RatePct | undefined): string => {
  if (rate === undefined) return "-";
  return `${Number(rate).toFixed(3)}%`;
};

/**
 * Canonical JSON serializer for CLI action output. Centralizes the
 * two-space indentation convention so future changes (e.g. compact mode,
 * streaming pretty-print) have a single seam to modify.
 */
export const renderJson = (value: unknown): string => JSON.stringify(value, null, 2);

/**
 * Output format for action-layer functions that produce human-readable
 * strings (text) or machine-parseable strings (json). Narrower than the
 * top-level `CliOutputFormat` because action-layer renderers do not own
 * tabular CSV emission.
 */
export type ActionOutputFormat = "text" | "json";
