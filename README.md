# LoanScope

[![CI](https://github.com/ramiisaac/loanscope/actions/workflows/ci.yml/badge.svg)](https://github.com/ramiisaac/loanscope/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D22-brightgreen)](.nvmrc)
[![pnpm](https://img.shields.io/badge/pnpm-10.x-orange)](pnpm-workspace.yaml)

A production-grade mortgage underwriting engine, CLI, and persistence layer. Built around explicit domain models, deterministic decimal math, and a typed computational DAG with first-class eligibility checks. **690+ tests, zero skipped.**

## Why this exists

Mortgage underwriting is full of program-specific edge cases (FHA MIP schedules, VA IRRRL fee tiers, USDA upfront / annual splits, jumbo tier overlays, AUS-determined reserves with floor layering, multi-borrower FICO blending, departure-residence rental income, self-employed 24-month averaging) that get hand-coded into spreadsheets and one-off scripts. LoanScope treats every rule as a first-class declarative `ProgramRules` value, every calculation as a node in a typed DAG, and every check as a graph edge — so adding a new program or refining an existing one is a contained change with explicit test coverage rather than a search-and-edit across a large procedural codebase.

## Highlights

- **13 workspace packages** under `@loanscope/*`, each with a single responsibility and explicit dependency direction (`domain` -> `math` / `graph` / `program-rules` -> `calculations` / `products` / `lenders` -> `engine` / `compare` / `sim` -> `cli`).
- **Full Agency / Government / Portfolio coverage:** Fannie, Freddie, FHA (incl. Streamline), VA (incl. IRRRL), USDA (incl. Streamline), UWM Jumbo Pink, Prime Jumbo, Prime Jumbo Max.
- **Branded primitive types** for every domain quantity (`Money`, `Ratio`, `RatePct`, `Months`, `Units`, `Fico`) so unit confusion is caught at compile time.
- **Deterministic decimal math** via `decimal.js` end-to-end; no floating-point drift in qualifying-payment, LTV, or fee calculations.
- **Typed DAG evaluator** with provenance tracking, scoped evaluation, and a `BlockedNode` surface for missing inputs (no silent defaults).
- **18 first-class eligibility checks** (LTV, CLTV, DTI, FICO, loan amount, reserves, cash-to-close, occupancy, purpose, property type, units, borrower restrictions, state restrictions, cash-out, buydown, MI, AUS, appraisal) with margin computation for goal-seek.
- **SQLite + Drizzle persistence adapter** for scenarios, comparisons, simulations, custom product sets, catalog imports with content-hashing, scenario versioning with restore, and reproducible audit sessions. Adapter layer only; underwriting rules never live in SQL.
- **CLI commands:** `quote`, `evaluate`, `compare`, `goalseek`, `simulate`, `diff`, `batch`, `export-scenario`, plus 30+ `db` subcommands for persistence management.
- **Comparison grids and goal-seek** across 12 dimensions (term, rate, LTV, loan amount, occupancy, products, lenders, borrower sets, FICO, down payment, property type, loan purpose).
- **Simulation engine** with deterministic cash accounting and Pareto-ranked outcomes for "what if I pay down $X" / "what if I add a co-borrower" exploration.
- **Strict TypeScript:** `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitReturns`, `noFallthroughCasesInSwitch`, `noImplicitOverride`. Zero `any`, zero `@ts-ignore` in production source.

## Requirements

- Node.js `>=22`
- pnpm `10.x`

## Installation

```bash
pnpm install
```

## Usage

Quick quote:

```bash
pnpm loanscope quote --loan 1000000 --price 1250000 --fico 740
```

Quick quote with ARM inputs:

```bash
pnpm loanscope quote --loan 1000000 --price 1250000 --fico 740 --program ARM --arm-fixed 60
```

Full evaluation from config:

```bash
pnpm loanscope evaluate --config packages/loanscope/cli/scenarios/default.yaml
```

Grid comparison:

```bash
pnpm loanscope compare --ltv 0.75:0.95:0.05 --terms 360,480
```

Goal seek:

```bash
pnpm loanscope goalseek max-loan --product uwm_jumbo_pink
```

Simulation:

```bash
pnpm loanscope simulate --config packages/loanscope/cli/scenarios/default.yaml
```

Output formats:

```bash
pnpm loanscope quote --loan 1000000 --price 1250000 --fico 740 --output json
pnpm loanscope evaluate --config packages/loanscope/cli/scenarios/default.yaml --output csv
```

Supported output values are `table`, `json`, and `csv`.

## Database

The `loanscope db` subcommands manage the local SQLite database used for persistent lender catalogs, presets, custom product sets, and (incrementally) saved scenarios, comparisons, simulations, and audit sessions. The default database path is `loanscope.db` in the working directory; override with `--path <file>`.

Initialize and seed:

```bash
pnpm loanscope db init
pnpm loanscope db seed
```

Inspect:

```bash
pnpm loanscope db status
pnpm loanscope db list-lenders
pnpm loanscope db list-scenarios
```

Persistence is an adapter layer; underwriting rules do not live in SQL.

## Config

Config-backed commands read YAML files through `@loanscope/config`.

Common command-level overrides include:

- `--rate`
- `--term`
- `--program`
- `--arm-fixed`
- `--lender`
- `--products`
- `--product-source`

For ARM scenarios, `--program ARM` requires `--arm-fixed`, and `--arm-fixed` may only be used with `--program ARM`.

Example scenario:

```yaml
id: default-scenario
scenario:
  loanPurpose: Purchase
  occupancy: Primary
  propertyType: SFR
  purchasePrice: 1250000
  requestedLoanAmount: 1000000
  rateNote:
    noteRatePct: 6.875
    amortizationMonths: 360
  monthlyHousing:
    propertyTax: 1042
    insurance: 365

borrowers:
  - id: b1
    fico: 740
    incomes:
      - id: inc1
        type: W2
        monthlyAmount: 24405

assets:
  - id: checking
    type: Checking
    amount: 500000

variants:
  - id: solo
    label: Single borrower
    includedBorrowerIds: [b1]
```

## Development

Workspace layout:

```text
packages/loanscope/
  domain/         Branded primitives, enums, canonical model interfaces. Zero runtime deps.
  graph/          Generic typed DAG evaluator with provenance and scoped evaluation.
  math/           Pure mortgage math primitives (PMT, LTV, DTI, reserves, FHA/VA/USDA fees).
  program-rules/  Canonical ProgramRules resolver primitives (toProgramRules, mergeRules, resolveVariant).
  calculations/   Computational graph node/edge definitions wiring math into the DAG.
  config/         YAML/JSON scenario parser with zod boundary validation.
  products/       Declarative Agency/Government/Portfolio product catalogs.
  lenders/        Lender registry with preset and custom product-source resolution.
  engine/         In-memory evaluation orchestrator (tier resolution, evaluateAll, scoped responses).
  compare/        Comparison grid builder, executor, and goal-seek.
  sim/            Borrower-action simulator with Pareto-ranked outcomes.
  db/             SQLite + Drizzle persistence adapter (schema, repos, mappers, audit).
  cli/            Commander-based CLI surface (the user-facing edge).
```

Each package has a focused responsibility and explicit dependency direction.

Useful scripts:

```bash
pnpm loanscope --help
```

## Scope

- **CLI is the user surface.** The `@loanscope/cli` binary is the only maintained entry point. The `apps/web` Next.js app exists as a workspace peer but is not the focus of this repository.
- **Eligibility, not pricing.** The engine determines whether a transaction passes program rules and at what margin. Rates are user-supplied inputs; no lender rate sheets, no pricing adjustments, no LLPAs.
- **Declarative rules only.** Every program rule lives in a typed `ProgramRules` value with explicit overrides per variant, occupancy, and loan-amount tier. No runtime rule DSL, no spreadsheet imports, no string-based rule evaluation.
- **Deterministic.** Same inputs produce byte-identical outputs. No randomized tie-breaks, no clock-dependent branches outside the audit layer.
- **SQLite as an adapter.** Persistence is bolt-on; the engine has no SQL dependency. Underwriting rules never live in the database.

## Repo Notes

- Example scenarios and catalogs (parseable by the CLI): [`examples/README.md`](./examples/README.md)
- Test-only fixtures (referenced by `*.test.ts` only): [`fixtures/README.md`](./fixtures/README.md)

## Changelog

See [`CHANGELOG.md`](./CHANGELOG.md) for repo-wide history. Per-package changelogs are generated by [Changesets](https://github.com/changesets/changesets) and live alongside each package at `packages/loanscope/<name>/CHANGELOG.md`.

## License

MIT
