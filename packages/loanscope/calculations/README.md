# @loanscope/calculations

[![npm version](https://img.shields.io/npm/v/%40loanscope%2Fcalculations.svg)](https://www.npmjs.com/package/@loanscope/calculations) [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Computational graph node and edge definitions for LoanScope mortgage underwriting. Wires `@loanscope/math` primitives into the typed DAG evaluator from `@loanscope/graph`.

Edges include LTV / CLTV / financed-loan-amount, payment / qualifying payment, DTI, housing (PITI), cash-to-close, reserves (with AUS-floor layering), government fees (FHA / VA / USDA), borrower-blend (representative FICO), per-stream qualifying-income policies, and 18 first-class eligibility checks (LTV, CLTV, DTI, FICO, loan amount, reserves, cash-to-close, occupancy, purpose, property type, units, borrower restrictions, state restrictions, cash-out, buydown, MI, AUS, appraisal).

## Install

```bash
pnpm add @loanscope/calculations @loanscope/graph @loanscope/math @loanscope/domain
```

## Usage

```ts
import { buildMortgageGraph } from "@loanscope/calculations";

const graph = buildMortgageGraph(transaction, product);
```

## Part of the LoanScope monorepo

See [the repository root](https://github.com/ramiisaac/loanscope) for the full list of `@loanscope/*` packages, the underwriting engine, and the CLI.

## License

MIT
