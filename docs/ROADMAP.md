# LoanScope Roadmap

Canonical roadmap for the LoanScope mortgage underwriting engine, CLI, and persistence layer. The repository's domain, backend, and CLI are the maintained surfaces; non-terminal UIs (including `apps/web`) are out of scope until the items below are closed.

## Current State

The core underwriting engine and the persistence package are implemented:

- Computational graph with provenance tracking and first-class checks
- Boundary validation at all entry points (CLI, config, engine)
- Product evaluation across Agency, Government, and Portfolio channels
- Lender registry with generic / preset / custom product-source selection
- Grid comparison with bounded parallel execution and goal-seek
- Simulation engine with deterministic cash accounting and Pareto ranking
- ARM variants and Freddie-specific agency products
- Qualifying payment wired into DTI
- Persistence package `@loanscope/db` (SQLite + Drizzle) with schema, migrations, repository adapters, custom-product service, persistent lender registry, and seeding (waves DB-1 through DB-5 implemented at the package level)
- CLI commands: `quote`, `evaluate`, `compare`, `goalseek`, `simulate`, `diff`, `batch`, `export-scenario`, plus `db init`, `db seed`, `db status`, `db list-lenders`, `db list-scenarios`, `db save-scenario`, `db load-scenario`, `db show-scenario`, `db rename-scenario`, `db delete-scenario`, `db update-scenario`, `db scenario-history`, `db show-scenario-version`, `db restore-scenario-version`, `db list-comparisons`, `db show-comparison`, `db rename-comparison`, `db delete-comparison`, `db list-simulations`, `db show-simulation`, `db rename-simulation`, `db delete-simulation`, `db custom-product create`, `db custom-product list`, `db custom-product show`, `db custom-product validate`, `db custom-product delete`, `db import`, `db list-import-runs`, `db show-import-run`, `db catalog-history`, `db audit list`, `db audit show`, plus `evaluate --save`/`--from-db`/`--audit`, `compare --save`/`--audit`, and `simulate --save`/`--audit`
- 690+ tests, zero skipped

No active workstream. The persistence layer is fully surfaced through the CLI (see the Completed Workstreams section below). Infrastructure (npm publication, versioning, release automation) is the most likely candidate for the next active workstream once the team chooses to take it on.

## Completed Workstreams

### Persistence Layer Surfaced

The data model was built ahead of the CLI. This workstream surfaced every repository through user-facing commands, plus audit sessions and reproducibility primitives (diff, batch, export-scenario). Every subsection below is implemented and verified; kept here as provenance rather than a todo list.

### CLI: Saved scenarios — implemented

- `loanscope db save-scenario --name <name> [--description ...] [--id <slug>] --config <file>` — persists the raw parsed YAML object via `SavedScenarioRepository.create`. Validates the payload with `parseConfig` at the boundary so unparseable configs are rejected before persistence. Auto-derives the scenario id from `--name` plus a UTC `yyyymmddHHMMSS` suffix when `--id` is omitted.
- `loanscope db load-scenario <id> [--output yaml|json]` — emits the stored payload via `dumpYaml` (default) or pretty-printed JSON. Output is re-loadable by `evaluate --config`.
- `loanscope db show-scenario <id> [--json]` — prints concise metadata, or the full record (including `result` payload) when `--json` is set.
- `loanscope db rename-scenario <id> --name <new-name>` — updates the stored name via `SavedScenarioRepository.updateName`.
- `loanscope db delete-scenario <id>` — removes the row; throws `CliValidationError` on unknown id.

Shared CLI helpers used by these commands and reusable by the comparison/simulation/audit commands below: `slugify`, `timestampSuffix`, `buildId` in `packages/loanscope/cli/src/ids.ts`; `parseScenarioPayloadFormat` in `packages/loanscope/cli/src/utils.ts`.

### CLI: Save evaluation / comparison / simulation results — implemented

- `loanscope evaluate --save <name> [--id <slug>] [--description <text>]` — persists the raw parsed YAML object (or an interactive quick-quote payload) plus the resolved evaluation result via `SavedScenarioRepository.create` + `updateResult`.
- `loanscope evaluate --from-db <scenarioId>` — replays a saved scenario through the evaluator without writing unless `--save` is also set.
- `loanscope compare --save <name> [--id <slug>] [--from-db <scenarioId>]` — persists the comparison grid result via `SavedComparisonRepository.create` + `updateResult`, linking the optional `scenarioId` FK when `--from-db` is used.
- `loanscope simulate --save <name> [--id <slug>] [--from-db <scenarioId>]` — persists the simulation report via `SavedSimulationRepository.create` + `updateResult`, linking the optional `scenarioId` FK when `--from-db` is used.
- `loanscope db list-comparisons`, `loanscope db show-comparison <id> [--json]`, `loanscope db rename-comparison <id> --name <new-name>`, and `loanscope db delete-comparison <id>` surface the saved-comparison rows.
- `loanscope db list-simulations`, `loanscope db show-simulation <id> [--json]`, `loanscope db rename-simulation <id> --name <new-name>`, and `loanscope db delete-simulation <id>` surface the saved-simulation rows.

### CLI: Custom product set management (implemented)

- `loanscope db custom-product create --file <path> --name <name> [--set-id <slug>] [--lender <id>]` — load product definitions from YAML or JSON (extension-dispatched via `@loanscope/config`'s `loadYamlFile` and the built-in JSON parser), structurally validate every entry through `validateProductStructure`, and persist the set via `CustomProductService.createSet`. The `setId` is derived deterministically from `--name` plus a UTC timestamp suffix when not supplied explicitly.
- `loanscope db custom-product list [--json]` — enumerate all custom product sets with their validation status and product counts.
- `loanscope db custom-product show <setId> [--json]` — metadata-only text output by default; `--json` emits the full record including the deserialized `ProductDefinition` array.
- `loanscope db custom-product validate <setId>` — re-runs `validateProductStructure` over the stored products and persists the new `validationStatus` via `CustomProductService.revalidateSet`.
- `loanscope db custom-product delete <setId>` — raises a clean `CliValidationError` when the set does not exist rather than silently no-opping.

These complete the existing `--product-source custom` flow by making the underlying sets manageable from the CLI rather than only programmatically.

### CLI: Catalog import pipeline (implemented, YAML + JSON; CSV deferred)

- `loanscope db import --lender <id> --file <path> [--format yaml|json] [--json]` — reads a YAML or JSON product file (extension-inferred when `--format` is omitted), SHA-256 hashes the raw contents, structurally validates every entry via `validateProductStructure`, and writes `import_runs` + `catalog_versions` + `product_catalogs` rows atomically inside a single better-sqlite3 transaction. All-invalid payloads finalize as `failed` with no catalog version written; mixed payloads finalize as `partial` with the valid subset persisted and the full error log attached to the run row; fully valid payloads finalize as `success`. A thrown error inside the transaction rolls back both the pending run row and any partial catalog writes, so no dangling `pending` state can accumulate.
- `loanscope db list-import-runs [--lender <id>] [--json]` — enumerates catalog import runs (optionally filtered by lender) in ascending chronological order with per-run status, imported / failed counts, source file, format, and linked `catalog_versions.id`.
- `loanscope db show-import-run <runId> [--json]` — full detail for a single run including `contentHash`, `startedAt` / `completedAt`, and the aggregated structural-validation error log.
- `loanscope db catalog-history --lender <id> [--json]` — descending-version listing of every persisted `catalog_versions` row for a lender, each annotated with its `productCount`, content hash, import timestamp, and source file.
- Initial supported formats: YAML and JSON (deterministic, no runtime dep beyond `js-yaml` / built-in `JSON`). CSV is rejected at the CLI boundary until the column schema is fixed; Excel is not planned (avoids a runtime dep).

### CLI: Audit sessions (implemented)

- Opt-in `--audit` flag on `evaluate`, `compare`, and `simulate` records an `audit_sessions` row via `AuditSessionRepository`. The session opens in status `running` with the full `argsPayload` captured before any evaluation work (configPath, overrides, save/id/description, fromDb, interactive flag, and grid/plan flags where applicable). The target scenario id is linked on the row at session start when `--from-db` is supplied so failed audits still preserve the lineage.
- On success the session is finalized with a command-specific `resultSummary`: `evaluate` emits `{ phase, eligibleCount, ineligibleCount, warningsCount, totalResults, variantCount, persistedScenarioId }`; `compare` mirrors `GridSummary` plus `{ persistedComparisonId, scenarioId }`; `simulate` emits `{ statesExplored, terminated, perProductFixesCount, bestStatesCount, persistedSimulationId, scenarioId }`.
- On error the session is finalized with `{ phase: "evaluation" | "persistence", message, errorName }` so a failed run is still queryable and the phase distinguishes engine/compare/sim throws from post-run persistence throws. A phase-aware `try/catch` around the combined evaluation + persistence block guarantees exactly-one completion call per `startAudit`.
- `loanscope db audit list [--command <name>] [--json]` — enumerates audit sessions ascending by `startedAt`, optionally narrowed to a single command.
- `loanscope db audit show <sessionId> [--json]` — full detail including `argsPayload` and `resultSummary` rendered via nested `JSON.stringify` in text mode and as the stable machine-readable contract in `--json` mode.
- `--audit` composes with `--save` and `--from-db`. A single `DatabaseManager` instance is opened at command entry and reused by the audit, save, and from-db code paths; this is asserted in-unit by spying on `DatabaseManager.open` across a `--save --from-db --audit` run.

This closes the "reproducible saved evaluation/comparison/simulation runs" goal.

### Persistence package follow-ups

- `packages/loanscope/db/src/mappers/` — implemented. Domain↔row conversion is extracted into per-entity mapper modules (`lender-mapper`, `catalog-mapper`, `preset-mapper`, `custom-product-set-mapper`, `scenario-mapper`, `scenario-version-mapper`, `comparison-mapper`, `simulation-mapper`, `import-run-mapper`, `audit-session-mapper`) plus an internal barrel. Repositories import their mapper instead of inlining `toRecord` / JSON helpers; public API and behavior are unchanged. Mappers are internal to `@loanscope/db` (not re-exported from the package index). Covered by `packages/loanscope/db/src/__tests__/mappers.test.ts` (9 describe blocks, 29 tests asserting round-trip invariants, null handling, and JSON (de)serialization for the catalog / custom product set / preset / import-run payload columns).
- Scenario versioning — implemented. New `scenario_versions` table with `(scenarioId, version)` UNIQUE index and `ON DELETE CASCADE` from `saved_scenarios`. Every successful initial `db save-scenario` (and `evaluate --save` etc.) writes version 1 with `changeKind = "create"` inside the same transaction as the saved-scenario insert; every `db update-scenario` mutation appends `version = latest + 1` with `changeKind = "update"`; `db restore-scenario-version` appends a new version with `changeKind = "restore"` and `restoredFromVersion` pointing at the source. New `ScenarioVersionRepository` (`append`, `findVersion`, `getLatestVersion`, `findHistory`, `countVersions`) wired into `DatabaseManager.scenarioVersions`. CLI surface: `db update-scenario <scenarioId> --config <file> [--note <text>]`, `db scenario-history <scenarioId> [--json]`, `db show-scenario-version <scenarioId> <version> [--output yaml|json]` (accepts `v3`-style or plain integer version arguments), `db restore-scenario-version <scenarioId> <version> [--note <text>]`. `db status` now surfaces a `Scenario versions:` count. Covered by `packages/loanscope/db/src/__tests__/scenario-versions.test.ts` (13 tests) and `packages/loanscope/cli/src/__tests__/scenario-version.test.ts` (22 tests across save/update/history/show/restore/cascade/require helpers).
- Catalog payload version migration tests — implemented (assessment surface only). `catalog_versions.payload_version` is the storage marker; `CURRENT_PAYLOAD_VERSION` and the `PayloadVersionAssessment` discriminated union (`current` | `compatible-prior` | `unsupported-prior` | `future`) live in `packages/loanscope/db/src/mappers/catalog-mapper.ts`. `assessPayloadVersion(stored, current?)` and the lender-aware `assessCatalogPayloadVersion(record, current?)` are exported from `@loanscope/db`. Pure functions, no side effects — callers decide whether to log, throw, or proceed. `CatalogRepository.getProducts` deserialization is unconditional; the assessment is informational, leaving the host code free to honor `unsupported-prior` reads with a warning rather than failing closed. Covered by `packages/loanscope/db/src/__tests__/catalog-payload-migration.test.ts` (29 tests across classification, input validation, end-to-end against stored catalogs, and the parametric "one breaking shape change behind" invariant pinned for any N).

## CLI Quality of Life

These are independent of persistence and can be parallelized with any of the items above.

### CLI: Diff command (implemented)

- `loanscope diff <kind> <idA> <idB> [--json] [--path <file>]` where `<kind>` is one of `scenario`, `comparison`, `simulation` — structural comparison of two persisted rows of the same kind. Text mode prints a headered, lexicographically-ordered diff entry list; `--json` emits the full machine-readable `DiffReport`.
- `computeDeepDiff(a, b)` returns `ReadonlyArray<DiffEntry>` with `{ path, kind: "added" | "removed" | "changed", before?, after? }`. Paths are dot-joined with array indices rendered as `[0]`, `[1]`, etc., and the entry list is sorted lexicographically by path for deterministic output.
- Result-asymmetry discriminator on the diff report — `"a-only" | "b-only" | "none" | "both-null"` — surfaces the case where exactly one side has a persisted `resultPayload` so operators can distinguish "identical configs, only one evaluated" from "genuinely different".
- Domain-aware delta summaries when both sides have a `resultPayload`: `GridSummaryDelta` for comparisons (totalCells, passCount, failCount, warnCount, partialCount, errorCount) and `SimulationReportDelta` for simulations (statesExplored, terminated, perProductFixes length, bestStates length). Summaries are extracted via structural type guards, never via `as` casting.
- Self-diff is rejected: `idA === idB` raises `CliValidationError` at the boundary. Unknown ids on either side raise `CliValidationError` naming the offending id.
- Exported actions: `diffScenariosAction`, `diffComparisonsAction`, `diffSimulationsAction`. 12 tests in `diff.test.ts`.

### CLI: Batch command (implemented)

- `loanscope batch <files...> | --list <path> [--output table|json|csv] [scenario-override flags] [--lender <id>] [--products <list>] [--product-source <kind>]` — evaluate multiple scenario files in a single deterministic run with an aggregate footer.
- Positional `<files...>` and `--list <path>` are mutually exclusive; passing both raises `CliValidationError` at the boundary. `readBatchList(listPath)` strips blank lines and lines beginning with `#` so list files can carry comments.
- Execution is sequential and deterministic in v1 — no parallel fan-out. This keeps row ordering stable and error attribution unambiguous; a parallel mode can be layered later without breaking the serial contract.
- Fail-fast: a single scenario load/evaluate throw aborts the batch. Errors are wrapped with `Failed to load/evaluate scenario "<path>":` so the offending path is always part of the surfaced message.
- `runBatchAction` is a pure action: takes `{ paths, overrides, selection }` and returns `{ scenarios, aggregate }`, where each scenario row is `{ path, eligibleCount, ineligibleCount, warningsCount, totalResults, variantCount }` and the aggregate sums those across all scenarios plus `scenarioCount`.
- Three output modes: text prints one line per scenario plus a `TOTAL (N scenarios)` footer; JSON emits the parseable `BatchReport`; CSV emits `path,eligibleCount,ineligibleCount,warningsCount,variantCount,totalResults` header plus one row per scenario. 8 tests in `batch.test.ts`.

### CLI: Export scenario command (implemented)

- `loanscope export-scenario [--from-db <scenarioId> | --config <file>] [--output yaml|json] [--out <path>] [--rate <rate>] [--term <months>] [--program <kind>] [--arm-fixed <months>] [--path <dbFile>]` — serialize a scenario back to a re-loadable config file. Falls back to `findDefaultScenario()` when neither `--from-db` nor `--config` is supplied. `--from-db` and `--config` are mutually exclusive; combining them raises `CliValidationError`.
- Shape preservation: the output file mirrors the authored shape of the source, keyed on the raw payload's top-level keys (`transaction:` vs `quickQuote:`) rather than the normalized `ConfigParseResult`. This keeps round-trip faithful — exporting a quick-quote scenario re-loads as a quick-quote, and exporting a transaction scenario re-loads as a transaction.
- Override flags (`--rate`, `--term`, `--program`, `--arm-fixed`) compose onto the loaded transaction _before_ serialization, so the exported file re-evaluates to the same transaction as the original `--config ... --rate ...` invocation.
- YAML output goes through `dumpYaml` from `@loanscope/config`; JSON output is `JSON.stringify(payload, null, 2)`. `--out <path>` writes to disk and refuses to overwrite an existing file, raising `CliValidationError`; a future `--force` flag is anticipated but out of scope for this step.
- `DatabaseManager` is opened only on the `--from-db` branch. 7 tests in `export-scenario.test.ts`.

## Engine

### Government loan support — implemented (fee math + product expansion + financing)

- `@loanscope/math#government-fees`: `calculateFhaUfmip`, `calculateFhaAnnualMipMonthly`, `calculateVaFundingFee`, `calculateUsdaUpfrontGuaranteeFee`, `calculateUsdaAnnualFeeMonthly`. Official 2024+ rate tables: FHA annual MIP per (term ≤ 15 / > 15 yr × LTV bracket), VA funding fee per (purchase / cash-out / IRRRL × LTV bracket × priorUse), VA disability-exempt → 0, USDA 1.00% upfront / 0.35% annual.
- `VaServiceContext` (priorUse / disabilityExempt / reserveOrGuard) threaded through `domain → config → engine → calculations` as an optional scenario field.
- `calculations/src/edges/government-fees.ts` — `calculate-government-fees` edge dispatching on `product.loanType`; emits `upfrontGovernmentFee` + `monthlyGovernmentFee`. Produces `money(0)` for `Conventional` / `HighBalance` / `Jumbo`.
- `monthlyGovernmentFee` wired into `calculate-housing-monthly`, so FHA annual MIP and USDA annual fee land in the monthly housing component of PITI automatically.
- Product-rule expansion: `FHA`, `VA`, `USDA` rewritten with realistic LTV/FICO/DTI grids and 30/25/20/15-yr term support; new refi variants `FhaStreamline`, `VaIrrrl`, `UsdaStreamline` with purpose/LTV restrictions per program rule.
- **Automatic UFMIP / VA funding fee financing — implemented.** `Transaction.financedUpfrontFees?: boolean` opts the upfront government fee into being rolled into the loan amount. The graph now distinguishes `baseLoanAmount` (input, the borrower's stated request) from `loanAmount` (intermediate, equals base + upfront fee when `financedUpfrontFees: true`, else equals base). A new `calculate-base-ltv` edge produces `baseLtv` from `baseLoanAmount + propertyValue`, and `calculate-government-fees` consumes `baseLtv` instead of `ltv` to break the otherwise-cyclic dependency (fee depends on LTV, financed loan depends on fee, financed LTV would depend on financed loan). All downstream consumers (LTV, payment, DTI, housing, reserves, cash-to-close) automatically see the financed `loanAmount` when the flag is set. 17 new edge tests in `financed-loan-amount-edges.test.ts`.

### Jumbo tier refinement — implemented

- UWM Jumbo Pink: 4-tier grid ($766,550 → $3M) with tier-specific FICO / LTV / occupancy-eligibility progression; Tier D excludes investment occupancy entirely.
- Prime Jumbo (+ Prime Jumbo Max): 3-tier grid ($766,550 → $3M) with higher-credit-band FICO / LTV floors than Jumbo Pink.
- `PortfolioBase` tightened to `maxLoanAmount: money(3_000_000)` and `maxDTIRatio: ratio(0.43)` to match portfolio-jumbo underwriting reality; shared `jumboTiers` aligned to the same $3M program cap.
- Per-occupancy tier detail captured in `LoanAmountTier.notes`; variant-level constraints continue to enforce the per-occupancy narrowing at evaluation time.

### Multi-borrower FICO blending — implemented

- New `BorrowerBlendPolicy` discriminated union in `@loanscope/domain`: `LowestMid`, `RepresentativeFico`, `WeightedAverage { incomeWeighted }`, `PrimaryOnly { primaryBorrowerId }`.
- `@loanscope/math#computeRepresentativeFico` applies the policy across the included borrower set with explicit tie-break semantics, rounds to the nearest integer FICO, and throws on empty sets / missing primary borrower.
- `apply-borrower-blend` edge emits `blendedFico` as a computed intermediate, defaulting to `LowestMid` when no policy is supplied. As of the engine integration wiring workstream below, `evaluate.ts` seeds `transaction.borrowerBlendPolicy` into `rawInputs`, so `blendedFico` is now computed end-to-end and surfaced on `graphResult.computed["blendedFico"]` (covered by the `engine seeds transaction.borrowerBlendPolicy into rawInputs` describe block in `packages/loanscope/engine/src/__tests__/engine-policies.test.ts`).
- Downstream consumers retargeted to `blendedFico` (Workstream H): the `fico-check` edge in `packages/loanscope/calculations/src/checks/index.ts` and the `estimate-mi` edge in `packages/loanscope/calculations/src/estimates/mi.ts` now declare `blendedFico` (not the raw `fico` input) in their `inputs` arrays and consume it directly in their compute bodies. The raw `fico` input node is preserved on `nodes/inputs.ts` and continues to be engine-seeded via `minFico(effective.borrowers)`, so `result.inputs.fico` remains stable for any external JSON reader; it is simply no longer consumed by any edge. Any future check that needs a representative FICO value should consume `blendedFico`. Pinned end-to-end by the `FICO check uses blendedFico end-to-end` describe block in `packages/loanscope/engine/src/__tests__/engine-policies.test.ts` (single-borrower default, multi-borrower default `LowestMid`, explicit `WeightedAverage` shifting the check, and `ficoScores`-driven mid-of-three) and at the edge level by the `fico-check`/`estimate-mi` contract pins in `packages/loanscope/calculations/src/__tests__/calculations.test.ts`. For default-policy scenarios the numerical FICO-check result is unchanged: `LowestMid` over a single borrower returns that borrower's FICO, and `LowestMid` over a multi-borrower set with no `ficoScores` returns the min of `borrower.fico`, matching the legacy `minFico(borrowers)` aggregator.
- Config boundary wired: `borrowerBlendPolicy` is an optional field on the transaction shape with a zod discriminated-union schema and a `normalizeBorrowerBlendPolicy` loader helper.

### Qualifying-income policy haircuts — implemented (infrastructure + per-product overrides)

- New `QualifyingIncomePolicy` discriminated union: `AsStated`, `AveragedMonths { monthsLookback, historicalAmounts }`, `RentalGross { grossRent, vacancyFactor }`, `PercentOfStated { factor }`.
- `@loanscope/math#sumQualifyingIncomeWithPolicies(streams, programOverrides?)` applies per-stream policies (explicit or defaulted by `IncomeType`) and aggregates across all included borrowers' streams. Accepts an optional `ProgramIncomePolicies` second argument that overrides defaults per `IncomeType` and applies a `maxRentalFactor` cap to any explicit `RentalGross` / `PercentOfStated` policy on rental streams.
- `defaultPolicyForIncomeType(type, programOverrides?)`: W2 / SocialSecurity / Pension / Alimony / ChildSupport → `AsStated`; Rental → `PercentOfStated 0.75`; SelfEmployed / Bonus / RSU → `PercentOfStated 1.0` placeholder. Per-program overrides take precedence when set.
- `apply-income-policies` edge replaces the prior naive `derive-qualifying-income` sum-as-stated producer of `qualifyingIncomeMonthly`. Single-producer guarantee preserved. Edge now reads an optional `incomePolicies` input fed from the resolved product's `baseConstraints.incomePolicies`.
- Config boundary wired: `qualifyingPolicy?` is optional on every income stream.
- **Per-product `incomePolicies` populated** on FHA (rental 0.75 cap, SE/bonus 1.0 — FHA HB 4000.1 II.A.4), VA (rental 0.75 cap, SS grossed-up 1.25 — VA Pamphlet 26-7 Ch. 4), USDA (rental 0.75 — USDA HB-1-3555 Ch. 9), and PortfolioBase (rental 0.75 default with a 0.85 cap for portfolio-jumbo lender flexibility). Domain shape: `ProgramRules.incomePolicies?: { perIncomeType?, maxRentalFactor? }`.

### Reserves — implemented (per-product Tiered tables on jumbo)

- UWM Jumbo Pink: 11-tier `Tiered` reserves policy across 4 loan-amount × 3 occupancy bands (Tier A→D primary 6/9/12/18 months, secondary 9/12/15/24, investment 12/15/18 then excluded above $2M to mirror the C2 LTV exclusion).
- Prime Jumbo / Prime Jumbo Max: 8-tier policy across 3 × 3 bands; tighter than Pink to match the higher-credit bar (primary 9/12/18, secondary 12/18/24, investment 15/24 then excluded in Tier C).
- `PortfolioBase`: explicit `FixedMonths(6)` backstop documented as the default for non-Pink colors.
- All 11 agency leaf products (`agency_conforming`, `agency_high_balance`, Fannie ARM/HomeReady, Freddie Conforming/ARM/HighBalance/HomePossible) explicitly set `reservesPolicy: AUSDetermined` to prevent silent fall-through.
- 19 new tests in `reserves-policies.test.ts` exercise `resolveReserveMonths` end-to-end per tier × occupancy.

### Reserves AUS+Tiered floor layering — implemented

- Semantic: a `Tiered` policy tier with `additionalToAus: true` declares its `months` value as a **floor** layered over the upstream AUS finding rather than as the resolved reserve requirement.
- `@loanscope/math#resolveReserveMonths` returns the `"AUS"` sentinel for any `Tiered` tier whose lookup matches and whose `additionalToAus === true`, deferring the authoritative month count to the consumer's AUS finding.
- Companion `@loanscope/math#resolveReserveFloor(policy, loanAmount, occupancy, purpose): Months` returns the matching tier's `months` as the floor, or `monthsFn(0)` for any non-`Tiered` policy / non-`additionalToAus` tier / unmatched lookup. The two functions share lookup semantics in lockstep so the floor and the deferral cannot drift.
- `calculations/src/edges/reserves.ts` `resolve-required-reserve-months` edge layers the floor over the AUS finding via `effective = max(ausFinding.reservesMonths, floor)` to produce the canonical `requiredReserveMonths`. Non-`Tiered` policies and tiers without `additionalToAus` produce a 0 floor and pass the AUS finding through unchanged.
- Covered by `packages/loanscope/math/src/__tests__/reserve-floor.test.ts` (16 tests across `None` / `FixedMonths` / `AUSDetermined` / empty `Tiered` / unmatched-tier / `additionalToAus: false|absent|true` / per-occupancy + per-purpose filters / sort normalization / overlap precedence, plus a lockstep describe asserting `resolveReserveMonths` and `resolveReserveFloor` agree on every Tiered shape), 5 edge tests in the calculations `reserve month semantics` describe block (AUSDetermined passthrough, Tiered-without-floor, floor-above-AUS, floor-below-AUS, no-matching-tier short-circuit), and 6 product-package tests in `reserves-aus-floor.test.ts` pinning the end-to-end shape through a synthetic product's `baseConstraints.reservesPolicy` plus a regression guard that no agency leaf product currently uses `additionalToAus`.

### VA IRRRL first-class enum

- `LoanPurpose.IrrrlRefi` is a first-class enum value in `@loanscope/domain`. The VA funding-fee dispatch in `@loanscope/math#government-fees` recognizes it directly and returns the fixed 0.5% rate independent of LTV bracket and `vaServiceContext.priorUse`. Disability exemption still zeroes the fee.
- `Partial<Record<LoanPurpose, Ratio>>` widening on `ProgramRules.maxLtvByPurpose` (and the parallel widening of `maxLtvByOccupancy`) absorbs the new enum value without forcing every product to enumerate it; consumers already used `?.[key]` lookup and continue to work unchanged.
- `VaIrrrl.baseConstraints.allowedPurposes` is widened to `[LoanPurpose.IrrrlRefi, LoanPurpose.RateTermRefi]`. The legacy signal — `LoanPurpose.RateTermRefi` + `vaServiceContext.priorUse: true` — remains supported in the funding-fee dispatch so scenarios authored before the enum existed (notably `examples/scenarios/23-va-irrrl.yaml`) keep producing identical output. New scenarios should prefer the explicit `IrrrlRefi` form (`examples/scenarios/32-va-irrrl-explicit.yaml`).
- Covered by 6 new tests in `packages/loanscope/math/src/__tests__/government-fees.test.ts` (`VA IRRRL via LoanPurpose.IrrrlRefi` describe block: explicit-IrrrlRefi happy paths across LTV/priorUse, disability exemption, plus backward-compat coverage of the legacy `RateTermRefi + priorUse=true` signal and the non-IRRRL `RateTermRefi + priorUse=false` 2.15% bracket) and an updated `government-expansion.test.ts` assertion pinning both `IrrrlRefi` and `RateTermRefi` on `VaIrrrl.baseConstraints.allowedPurposes`.

### Departure-residence rental income (RentalDeparting enum)

- `IncomeType.RentalDeparting` is a first-class enum value distinct from `Rental`. `@loanscope/math#defaultPolicyForIncomeType` dispatches both `Rental` and `RentalDeparting` to the same `PercentOfStated 0.75` default; programs that need to refine the departure-residence haircut do so via `ProgramIncomePolicies.perIncomeType[RentalDeparting]` without bleeding into ordinary `Rental` streams.
- Per-program departure-residence rules (FHA's 12-month landlord-history requirement, Fannie/Freddie B3-3.1 departing-residence equity tests) remain a follow-on; the enum split is the prerequisite that lets those rules attach without touching ordinary `Rental` math.
- Covered by 4 new tests in `packages/loanscope/math/src/__tests__/qualifying-income.test.ts` (`RentalDeparting income type` describe block: default 0.75, program override, end-to-end $1000 → $750, and isolation from a `Rental`-only override).

### 2-4 unit subject-property rental

- New `Scenario.subjectPropertyRental?: { grossMonthlyRent: Money; vacancyFactor?: Ratio }` on the scenario interface; the per-unit assumption is that the borrower-occupied unit is the only non-rented unit, so callers supply the aggregate gross on the rentable unit(s) only.
- `@loanscope/math#calculateSubjectRentalIncome(gross, units, vacancyFactor?)` returns `money(0)` when `units < 2` and `gross * (1 - vacancyFactor)` otherwise (default vacancy 25%, i.e. industry-standard 75% net haircut on appraisal-derived gross rent). Throws `RangeError` on inputs outside `[1, 4]` units, negative gross, or vacancy outside `[0, 1]`.
- New `calculate-subject-rental-income` edge in `@loanscope/calculations` produces a `subjectRentalIncome` intermediate from `subjectPropertyRental` + `units`. The existing `apply-income-policies` edge consumes that intermediate as a fourth input and adds it to the canonical `qualifyingIncomeMonthly` total via `Decimal`. Keeps borrower-stream semantics clean and preserves a single producer of `qualifyingIncomeMonthly`.
- Config schema (`packages/loanscope/config/src/schema/scenario.ts#subjectPropertyRentalSchema`) and loader thread the field through end-to-end; the engine seeds `subjectPropertyRental` into `rawInputs` from the scenario.
- Covered by 12 new tests in `packages/loanscope/math/src/__tests__/qualifying-income.test.ts` (`calculateSubjectRentalIncome` describe block: 1-unit zero, 2/3/4-unit math, custom vacancy, RangeError on bad units / negative gross / vacancy out of range), 17 tests in the new `packages/loanscope/calculations/src/__tests__/subject-rental-edges.test.ts` (edge metadata, null/undefined passthrough, 1-unit short-circuit, 2/3/4-unit math, custom vacancy, cents rounding, structural-shape rejection paths), and 4 tests in `income-policy-edges.test.ts` pinning the rollup into `qualifyingIncomeMonthly` (with streams, alone, null-as-zero, both-zero suppression). Demonstrated end-to-end by `examples/scenarios/33-2unit-subject-rental.yaml`.

### Self-employed 24-month averaging via `selfEmployedAveragingMonths`

- New `IncomeStream.historicalAmounts?: number[]` carries trailing per-month income (most recent last). New `ProgramIncomePolicies.selfEmployedAveragingMonths?: number` declares the per-program lookback window (FHA 4000.1 II.A.4.c.iv, VA 26-7 Ch. 4, USDA HB-1-3555 Ch. 9, and the PortfolioBase channel all pin this to 24).
- `@loanscope/math#resolveQualifyingPolicy` bridges the two: when a stream is `IncomeType.SelfEmployed`, has no explicit `qualifyingPolicy`, the program declares a positive `selfEmployedAveragingMonths`, and the stream supplies `historicalAmounts.length >= lookback`, the resolved policy becomes `{ kind: "AveragedMonths", monthsLookback, historicalAmounts: stream.historicalAmounts.slice(-lookback) }`. Shorter histories fall back to the existing `PercentOfStated 1.0` default so the math layer never throws on an under-supplied stream. Explicit per-stream `qualifyingPolicy` always wins, and the bridge applies only to SE — non-SE streams with `historicalAmounts` continue to follow their type defaults.
- The math primitive (`AveragedMonths`) was already shipped; the gap was the resolver bridge plus the per-stream history config-boundary, both of which are now in place. Avoids a separate "averaging-applied" edge — resolution is colocated with the existing per-stream policy lookup.
- Config schema (`packages/loanscope/config/src/schema/income.ts`) accepts `historicalAmounts` on the income block; `normalizeIncomeStream` threads it through.
- Covered by 7 new tests in `packages/loanscope/math/src/__tests__/qualifying-income.test.ts` (`self-employed 24-month averaging via selfEmployedAveragingMonths` describe block: no-history fallback, short-history fallback, exact-24 averaging, oversupply slice semantics, explicit-policy precedence, non-SE ignore, and lookback-unset fallback) and 4 new product-level tests in `income-policies.test.ts` pinning `selfEmployedAveragingMonths: 24` on FHA, VA, USDA, and PortfolioBase. Example scenario at `examples/scenarios/34-se-24mo-averaging.yaml`.
- **Engine-wiring boundary — landed.** The previously-deferred `evaluate.ts` seam (matched-product `incomePolicies` not flowing into `rawInputs`) was closed in the engine integration wiring workstream described in the next subsection. End-to-end `evaluate` runs on `examples/scenarios/34-se-24mo-averaging.yaml` now activate the SE-averaging bridge for FHA, VA, USDA, and UWM Jumbo Pink (PortfolioBase child), each reporting the averaged $8,458.33/mo qualifying income from the 24 trailing `historicalAmounts`. Agency conforming and streamline products correctly continue to report the stated `monthlyAmount` because their lineage does not declare `selfEmployedAveragingMonths`. Pinned end-to-end by `packages/loanscope/engine/src/__tests__/engine-policies.test.ts` alongside the matching `programOverrides`-direct coverage in `qualifying-income.test.ts`.

### Engine integration wiring (`incomePolicies` + `borrowerBlendPolicy`) — implemented

- Per-program income policies (Workstream D1: rental haircuts, `maxRentalFactor`, `selfEmployedAveragingMonths`) and per-transaction borrower-blend policies (Workstream C3: representative-FICO computation) had been declared in the domain (`ProgramRules.incomePolicies`, `Transaction.borrowerBlendPolicy`) and consumed by the `apply-income-policies` and `apply-borrower-blend` edges since their respective workstreams shipped. The corresponding input nodes on `packages/loanscope/calculations/src/nodes/inputs.ts` declared `defaultValue: null`, and `evaluate.ts#rawInputs` never seeded either field from the matched product / transaction. Result: at the math layer every primitive worked correctly under unit test, but end-to-end `evaluate` runs reported `qualifyingIncomeMonthly` at face-value `monthlyAmount` and `blendedFico` defaulted to `LowestMid` regardless of the transaction-level policy.
- Resolved by adding two assignments to the `rawInputs` literal in `packages/loanscope/engine/src/evaluate.ts`: `incomePolicies: rules.incomePolicies` (sourced from the resolved product constraints via `getEffectiveConstraints`) and `borrowerBlendPolicy: transaction.borrowerBlendPolicy` (sourced directly from the transaction). The two parallel resolvers (`packages/loanscope/engine/src/tier-resolver.ts` and `packages/loanscope/products/src/resolver.ts`) were both updated to thread `incomePolicies` through `toProgramRules` and `mergeRules` so the field survives the inheritance chain (`extends`) and the per-occupancy / per-tier merge.
- End-to-end smoke verified against `examples/scenarios/34-se-24mo-averaging.yaml`: FHA / VA / USDA / UWM Jumbo Pink (PortfolioBase child) now report the averaged $8,458.33/mo qualifying income from the 24 trailing `historicalAmounts`, while `agency_conforming` (no `selfEmployedAveragingMonths` on its lineage) correctly falls through to the stated $9,200/mo. The rental factor cap (`maxRentalFactor: 0.75` on FHA) and per-`IncomeType` overrides activate through the same path.
- Covered by 11 new tests in `packages/loanscope/engine/src/__tests__/engine-policies.test.ts` (SE averaging end-to-end on FHA / VA / USDA / UWM Jumbo Pink, agency negative control, short-history graceful fallback, FHA per-IncomeType rental haircut, FHA `maxRentalFactor` cap binding on an explicit `PercentOfStated 0.85`, `LowestMid` default `blendedFico`, income-weighted `WeightedAverage` `blendedFico`, and a back-compat assertion that the raw `fico` input continues to be seeded by `minFico` alongside the new `blendedFico` computed value).

### No remaining engine follow-ups

All session-brief items from the post-D/E/F deferred list have shipped. The engine integration wiring above closed the last open seam between the math layer (where every primitive was already covered by unit tests) and the engine evaluator. New work in this area should be authored as its own workstream with its own deferred list rather than appended here.

## Code hygiene

### Deprecated-symbol removal — completed

- Five domain symbols and their consuming fallback paths were removed after a `grep` sweep proved zero remaining consumers in production source. The replacements were already the canonical live path for at least 30 catalog products, so the deletion is a pure simplification rather than a migration.
  - `OccupancyRuleOverride` interface (`packages/loanscope/domain/src/models/product.ts`) → replaced by `ProductVariant.constraints: Record<Occupancy, OccupancyConstraints>`.
  - `OccupancyRuleOverrideResolved` interface (same file) → replaced by `OccupancyConstraints` (resolved variant carries the same shape; no separate "resolved" type was needed).
  - `ProductTierOverride` interface (same file) → replaced by `LoanAmountTier`.
  - `ProductTierOverrideResolved` interface (same file) → replaced by `LoanAmountTier` (same collapse pattern as the occupancy overrides).
  - `ProductDefinition.baseRules?: ProgramRules` field (same file) → replaced by `baseConstraints?: Partial<ProgramRules>`.
  - `ProductDefinition.baseProductId?: string` field (same file) → replaced by `extends?: string`.
- Two consuming `?? product.baseRules` fallbacks in `packages/loanscope/engine/src/tier-resolver.ts` (`getEffectiveConstraints` and `resolveTier`) and two `?? .baseRules` fallbacks in `packages/loanscope/products/src/resolver.ts` were deleted; the single live path now reads `product.baseConstraints` directly. One stale `?? product.baseRules` in `packages/loanscope/products/src/__tests__/products.test.ts` was likewise dropped.
- Three no-longer-needed type imports (`ProductTier`, `Units`, `ReservesPolicy`) were dropped from `packages/loanscope/domain/src/models/product.ts` to keep the import surface minimal.
- The one-line `gradientSearch` proxy to `searchThreshold` was kept intentionally with an explicit pinning test. It is the right discipline for a renamed API that may still appear in external callers' code: deletion would be a breaking change for those callers without a deprecation cycle, and the proxy carries no maintenance burden.
- Covered by 6 new tests in `packages/loanscope/domain/src/__tests__/product-shape.test.ts` (canonical fixture has no residual `baseRules` / `baseProductId` keys; `extends` carries the inheritance pointer; `baseConstraints` carries declared rules; `ProductVariant.constraints` is keyed by `Occupancy` with `OccupancyConstraints` values; `LoanAmountTier` records carry the `range` + `maxLTVRatio` shape; the four removed interface names do not reappear as runtime exports of `@loanscope/domain`). The TypeScript type system is the primary guarantee — every consumer of the removed shapes would fail to compile after a revert; the runtime tests are a defensive companion that locks in the migration so a maintainer reading them sees the canonical replacement names without searching the diff.

### Repository hygiene refactor (2026) — completed

Multi-batch refactor completed across twenty batches; all verified green (`pnpm typecheck:loanscope` 13/13, `pnpm test:loanscope` 26/26).

- **New `@loanscope/program-rules` package** consolidating `toProgramRules` / `mergeRules` / `resolveVariant` / `findApplicableTier`. Previously these primitives were copied across `@loanscope/engine` (`tier-resolver.ts`) and `@loanscope/products` (`resolver.ts`) as byte-identical duplicates; any `ProgramRules` field addition had to thread through four places. After extraction: `engine/tier-resolver.ts` 408 LOC → 119 LOC, `products/resolver.ts` 366 LOC → 84 LOC, single canonical home pinned by 10 invariant tests. Both engine and products re-export from the shared package so existing importers continue to work unchanged.
- **Monolith decomposition.** Four oversized files split into focused modules: `cli/src/commands/db-actions.ts` (763 LOC → 4 files + barrel), `cli/src/commands/db.ts` (897 LOC → 7 registrar files + barrel), `calculations/src/checks/index.ts` (1103 LOC → 18 per-check files + barrel), `cli/src/utils.ts` (470 LOC → 7 responsibility-scoped modules under `cli-error.ts` / `config-loaders.ts` / `format-parsers.ts` / `cli-parsers/*` / `cli-validators.ts`).
- **CLI command decomposition.** `commands/import-actions.ts` → `commands/import/` (5 files), `commands/diff-actions.ts` → `commands/diff/` (6 files; `DiffEntry` converted from interface to proper discriminated union), `commands/custom-product-actions.ts` → `commands/custom-product/` (6 files), `commands/goalseek.ts` → `commands/goalseek/` (5 files; parse-bounds / solvers / print / register seams). `db/src/repositories/types.ts` (461 LOC, 36 exports) eliminated in favor of co-located per-repository types.
- **Test file decomposition.** `cli/src/__tests__/cli.test.ts` (4104 LOC) split into 8 feature-scoped test files (`command-registration`, `evaluate`, `parsers`, `output`, `db-scenarios`, `db-custom-product`, `db-import`, `db-audit`); total test count preserved at 351.
- **Barrel conventions.** Five new `index.ts` barrels added for consistency with the rest of the codebase: `calculations/src/nodes/`, `calculations/src/edges/`, `cli/src/output/`, `cli/src/cli-parsers/`, `cli/src/commands/db-helpers/`. 42 consumer imports rewired to route through the new barrels.
- **TypeScript strictness tightened.** `noImplicitOverride`, `noFallthroughCasesInSwitch`, `forceConsistentCasingInFileNames` added to `config/typescript/base.json`. Every discriminated-union `switch` now terminates with an `assertNever` default. Two double-assertion casts (`raw as AuditableCommand` and `as unknown as LoanScopeDB`) replaced with proper type guards and a `withTx` boundary helper respectively.
- **Type-hygiene seam consolidation.** `withManager<T>(path, fn)` helper encapsulates the `DatabaseManager.open` pattern (33 call sites in `db.ts` before decomposition). `resolvePayloadFormat(opt, command, fallback)` centralizes the three verbatim-duplicated parent/grandparent `--output` walk blocks. `renderJson(value)` helper establishes the single-indentation seam for all action-layer JSON output. Action inputs migrated from `json: boolean` to `output: "text" | "json"`; `VAUseHistory` discriminator replaces a private `priorUse: boolean` parameter in VA funding-fee dispatch.
- **Repository-config hygiene.** Root `.editorconfig`, `.gitattributes`, `.prettierrc`, `.prettierignore`, `.nvmrc`, and `eslint.config.js` added. Seven unused root dependencies removed (`lodash-es`, `immer`, `toposort`, `binary-search`, `fast-equals`, `pareto-frontier`, `@types/lodash-es`). Root `tsconfig.json` now extends `@config/typescript/mortgage-lib` so editor IntelliSense matches the build-time strict baseline.
- **Documentation hygiene.** Stale handoff material was archived out of the public documentation path. Internal-only reference material (`docs/products/`) moved under ignored internal documentation. Workspace-deps convention (`workspace:*`, no `peerDependencies` between loanscope packages) is captured as a repository standard.

One item from the plan is explicitly deferred: the `ProgramRules` resolver's `LTV` / `Cltv` / `Dti` TitleCase identifier mass-rename. Both forms are internally consistent within their respective call sites; mass-renaming would be a ~40-identifier `BREAKING` change for little clarity gain.

## Persistence Architecture (Reference)

Persistence is an adapter layer. Domain model, graph semantics, and engine logic remain in-memory and authoritative. SQL never encodes underwriting rules.

```
CLI / Config
       |
   [Validation]
       |
   Domain Model  <-- canonical in-memory types
       |
   Engine / Graph / Calculations
       |
   [Persistence Adapter]  <-- maps domain <-> rows
       |
   SQLite + Drizzle
```

### Stack

- SQLite for local durability and zero-config deployment
- Drizzle ORM for typed schema definitions, migrations, and queries
- drizzle-zod for persistence-layer row validation (separate from domain validation)

### Package Layout

Thirteen workspace packages under `packages/loanscope/`:

| Package                    | Role                                                                                                                                                        |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@loanscope/domain`        | Branded primitives, enums, and canonical types. No runtime dependencies.                                                                                    |
| `@loanscope/graph`         | Generic DAG engine (provenance, scoping, evaluation).                                                                                                       |
| `@loanscope/math`          | Pure calculation primitives (PMT, LTV/DTI/CLTV, reserves, government fees).                                                                                 |
| `@loanscope/program-rules` | Canonical `ProgramRules` resolver primitives (`toProgramRules`, `mergeRules`, `resolveVariant`, `findApplicableTier`). Consumed by `engine` and `products`. |
| `@loanscope/calculations`  | Graph wiring: node definitions + edge registry.                                                                                                             |
| `@loanscope/config`        | YAML / JSON scenario parsing with zod boundary validation.                                                                                                  |
| `@loanscope/products`      | Declarative product catalogs (agency, government, portfolio).                                                                                               |
| `@loanscope/lenders`       | Lender registry with preset + custom product-source resolution.                                                                                             |
| `@loanscope/engine`        | In-memory evaluation orchestration (`evaluate`, `evaluateAll`, tier/variant resolution).                                                                    |
| `@loanscope/compare`       | Comparison grid builder + executor + goal-seek.                                                                                                             |
| `@loanscope/sim`           | Simulation engine (deterministic cash accounting, Pareto ranking).                                                                                          |
| `@loanscope/db`            | Persistence adapter: Drizzle schema, migrations, repository adapters, mappers, custom-product service, persistent lender registry, seeding.                 |
| `@loanscope/cli`           | Commander-backed CLI surface. Only package that wires persistence to users.                                                                                 |

`@loanscope/db` scope:

- Drizzle schema definitions
- Migrations
- Repository adapters (domain-oriented interfaces, not row-oriented)
- Row-to-domain and domain-to-row mapping via per-entity mappers in `db/src/mappers/` (see the Persistence Architecture reference above for details)

### Data Model

Implemented tables:

| Table                 | Purpose                                                                                   | Repository                   | CLI surface                                                                                                                                                                                |
| --------------------- | ----------------------------------------------------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `lenders`             | Lender metadata: id, name, source kind, version, active flag                              | `LenderRepository`           | `db seed`, `db list-lenders`                                                                                                                                                               |
| `lender_presets`      | Named product subsets per lender                                                          | `PresetRepository`           | read-only via `db list-lenders`                                                                                                                                                            |
| `product_catalogs`    | Versioned product definition payloads                                                     | `CatalogRepository`          | `db import`, `db catalog-history`                                                                                                                                                          |
| `catalog_versions`    | Import provenance: source file, hash, timestamp                                           | `CatalogRepository`          | `db import`, `db catalog-history`                                                                                                                                                          |
| `custom_product_sets` | User-defined product collections with validation status                                   | `CustomProductSetRepository` | `db custom-product create`, `db custom-product list`, `db custom-product show`, `db custom-product validate`, `db custom-product delete`                                                   |
| `saved_scenarios`     | Transaction payloads and evaluation results                                               | `SavedScenarioRepository`    | `db list-scenarios`, `db save-scenario`, `db load-scenario`, `db show-scenario`, `db rename-scenario`, `db delete-scenario`, `db update-scenario`, `evaluate --save`, `evaluate --from-db` |
| `scenario_versions`   | Append-only edit history for `saved_scenarios.config_payload` (create / update / restore) | `ScenarioVersionRepository`  | `db update-scenario`, `db scenario-history`, `db show-scenario-version`, `db restore-scenario-version` (cascades on `db delete-scenario`)                                                  |
| `saved_comparisons`   | Comparison grid snapshots                                                                 | `SavedComparisonRepository`  | `compare --save`, `db list-comparisons`, `db show-comparison`, `db rename-comparison`, `db delete-comparison`                                                                              |
| `saved_simulations`   | Simulation report snapshots                                                               | `SavedSimulationRepository`  | `simulate --save`, `db list-simulations`, `db show-simulation`, `db rename-simulation`, `db delete-simulation`                                                                             |
| `import_runs`         | Import history and error tracking                                                         | `ImportRunRepository`        | `db import`, `db list-import-runs`, `db show-import-run`                                                                                                                                   |
| `audit_sessions`      | Reproducible evaluation records                                                           | `AuditSessionRepository`     | `db audit list`, `db audit show`, plus `evaluate --audit`, `compare --audit`, `simulate --audit`                                                                                           |

### Serialization Strategy

Use relational metadata tables plus JSON payloads for complex nested structures (product definitions, rule trees, transaction config, result snapshots). JSON columns are acceptable when:

- Versioned explicitly
- Validated through domain adapters before use
- Never queried for underwriting logic

Do not attempt to fully normalize every nested product / rule object into relational tables.

### Boundaries

Drizzle and DB concerns must stay out of:

| Package                    | Reason                             |
| -------------------------- | ---------------------------------- |
| `@loanscope/domain`        | No runtime dependencies allowed    |
| `@loanscope/math`          | Pure calculation functions         |
| `@loanscope/graph`         | Generic DAG engine                 |
| `@loanscope/program-rules` | Pure resolver primitives           |
| `@loanscope/calculations`  | Graph wiring only                  |
| `@loanscope/engine`        | In-memory evaluation orchestration |

All DB access goes through repository adapters. No direct SQL/ORM usage inside domain or engine packages. The CLI is the only package that wires repositories to user-facing commands.

### Migration Rules

- Every schema change is migration-backed.
- Catalog payload versions are stored explicitly.
- Breaking shape changes must not silently invalidate older stored payloads.
- Import format version is tracked per catalog.

### Testing

- Isolated SQLite databases per test (use `DatabaseManager.memory()`).
- Migration tests from empty schema and prior versions.
- Round-trip correctness: row to domain to row.
- Invalid payload rejection through persistence adapters.
- Core engine / graph / calculations tests remain DB-free.

## Infrastructure

Scaffolded but not yet triggered. The release path is wired end-to-end and validated by a local changeset status run; the first actual publish is gated on manual workflow dispatch and remains the team's decision.

- **npm publication.** All 13 `@loanscope/*` packages have `private: false`, `publishConfig.access: public`, package-level `engines.node: >=22`, MIT license metadata, and npmjs.com-facing README badges under the `@loanscope` scope. Non-loanscope workspace entries (`web`, `@workspace/ui`, `@workspace/utils`, `@config/eslint`, `@config/typescript`) are explicitly private, have no publish config, and are listed in the Changesets `ignore` block.
- **Versioning strategy.** [`@changesets/cli`](https://github.com/changesets/changesets) installed at the root. `.changeset/config.json` declares the 13 loanscope packages as a `fixed` group — any changeset bumps them together and preserves a single monorepo version across the publishable surface. `updateInternalDependencies: patch` is the default Changesets behavior for workspace-protocol deps; the `fixed` grouping makes the bump explicit. Root scripts: `pnpm changeset` (add), `pnpm version-packages` (apply), `pnpm release` (build + publish).
- **Release automation in CI.** `.github/workflows/release.yml` runs on `workflow_dispatch` only, with a `dry-run` boolean input that defaults to `true`. The workflow installs with a frozen lockfile, typechecks, builds, tests, and validates package exports with `pnpm attw` before any release action. Dry-run reports pending changesets and renders the planned version diff without touching the registry. Non-dry-run invokes `changesets/action` in its standard two-phase mode (open a "Version Packages" PR when new changesets exist, publish when that PR is merged). Publishing targets public npm via `registry-url: https://registry.npmjs.org`, authenticates with an npm automation token stored in the repository's `NPM_TOKEN` secret and exposed as `NODE_AUTH_TOKEN`, and enables npm provenance through GitHub Actions OIDC (`id-token: write` plus `NPM_CONFIG_PROVENANCE: true`) so package pages can link published artifacts back to the public GitHub build. To flip from manual-dispatch to automatic release-on-merge, add `push: { branches: [main] }` to the workflow's `on:` block.
- **Local registry routing.** Root `.npmrc` declares `@loanscope:registry=https://registry.npmjs.org` so local installs and publishes resolve the public `@loanscope` scope through npmjs.com. The authentication line is intentionally kept out of the checked-in file; CI receives credentials from the release workflow's `NPM_TOKEN` secret.
- **Contributor docs.** `CONTRIBUTING.md` now documents the changeset flow (`pnpm changeset` / `pnpm changeset --empty`) and the manual-dispatch release procedure.

## Not Planned

- Rewriting underwriting logic as SQL queries.
- Replacing config YAML with DB as the only input path.
- Moving graph semantics or check adjudication into persistence.
- Internationalization or multi-currency support.
- Browser-only deployment (Node.js runtime required).
- Non-terminal UI work (`apps/web` and `packages/ui`) until the active CLI/persistence workstream is closed.
