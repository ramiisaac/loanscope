import type { DatabaseManager } from "@loanscope/db";
import { requireCustomProductSet } from "./shared";

export interface DeleteCustomProductSetInput {
  readonly setId: string;
}

/**
 * Deletes a custom product set. Raises `CliValidationError` when the set does
 * not exist so the CLI reports a clean unknown-id error instead of a silent
 * no-op.
 */
export const deleteCustomProductSetAction = (
  manager: DatabaseManager,
  input: DeleteCustomProductSetInput,
): string => {
  requireCustomProductSet(manager, input.setId);
  manager.customProducts.deleteSet(input.setId);
  return `Deleted custom product set "${input.setId}".`;
};
