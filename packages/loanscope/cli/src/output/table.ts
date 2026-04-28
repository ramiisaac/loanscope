import Table from "cli-table3";
import { EvaluationGroup } from "@loanscope/engine";
import { GoalSeekResult } from "@loanscope/compare";
import { SimulationReport } from "@loanscope/sim";
import { formatMoney, formatRatio } from "./format";
import { failColor, passColor, warnColor } from "./colors";

const formatEligible = (eligible: boolean): string =>
  eligible ? passColor("PASS") : failColor("FAIL");

export const renderEvaluationTable = (groups: EvaluationGroup[], verbose: boolean): string => {
  const blocks: string[] = [];
  for (const group of groups) {
    const table = new Table({
      head: ["Product", "Eligible", "Warnings", "LTV", "DTI", "Payment"],
    });
    for (const result of group.results) {
      const warnings = result.warnings.length;
      table.push([
        result.productName,
        formatEligible(result.eligible),
        warnings > 0 ? warnColor(String(warnings)) : "0",
        formatRatio(result.derived.ltvRatio),
        formatRatio(result.derived.cashFlow.dtiBackEndRatio),
        formatMoney(result.derived.qualifyingPayment),
      ]);
      if (verbose && result.failureReasons.length > 0) {
        table.push(["  Reasons", result.failureReasons.join("; "), "", "", "", ""]);
      }
    }
    blocks.push(`${group.variantLabel}\n${table.toString()}`);
  }
  return blocks.join("\n\n");
};

export const renderGoalSeekResult = (result: GoalSeekResult): string => {
  const table = new Table({
    head: ["Found", "Target", "Iterations", "Converged"],
  });
  table.push([
    result.found ? passColor("YES") : failColor("NO"),
    result.targetValue.toFixed(2),
    String(result.iterations),
    result.converged ? passColor("YES") : warnColor("NO"),
  ]);
  return table.toString();
};

export const renderEvaluationCSV = (groups: EvaluationGroup[]): string => {
  const headers = ["variant", "product", "eligible", "warnings", "ltv", "dti", "payment"];
  const lines = [headers.join(",")];
  for (const group of groups) {
    for (const result of group.results) {
      const row = [
        group.variantLabel,
        result.productName,
        result.eligible ? "PASS" : "FAIL",
        String(result.warnings.length),
        formatRatio(result.derived.ltvRatio),
        formatRatio(result.derived.cashFlow.dtiBackEndRatio),
        formatMoney(result.derived.qualifyingPayment),
      ];
      lines.push(row.map((value) => `"${value.replace(/"/g, '""')}"`).join(","));
    }
  }
  return lines.join("\n");
};

export const renderGoalSeekCSV = (result: GoalSeekResult): string => {
  const headers = ["found", "target", "iterations", "converged"];
  const row = [
    result.found ? "yes" : "no",
    result.targetValue.toFixed(2),
    String(result.iterations),
    result.converged ? "yes" : "no",
  ];
  return `${headers.join(",")}\n${row.map((value) => `"${value.replace(/"/g, '""')}"`).join(",")}`;
};

export const renderSimulationReport = (report: SimulationReport): string => {
  const fixesTable = new Table({
    head: ["Product", "Eligible", "Actions", "Cash Required"],
  });
  for (const fix of report.perProductFixes) {
    fixesTable.push([
      fix.productName,
      fix.eligible ? passColor("PASS") : failColor("FAIL"),
      fix.actions.map((action) => action.kind).join(", "),
      formatMoney(fix.cashRequired),
    ]);
  }

  const bestTable = new Table({ head: ["Eligible", "Cash Used", "Actions"] });
  for (const state of report.bestStates) {
    bestTable.push([
      String(state.eligibleCount),
      formatMoney(state.totalCashUsed),
      state.actions.map((action) => action.kind).join(", "),
    ]);
  }

  const summaryTable = new Table({ head: ["States Explored", "Terminated"] });
  summaryTable.push([String(report.statesExplored), report.terminated]);

  return `Per-Product Fixes\n${fixesTable.toString()}\n\nBest States\n${bestTable.toString()}\n\nSummary\n${summaryTable.toString()}`;
};

export const renderSimulationCSV = (report: SimulationReport): string => {
  const headers = ["product", "eligible", "actions", "cashRequired"];
  const lines = [headers.join(",")];
  for (const fix of report.perProductFixes) {
    const row = [
      fix.productName,
      fix.eligible ? "PASS" : "FAIL",
      fix.actions.map((action) => action.kind).join("|"),
      formatMoney(fix.cashRequired),
    ];
    lines.push(row.map((value) => `"${value.replace(/"/g, '""')}"`).join(","));
  }
  return lines.join("\n");
};
