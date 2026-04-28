# Examples

Reference material for the LoanScope CLI. Everything under this directory is **committed**, **parseable by the CLI**, and **safe to copy** as a starting point for new scenarios, catalog imports, or custom product sets.

## Contract

1. Every file under `examples/` must round-trip through `@loanscope/config` — that is, scenarios must `parseConfig` cleanly, catalog payloads must pass `db import` structural validation, and custom-product payloads must pass `db custom-product create` structural validation.
2. CI evaluates every scenario under `examples/scenarios/` end-to-end via `loanscope evaluate`. A scenario that fails to evaluate breaks the build.
3. Examples are the canonical reference for the YAML schema. When the schema changes, update these files in lockstep so the demonstrations stay accurate.
4. Examples are **not** test fixtures. Tests must depend on `fixtures/` instead. If a test happens to read an example file, treat that as a structural coupling that needs to be broken — copy the data into `fixtures/` and have the test point there.

## Layout

```text
examples/
  scenarios/       # Full transaction configs consumed by evaluate/compare/goalseek/simulate/batch/export-scenario --config
  catalogs/        # Lender catalog payloads consumed by `db import`
  custom-products/ # Custom product set payloads consumed by `db custom-product create`
```

## Scenario index

Numeric prefixes are an intentional grouping (single-digit-tens = category):

| Category | Prefix | Files                                                                                                 |
| -------- | ------ | ----------------------------------------------------------------------------------------------------- |
| Basics   | 0x     | `01-quick-quote`, `02-conforming-purchase`, `03-full-scenario`                                        |
| Jumbo    | 1x     | `10-jumbo-primary`, `11-jumbo-refi`                                                                   |
| Govt.    | 2x     | `20-fha-primary`, `21-fha-primary-financed-ufmip`, `22-va-purchase`, `23-va-irrrl`, `24-usda-primary` |
| Advanced | 3x     | `30-multi-borrower-blend`, `31-rental-income`                                                         |

Per-scenario feature notes live in the top-of-file comment block of each YAML file, including the expected CLI invocation that produces a meaningful result.

## Common invocations

```bash
# Evaluate a single example end-to-end.
pnpm loanscope evaluate --config examples/scenarios/10-jumbo-primary.yaml

# Compare a grid against a single example.
pnpm loanscope compare --config examples/scenarios/02-conforming-purchase.yaml --ltv 0.75:0.95:0.05

# Goal-seek a maximum loan against a single example.
pnpm loanscope goalseek max-loan --config examples/scenarios/30-multi-borrower-blend.yaml

# Simulate borrower changes against a single example.
pnpm loanscope simulate --config examples/scenarios/03-full-scenario.yaml

# Batch over multiple examples in input order.
pnpm loanscope batch examples/scenarios/10-jumbo-primary.yaml examples/scenarios/11-jumbo-refi.yaml

# Import a sample lender catalog into a local SQLite database.
pnpm loanscope db import --lender uwm --file examples/catalogs/sample-uwm-catalog.yaml --path /tmp/loanscope.db

# Create a custom product set from a sample payload.
pnpm loanscope db custom-product create --file examples/custom-products/sample-custom-set.yaml --name "Sample Set" --path /tmp/loanscope.db
```

## Authoring a new example

1. Pick the right category prefix and a free numeric slot within it.
2. Open the top-of-file comment block with: what the example demonstrates, the expected CLI invocation, and any non-default fields central to the demo.
3. Honor the engine invariants the schema enforces (notably `loan + downPayment == purchasePrice` for purchase scenarios).
4. Verify the file evaluates clean before committing:

   ```bash
   pnpm loanscope evaluate --config examples/scenarios/<your-file>.yaml --output json --quiet > /dev/null
   ```

5. Add the file to the scenario index above.
