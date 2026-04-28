import type { LenderDefinitionInput } from "./schema";
import { uwmLender } from "@loanscope/products";
import { getDefaultRegistry } from "./registry";
import type { LenderRegistry } from "./registry";

/**
 * UWM lender definition input, constructed from the raw product catalog
 * exported by @loanscope/products. Includes presets for common product
 * groupings.
 */
export const uwmLenderInput: LenderDefinitionInput = {
  id: uwmLender.id,
  name: uwmLender.name,
  products: uwmLender.products,
  presets: [
    {
      id: "jumbo_all",
      name: "All Jumbo Products",
      productIds: uwmLender.products
        .filter((p) => p.family?.toLowerCase().includes("jumbo"))
        .map((p) => p.id),
    },
    {
      id: "jumbo_pink_30",
      name: "Jumbo Pink 30-Year Fixed",
      productIds: uwmLender.products.filter((p) => p.id === "uwm_jumbo_pink").map((p) => p.id),
    },
  ],
};

/** Registers the UWM lender into the given registry (or the default singleton). */
export function registerUWMLender(registry?: LenderRegistry): void {
  const target = registry ?? getDefaultRegistry();
  target.registerLender(uwmLenderInput);
}

/** Returns the raw UWM lender definition input for external consumption. */
export function getUWMLenderInput(): LenderDefinitionInput {
  return uwmLenderInput;
}
