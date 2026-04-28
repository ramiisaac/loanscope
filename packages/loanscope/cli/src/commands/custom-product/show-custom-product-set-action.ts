import { renderJson } from "../../output";

import type { DatabaseManager } from "@loanscope/db";
import type { ActionOutputFormat } from "../../output";
import {
  requireCustomProductSet,
  toCustomProductSetMetadata,
  type CustomProductSetFullJson,
} from "./shared";

export interface ShowCustomProductSetInput {
  readonly setId: string;
  readonly output: ActionOutputFormat;
}

/**
 * Renders metadata for a single custom product set. Text mode emits a
 * metadata-only summary; JSON mode emits the full record including the
 * deserialized product array.
 */
export const showCustomProductSetAction = (
  manager: DatabaseManager,
  input: ShowCustomProductSetInput,
): string => {
  const record = requireCustomProductSet(manager, input.setId);
  const metadata = toCustomProductSetMetadata(record);

  if (input.output === "json") {
    const full: CustomProductSetFullJson = {
      ...metadata,
      products: record.products,
    };
    return renderJson(full);
  }

  const lines: string[] = [
    `Set:       ${metadata.setId}`,
    `Name:      ${metadata.name}`,
    `Lender:    ${metadata.lenderId ?? "(none)"}`,
    `Status:    ${metadata.validationStatus}`,
    `Products:  ${metadata.productCount}`,
    `Created:   ${metadata.createdAt}`,
    `Updated:   ${metadata.updatedAt}`,
  ];
  for (const product of record.products) {
    lines.push(`  - ${product.id} (${product.name})`);
  }
  return lines.join("\n");
};
