import type { ScopedRunResponse } from "@loanscope/domain";
import { passColor, failColor, warnColor, infoColor } from "./colors";

/** Render a section header with consistent formatting. */
const sectionHeader = (title: string, colorFn: (s: string) => string): string =>
  colorFn(`--- ${title} ---`);

/** Render blocked inputs with their missing dependencies and unlocked features. */
const renderBlocked = (blocked: ScopedRunResponse["blocked"]): string[] => {
  if (blocked.length === 0) return [];
  const lines: string[] = [sectionHeader("Blocked Inputs", warnColor)];
  for (const entry of blocked) {
    lines.push(warnColor(`  [BLOCKED] ${entry.nodeId}`));
    lines.push(
      `    Missing: ${entry.missingInputs.length > 0 ? entry.missingInputs.join(", ") : "(none)"}`,
    );
    if (entry.unlocksFeatures.length > 0) {
      lines.push(`    Unlocks: ${entry.unlocksFeatures.join(", ")}`);
    }
  }
  return lines;
};

/** Render execution errors surfaced during scoped evaluation. */
const renderErrors = (errors: ScopedRunResponse["errors"]): string[] => {
  if (errors.length === 0) return [];
  const lines: string[] = [sectionHeader("Errors", failColor)];
  for (const err of errors) {
    const prefix = err.code ? `[${err.code}] ` : "";
    lines.push(failColor(`  ${prefix}${err.message}`));
    if (err.edgeId) {
      lines.push(`    Edge: ${err.edgeId}`);
    }
    if (err.nodeIds && err.nodeIds.length > 0) {
      lines.push(`    Nodes: ${err.nodeIds.join(", ")}`);
    }
  }
  return lines;
};

/** Render estimates that were substituted for missing inputs. */
const renderEstimates = (estimates: ScopedRunResponse["estimatesUsed"]): string[] => {
  if (estimates.length === 0) return [];
  const lines: string[] = [sectionHeader("Estimates Used", warnColor)];
  for (const est of estimates) {
    const displayValue = est.value === null || est.value === undefined ? "N/A" : String(est.value);
    lines.push(warnColor(`  ${est.field}`) + ` = ${displayValue} (${est.source})`);
  }
  return lines;
};

/** Render scope distinction between input scope and effective scope. */
const renderScopeDistinction = (inputScope: string[], effectiveScope: string[]): string[] => {
  if (inputScope.length === 0 && effectiveScope.length === 0) return [];

  const lines: string[] = [sectionHeader("Scope", infoColor)];
  lines.push(`  Input scope:     ${inputScope.length > 0 ? inputScope.join(", ") : "(none)"}`);
  lines.push(
    `  Effective scope: ${effectiveScope.length > 0 ? effectiveScope.join(", ") : "(none)"}`,
  );

  const added = effectiveScope.filter((s) => !inputScope.includes(s));
  const removed = inputScope.filter((s) => !effectiveScope.includes(s));

  if (added.length > 0) {
    lines.push(infoColor(`  Added by engine:   ${added.join(", ")}`));
  }
  if (removed.length > 0) {
    lines.push(warnColor(`  Removed/blocked:   ${removed.join(", ")}`));
  }
  return lines;
};

/** Render per-product check results when available. */
const renderChecks = (products: ScopedRunResponse["products"]): string[] => {
  const lines: string[] = [];
  for (const product of products) {
    if (!product.checks || product.checks.length === 0) continue;

    const label = product.variantId
      ? `${product.productName} (${product.variantId})`
      : product.productName;
    lines.push(sectionHeader(`Checks: ${label}`, infoColor));

    for (const check of product.checks) {
      const statusColor =
        check.status === "PASS" ? passColor : check.status === "FAIL" ? failColor : warnColor;

      const statusTag = statusColor(`[${check.status}]`);
      const actualLimit =
        check.actual !== undefined && check.limit !== undefined
          ? ` ${check.actual} / ${check.limit}`
          : "";
      const msg = check.message ? ` -- ${check.message}` : "";
      lines.push(`  ${statusTag} ${check.key}${actualLimit}${msg}`);

      if (check.margin) {
        const hint = check.margin.actionHint ? ` (${check.margin.actionHint})` : "";
        lines.push(`    Delta to pass: ${check.margin.deltaToPass} ${check.margin.kind}${hint}`);
      }

      if (check.severity && check.severity !== "info") {
        lines.push(`    Severity: ${check.severity}`);
      }
    }
  }
  return lines;
};

/** Render a complete scope analysis from a ScopedRunResponse. */
export const renderScopeAnalysis = (result: ScopedRunResponse): string => {
  const sections: string[][] = [
    renderScopeDistinction(result.inputScope, result.effectiveScope),
    renderBlocked(result.blocked),
    renderErrors(result.errors),
    renderEstimates(result.estimatesUsed),
    renderChecks(result.products),
  ];

  const allLines = sections.filter((s) => s.length > 0).flatMap((s) => [...s, ""]);

  if (allLines.length === 0) {
    return passColor("Scope complete. No missing inputs or issues detected.");
  }

  return allLines.join("\n").trimEnd();
};
