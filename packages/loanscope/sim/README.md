# @loanscope/sim

[![npm version](https://img.shields.io/npm/v/%40loanscope%2Fsim.svg)](https://www.npmjs.com/package/@loanscope/sim) [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

LoanScope mortgage borrower-action simulator. Given a `SimulationPlan` (objectives, limits, available actions like pay-down, exclude asset, include borrowers, adjust down payment, add reserves, change term), explores reachable states via deterministic cash accounting and returns a Pareto-ranked `SimulationReport` of best states plus per-product fixes.

## Install

```bash
pnpm add @loanscope/sim @loanscope/engine @loanscope/domain
```

## Usage

```ts
import { simulate } from "@loanscope/sim";

const report = simulate(transaction, products, plan);
```

## Part of the LoanScope monorepo

See [the repository root](https://github.com/ramiisaac/loanscope) for the full list of `@loanscope/*` packages, the underwriting engine, and the CLI.

## License

MIT
