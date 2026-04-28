# @loanscope/compare

[![npm version](https://img.shields.io/npm/v/%40loanscope%2Fcompare.svg)](https://www.npmjs.com/package/@loanscope/compare) [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Comparison grid builder, executor, and goal-seek for evaluating a LoanScope mortgage scenario across multiple dimensions (term, rate, LTV, loan amount, occupancy, products, lenders, borrower sets, FICO, down payment, property type, loan purpose). Produces a `GridResult` with per-cell evaluations and a `GridSummary` aggregating eligibility counts.

Goal-seek searches for the maximum (or other criterion) value along a single knob given target check satisfaction.

## Install

```bash
pnpm add @loanscope/compare @loanscope/engine @loanscope/domain
```

## Usage

```ts
import { ComparisonGridBuilder, executeGrid } from "@loanscope/compare";

const grid = new ComparisonGridBuilder(transaction)
  .addDimension({ kind: "LTV", min: 0.75, max: 0.95, step: 0.05 })
  .build();
const result = executeGrid(grid, products);
```

## Part of the LoanScope monorepo

See [the repository root](https://github.com/ramiisaac/loanscope) for the full list of `@loanscope/*` packages, the underwriting engine, and the CLI.

## License

MIT
