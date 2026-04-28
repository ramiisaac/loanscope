import type { DatabaseManager, ValidationStatus } from "@loanscope/db";
import { CliValidationError } from "../../cli-error";
import { requireCustomProductSet } from "./shared";

export interface ValidateCustomProductSetInput {
  readonly setId: string;
}

export interface ValidateCustomProductSetResult {
  readonly setId: string;
  readonly validationStatus: ValidationStatus;
  readonly message: string;
}

/**
 * Re-runs structural validation over the stored products and persists the
 * resulting status. Surfaces the current status in the returned `message`
 * so CLI callers can echo it directly.
 */
export const validateCustomProductSetAction = (
  manager: DatabaseManager,
  input: ValidateCustomProductSetInput,
): ValidateCustomProductSetResult => {
  requireCustomProductSet(manager, input.setId);
  try {
    const status = manager.customProducts.revalidateSet(input.setId);
    return {
      setId: input.setId,
      validationStatus: status,
      message: `Custom product set "${input.setId}" validation status: ${status}.`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new CliValidationError(
      `Failed to re-validate custom product set "${input.setId}": ${message}`,
    );
  }
};
