# Example custom product sets

Sample custom product set payloads consumed by `loanscope db custom-product create`.

A custom product set file is a YAML or JSON document with a top-level `products` array, where each entry is a `ProductDefinition` carrying a non-empty `id` and `name`, valid `LoanType` and `Channel` enum values, and at least one variant. Unlike lender catalogs (which are versioned under a known lender id and consumed by the import pipeline), custom product sets are user-defined product universes — useful for what-if pricing, exploratory overlays, and testing engine behavior against products that do not yet live in any lender catalog.

The CLI runs structural validation via `validateProductStructure`, aggregates per-product errors into a single `CliValidationError` if any entry is malformed, and persists the set with a generated id of the form `<slug>-<UTC-yyyymmddHHMMSS>` and a status of `valid` (or `invalid`, with the error log retained for inspection via `db custom-product show`).

Smoke command:

```bash
pnpm loanscope db custom-product create --file examples/custom-products/sample-custom-set.yaml --name "Sample Set" --path /tmp/loanscope.db
```

Files in this directory must round-trip through `validateProductStructure`; they are intended to be copied as starting points for real custom product set creation and validated with the CLI smoke commands before use.
