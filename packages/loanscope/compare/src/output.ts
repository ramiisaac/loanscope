import type { GridResult, GridSummary } from "./types";

const toStringValue = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.join("|");
  if (typeof value === "number") return value.toString();
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
};

export const summarizeGrid = (result: GridResult): GridSummary => result.summary;

export const gridToTable = (result: GridResult): { headers: string[]; rows: string[][] } => {
  const dimensionKeys = Array.from(
    result.cells.reduce((keys, cell) => {
      Object.keys(cell.coordinates).forEach((key) => keys.add(key));
      return keys;
    }, new Set<string>()),
  );

  const headers = [
    ...dimensionKeys,
    "product",
    "eligible",
    "warnings",
    "payment",
    "rate",
    "ltv",
    "dti",
  ];

  const rows = result.cells.map((cell) => {
    const values = dimensionKeys.map((key) => toStringValue(cell.coordinates[key]));
    const eligible = cell.result.full?.eligible;
    const warnings = cell.result.full?.warnings.length ?? 0;
    const payment = cell.result.pricing?.payment;
    const rate = cell.result.pricing?.rate;
    const ltv = cell.result.ltv?.ltvPct;
    const dti = cell.result.dti?.dtiPct;
    return [
      ...values,
      cell.result.productName,
      eligible === undefined ? "partial" : eligible ? "PASS" : "FAIL",
      warnings.toString(),
      toStringValue(payment),
      toStringValue(rate),
      toStringValue(ltv),
      toStringValue(dti),
    ];
  });

  // Append surfaced errors as rows so they are visible in table output
  for (const err of result.errors) {
    const errDimValues = dimensionKeys.map((key) => toStringValue(err.coordinates[key]));
    rows.push([...errDimValues, err.productId, "ERROR", "0", "", "", "", ""]);
  }

  return { headers, rows };
};

export const gridToCSV = (result: GridResult): string => {
  const table = gridToTable(result);
  const lines = [table.headers.join(",")];
  for (const row of table.rows) {
    lines.push(row.map((value) => `"${value.replace(/"/g, '""')}"`).join(","));
  }
  return lines.join("\n");
};
