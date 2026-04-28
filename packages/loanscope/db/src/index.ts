export { createDatabase, createMemoryDatabase, withTx } from "./connection";
export type { LoanScopeDB, TxDatabase } from "./connection";

export { applySchema } from "./migrate";

export * from "./schema";

export * from "./repositories";

export { seedLender, seedLenders } from "./seed";

export { PersistentLenderRegistry, PersistentRegistryError } from "./persistent-registry";

export { CustomProductService, validateProductStructure } from "./custom-product-service";

// Explicit re-exports from `./mappers` to intentionally narrow the public
// surface: most mapper helpers are internal-only. Only payload-version
// introspection is part of the public API.
export {
  CURRENT_PAYLOAD_VERSION,
  assessPayloadVersion,
  assessCatalogPayloadVersion,
} from "./mappers";
export type { PayloadVersionAssessment } from "./mappers";

export { DatabaseManager } from "./database-manager";
export type { DatabaseStats } from "./database-manager";
