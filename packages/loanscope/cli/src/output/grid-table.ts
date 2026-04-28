import Table from "cli-table3";
import { GridResult, gridToTable } from "@loanscope/compare";

export const renderGridTable = (result: GridResult): string => {
  const { headers, rows } = gridToTable(result);
  const table = new Table({ head: headers });
  for (const row of rows) {
    table.push(row);
  }
  return table.toString();
};
