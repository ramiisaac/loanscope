// Barrel for the decomposed `db` command surface. Preserves the public
// API that downstream files (`cli/src/index.ts`, `evaluate.ts`,
// `compare.ts`, `simulate.ts`, `diff-actions.ts`,
// `scenario-version-actions.ts`, `export-actions.ts`) and the CLI test
// suite previously imported from `./db-actions` and `./db`.
//
// Each split file owns a single responsibility:
//
//   Action layer (Batch 11):
//     - scenario-actions.ts                scenario CRUD + require helper
//     - comparison-actions.ts              comparison CRUD + require helper
//     - simulation-actions.ts              simulation CRUD + require helper
//     - persist-result.ts                  evaluate/compare/simulate
//                                          persistence + loadScenarioFromDb
//                                          + the quick-quote config payload
//                                          builder
//
//   Registrar layer (Batch 12):
//     - register-db-command.ts             top-level `db` parent command
//                                          + delegation to each group
//     - register-lender-commands.ts        init / seed / status / list-lenders
//     - register-scenario-commands.ts      list/save/load/show/delete/rename
//                                          + update + history + show-version
//                                          + restore-version
//     - register-comparison-commands.ts    list/show/rename/delete
//     - register-simulation-commands.ts    list/show/rename/delete
//     - register-custom-product-commands.ts
//                                          create/list/show/validate/delete
//     - register-import-commands.ts        import / list-import-runs /
//                                          show-import-run / catalog-history
//     - register-audit-commands.ts         audit list / audit show
//
//   Shared:
//     - constants.ts                       DEFAULT_DB_PATH default for every
//                                          subcommand's --path option
export * from "./scenario-actions";
export * from "./comparison-actions";
export * from "./simulation-actions";
export * from "./persist-result";
export { registerDbCommand } from "./register-db-command";
