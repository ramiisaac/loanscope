// Barrel for the decomposed `checks/` module.
//
// Each per-check edge lives in its own file (Batch 13). This
// barrel preserves the historical public surface so existing
// consumers (`calculations/src/index.ts`, the engine's edge
// registry, the calculations test suite) keep working
// unchanged.
//
// `checkEdges` order is preserved from the original `index.ts`
// because `registry.getAllEdges()` and downstream graph wiring
// rely on stable insertion order.
import type { EdgeDefinition } from "@loanscope/graph";

import { ltvCheckEdge } from "./ltv-check";
import { cltvCheckEdge } from "./cltv-check";
import { dtiCheckEdge } from "./dti-check";
import { ficoCheckEdge } from "./fico-check";
import { loanAmountCheckEdge } from "./loan-amount-check";
import { reservesCheckEdge } from "./reserves-check";
import { cashToCloseCheckEdge } from "./cash-to-close-check";
import { occupancyCheckEdge } from "./occupancy-check";
import { purposeCheckEdge } from "./purpose-check";
import { propertyTypeCheckEdge } from "./property-type-check";
import { unitsCheckEdge } from "./units-check";
import { borrowerRestrictionsCheckEdge } from "./borrower-restrictions-check";
import { stateRestrictionsCheckEdge } from "./state-restrictions-check";
import { cashOutCheckEdge } from "./cash-out-check";
import { buydownCheckEdge } from "./buydown-check";
import { miCheckEdge } from "./mi-check";
import { ausCheckEdge } from "./aus-check";
import { appraisalCheckEdge } from "./appraisal-check";

export { ltvCheckEdge } from "./ltv-check";
export { cltvCheckEdge } from "./cltv-check";
export { dtiCheckEdge } from "./dti-check";
export { ficoCheckEdge } from "./fico-check";
export { loanAmountCheckEdge } from "./loan-amount-check";
export { reservesCheckEdge } from "./reserves-check";
export { cashToCloseCheckEdge } from "./cash-to-close-check";
export { occupancyCheckEdge } from "./occupancy-check";
export { purposeCheckEdge } from "./purpose-check";
export { propertyTypeCheckEdge } from "./property-type-check";
export { unitsCheckEdge } from "./units-check";
export { borrowerRestrictionsCheckEdge } from "./borrower-restrictions-check";
export { stateRestrictionsCheckEdge } from "./state-restrictions-check";
export { cashOutCheckEdge } from "./cash-out-check";
export { buydownCheckEdge } from "./buydown-check";
export { miCheckEdge } from "./mi-check";
export { ausCheckEdge } from "./aus-check";
export { appraisalCheckEdge } from "./appraisal-check";

export const checkEdges: EdgeDefinition[] = [
  ltvCheckEdge,
  cltvCheckEdge,
  dtiCheckEdge,
  ficoCheckEdge,
  loanAmountCheckEdge,
  reservesCheckEdge,
  cashToCloseCheckEdge,
  occupancyCheckEdge,
  purposeCheckEdge,
  propertyTypeCheckEdge,
  unitsCheckEdge,
  borrowerRestrictionsCheckEdge,
  stateRestrictionsCheckEdge,
  cashOutCheckEdge,
  buydownCheckEdge,
  miCheckEdge,
  ausCheckEdge,
  appraisalCheckEdge,
];
