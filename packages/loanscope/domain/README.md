# @loanscope/domain

[![npm version](https://img.shields.io/npm/v/%40loanscope%2Fdomain.svg)](https://www.npmjs.com/package/@loanscope/domain) [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Branded primitive types (`Money`, `Ratio`, `RatePct`, `Months`, `Units`, `Fico`), enums (`LoanType`, `LoanPurpose`, `Occupancy`, `PropertyType`, `ProgramKind`, `AmortizationType`, `Channel`, etc.), and canonical model interfaces (`ProductDefinition`, `Transaction`, `Scenario`, `Borrower`, `IncomeStream`, `ProgramRules`) that together form the type-level contract for every other LoanScope package.

Zero runtime dependencies by design. The package is the kernel that every other LoanScope package consumes; it must remain pure types plus a small set of brand-constructor helpers (`money(n)`, `ratio(n)`, `ratePct(n)`, `months(n)`, `assertNever`).

## Install

```bash
pnpm add @loanscope/domain
```

## Usage

```ts
import { money, ratio, LoanPurpose, type Transaction } from "@loanscope/domain";

const loanAmount = money(500_000);
const ltv = ratio(0.8);
const purpose = LoanPurpose.Purchase;
```

## Changelog

See [`CHANGELOG.md`](./CHANGELOG.md) for per-package release history.

## Part of the LoanScope monorepo

See [the repository root](https://github.com/ramiisaac/loanscope) for the full list of `@loanscope/*` packages, the underwriting engine, and the CLI.

## License

MIT
