# Contributing

## Scope

This repository prioritizes backend and CLI correctness. Keep changes explicit, typed, and production-ready.

## Development Expectations

- Follow the existing package boundaries and domain terminology.
- Prefer small, targeted changes over broad refactors.
- Keep underwriting logic out of persistence code.
- Do not add placeholders, TODO scaffolding, or skipped tests.

## Before Opening a PR

- Confirm the change is scoped to the intended packages.
- Include or update tests when behavior changes.
- Update documentation when command behavior, config shape, or package metadata changes.

## Commit Guidance

- Use Conventional Commits. Run `pnpm commit` for the interactive Commitizen prompt.
- Local commits are validated by the `commit-msg` hook via commitlint and `.commitlintrc.json`.
- Keep the summary factual and scoped to the change.
- Keep unrelated changes in separate commits.

## Releases

The `@loanscope/*` packages are versioned together as a fixed group (see `.changeset/config.json`) and published publicly to npm under the `@loanscope` scope via the `.github/workflows/release.yml` workflow.

### Adding a changeset

Any PR that changes code in a published `@loanscope/*` package must include a changeset:

```bash
pnpm changeset         # interactive: select packages + bump type + summary
pnpm changeset --empty # for PRs that don't need a release (docs, tests, CI)
```

The summary becomes the CHANGELOG entry; write it from a consumer's perspective.

### Running a release

The release workflow is **manual dispatch only** until the team is ready to enable automated publishing. To run it:

1. Go to the repo's _Actions → Release_ tab.
2. Click _Run workflow_.
3. Leave `dry-run` checked on the first run to verify the output without publishing.
4. When ready, re-run with `dry-run` unchecked. `changesets/action` will either open a "Version Packages" PR (if new changesets exist and no version bump PR is open) or publish (when the version bump PR has been merged).

Authentication uses an npm automation token stored in the repository's `NPM_TOKEN` secret and exposed to the workflow as `NODE_AUTH_TOKEN`.

To enable automatic publishing on every push to `main`, add `push: { branches: [main] }` to the workflow's `on:` block.
