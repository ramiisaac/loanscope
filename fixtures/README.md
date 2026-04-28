# Fixtures

Test-only data referenced **exclusively** by `*.test.ts` files in this repository. Nothing under `fixtures/` is consumed by smoke commands, by end-user workflows, or by the CLI in normal operation.

## Contract

1. **Owned by tests, not by users.** Every file here exists to satisfy a specific assertion in a specific test file. If you are not updating the asserting test, do not edit the fixture.
2. **Do not promote a fixture to an example.** If a file becomes useful as reference material, copy it to `examples/` rather than moving it; tests must continue to depend on the version under `fixtures/` so their behavior cannot drift when the example is reshaped.
3. **Do not depend on `examples/` from a test.** Tests must point at `fixtures/` so the example tree can evolve (numeric prefixes, narrative reshuffles, schema-driven rewrites) without breaking the test suite.
4. **Deterministic content only.** Fixtures must be byte-stable; no timestamps, no machine-specific paths, no values that depend on the environment.

## Index

| Fixture                       | Owning test                                          | Purpose                                                                               |
| ----------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `batch/sample-batch-list.txt` | `packages/loanscope/cli/src/__tests__/batch.test.ts` | Newline-separated scenario list consumed by `loanscope batch --list` integration smoke. |

## Layout

```
fixtures/
  batch/      # Batch-mode list inputs (one scenario path per line)
```

## Adding a new fixture

1. Place the file under a subdirectory named after the surface it exercises (e.g. `batch/`, `import/`, `custom-products/`). Create the directory if it does not yet exist.
2. Add a row to the index table above identifying the owning test.
3. In the test, resolve the fixture path relative to the repo root via the existing `findDefaultScenario` repo-root helper (see `batch.test.ts` for the canonical pattern); do not hard-code absolute paths.
4. Keep the fixture as small as the assertion requires. A fixture that carries unused fields invites silent coupling drift.
