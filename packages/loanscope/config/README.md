# @loanscope/config

[![npm version](https://img.shields.io/npm/v/%40loanscope%2Fconfig.svg)](https://www.npmjs.com/package/@loanscope/config) [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

YAML / JSON scenario parser with [zod](https://zod.dev) boundary validation. Accepts authored scenario files (transaction-shaped, quick-quote-shaped, or simulation-plan-shaped) and produces validated `Transaction` / `QuickQuoteInput` / `SimulationPlan` values that the LoanScope engine and CLI consume.

Validation is strict at the file boundary so every downstream package can rely on fully-typed inputs without re-validating.

## Install

```bash
pnpm add @loanscope/config @loanscope/domain
```

## Usage

```ts
import { loadConfigFile } from "@loanscope/config";

const parsed = loadConfigFile("./scenarios/default.yaml");
if (parsed.transaction) {
  // typed Transaction
}
```

## Part of the LoanScope monorepo

See [the repository root](https://github.com/ramiisaac/loanscope) for the full list of `@loanscope/*` packages, the underwriting engine, and the CLI.

## License

MIT
