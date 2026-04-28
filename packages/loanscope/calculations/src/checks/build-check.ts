import type { CheckMargin, UnderwritingCheck } from "@loanscope/domain";
import { CheckSeverity, CheckStatus } from "@loanscope/domain";
import type { Ratio } from "@loanscope/domain";

interface CheckParams {
  key: string;
  status: CheckStatus;
  actual?: string;
  limit?: string;
  message?: string;
  margin?: CheckMargin;
  severity?: CheckSeverity;
}

/** Build a canonical check result, optionally embedding severity for engine aggregation. */
export const buildCheck = (
  params: CheckParams,
): UnderwritingCheck & { severity?: CheckSeverity } => {
  const result: UnderwritingCheck & { severity?: CheckSeverity } = {
    key: params.key,
    status: params.status,
  };
  if (params.actual !== undefined) result.actual = params.actual;
  if (params.limit !== undefined) result.limit = params.limit;
  if (params.message !== undefined) result.message = params.message;
  if (params.margin !== undefined) result.margin = params.margin;
  if (params.severity !== undefined) result.severity = params.severity;
  return result;
};

/* ------------------------------------------------------------------ */
/*  Status-shorthand helpers (shared across per-check edge files)     */
/* ------------------------------------------------------------------ */

export const pass = (
  key: string,
  severity: CheckSeverity,
  actual?: string,
  limit?: string,
  message?: string,
  margin?: CheckMargin,
): UnderwritingCheck & { severity?: CheckSeverity } =>
  buildCheck({
    key,
    status: CheckStatus.PASS,
    ...(actual !== undefined ? { actual } : {}),
    ...(limit !== undefined ? { limit } : {}),
    ...(message !== undefined ? { message } : {}),
    ...(margin !== undefined ? { margin } : {}),
    severity,
  });

export const fail = (
  key: string,
  severity: CheckSeverity,
  actual?: string,
  limit?: string,
  message?: string,
  margin?: CheckMargin,
): UnderwritingCheck & { severity?: CheckSeverity } =>
  buildCheck({
    key,
    status: CheckStatus.FAIL,
    ...(actual !== undefined ? { actual } : {}),
    ...(limit !== undefined ? { limit } : {}),
    ...(message !== undefined ? { message } : {}),
    ...(margin !== undefined ? { margin } : {}),
    severity,
  });

export const warn = (
  key: string,
  severity: CheckSeverity,
  actual?: string,
  limit?: string,
  message?: string,
  margin?: CheckMargin,
): UnderwritingCheck & { severity?: CheckSeverity } =>
  buildCheck({
    key,
    status: CheckStatus.WARN,
    ...(actual !== undefined ? { actual } : {}),
    ...(limit !== undefined ? { limit } : {}),
    ...(message !== undefined ? { message } : {}),
    ...(margin !== undefined ? { margin } : {}),
    severity,
  });

/** Blocker check with absent rule context returns FAIL with explanatory message. */
export const blocked = (
  key: string,
  missingField: string,
): UnderwritingCheck & { severity?: CheckSeverity } =>
  buildCheck({
    key,
    status: CheckStatus.FAIL,
    message: `Missing required rule context: ${missingField}`,
    severity: CheckSeverity.Blocker,
  });

/** Warning/info check with absent rule context returns WARN with degraded note. */
export const degraded = (
  key: string,
  severity: CheckSeverity,
  missingField: string,
): UnderwritingCheck & { severity?: CheckSeverity } =>
  buildCheck({
    key,
    status: CheckStatus.WARN,
    message: `Degraded: missing ${missingField}`,
    severity,
  });

export const fmtPct = (r: Ratio): string => `${(Number(r) * 100).toFixed(2)}%`;
