import { renderJson } from "../../output";

import type { DatabaseManager } from "@loanscope/db";
import type { ActionOutputFormat } from "../../output";
import { toCustomProductSetMetadata } from "./shared";

export interface ListCustomProductSetsInput {
  readonly output: ActionOutputFormat;
}

/**
 * Returns a rendered listing of all custom product sets. Text mode produces a
 * compact multi-line summary; JSON mode returns stable metadata entries.
 */
export const listCustomProductSetsAction = (
  manager: DatabaseManager,
  input: ListCustomProductSetsInput,
): string => {
  const all = manager.customProducts.listSets();
  if (input.output === "json") {
    return renderJson(all.map(toCustomProductSetMetadata));
  }
  if (all.length === 0) {
    return "No custom product sets.";
  }

  const lines: string[] = [];
  for (const record of all) {
    const lenderSuffix = record.lenderId !== null ? ` [lender: ${record.lenderId}]` : "";
    lines.push(`${record.setId} — ${record.name} [${record.validationStatus}]${lenderSuffix}`);
    lines.push(`  Products: ${record.products.length}`);
    lines.push(`  Created:  ${record.createdAt}`);
  }
  return lines.join("\n");
};
