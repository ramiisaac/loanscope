import type { LenderDefinition } from "@loanscope/domain";
import { UWMJumboProducts } from "./jumbo";
import { UWMPrimeJumboProducts } from "./prime-jumbo";

/** Raw UWM lender data. Registration logic lives in @loanscope/lenders. */
export const uwmLender: LenderDefinition = {
  id: "uwm",
  name: "United Wholesale Mortgage",
  products: [...UWMJumboProducts, ...UWMPrimeJumboProducts],
};
