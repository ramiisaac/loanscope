# @loanscope/db

[![npm version](https://img.shields.io/npm/v/%40loanscope%2Fdb.svg)](https://www.npmjs.com/package/@loanscope/db) [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

SQLite + [Drizzle ORM](https://orm.drizzle.team/) persistence adapter for LoanScope. Provides typed schema, migrations, repository adapters, per-entity domain↔row mappers, a `CustomProductService` for user-defined product sets, a `PersistentLenderRegistry` that mirrors the in-memory `@loanscope/lenders` interface against on-disk catalogs, and an `AuditSessionRepository` for reproducible evaluation records.

The CLI (`@loanscope/cli`) is the only package that wires this to user-facing commands; the engine and other core packages remain DB-free.

## Install

```bash
pnpm add @loanscope/db @loanscope/domain @loanscope/lenders
```

## Usage

```ts
import { DatabaseManager } from "@loanscope/db";

const manager = DatabaseManager.open("./loanscope.db");
const stats = manager.stats();
```

## Changelog

See [`CHANGELOG.md`](./CHANGELOG.md) for per-package release history.

## Part of the LoanScope monorepo

See [the repository root](https://github.com/ramiisaac/loanscope) for the full list of `@loanscope/*` packages, the underwriting engine, and the CLI.

## License

MIT
