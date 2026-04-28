# Example catalogs

Sample lender catalog payloads consumed by `loanscope db import`.

A catalog file is a YAML or JSON document with a top-level `products` array, where each entry is a `ProductDefinition` carrying a non-empty `id` and `name`, valid `LoanType` and `Channel` enum values, and at least one variant. The CLI hashes the file content (SHA-256), runs structural validation, and persists the products as a new immutable catalog version under the chosen lender, recording an `import_runs` row that captures the success / partial / failed outcome and any per-product error log.

Smoke command:

```bash
pnpm loanscope db import --lender uwm --file examples/catalogs/sample-uwm-catalog.yaml --path /tmp/loanscope.db
```

Files in this directory must round-trip through `validateProductStructure`; they are intended to be copied as starting points for real lender catalog imports and validated with the CLI smoke commands before use.
