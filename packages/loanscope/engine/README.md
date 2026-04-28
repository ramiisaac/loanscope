# @loanscope/engine

[![npm version](https://img.shields.io/npm/v/%40loanscope%2Fengine.svg)](https://www.npmjs.com/package/@loanscope/engine) [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

In-memory mortgage evaluation orchestrator: takes a validated `Transaction` plus a `ProductDefinition`, walks the resolved variant / occupancy / tier overrides via `@loanscope/program-rules`, builds the computational graph via `@loanscope/calculations`, evaluates it via `@loanscope/graph`, and returns a `ScopedRunResponse` with eligibility, checks, blocked nodes, and estimates.

Also exports `quickQuoteToTransaction` for the quick-quote convenience input shape and `evaluateAll` for batch evaluation across a product list.

## Install

```bash
pnpm add @loanscope/engine @loanscope/domain @loanscope/products
```

## Usage

```ts
import { evaluateAll, quickQuoteToTransaction } from "@loanscope/engine";
import { filterDisplayProducts, getAllProducts } from "@loanscope/products";
import { LoanPurpose, Occupancy, PropertyType, money, ratePct } from "@loanscope/domain";

const transaction = quickQuoteToTransaction({
  loanPurpose: LoanPurpose.Purchase,
  occupancy: Occupancy.Primary,
  propertyType: PropertyType.SFR,
  purchasePrice: money(1_250_000),
  requestedLoanAmount: money(1_000_000),
  noteRatePct: ratePct(6.875),
  fico: 740,
  monthlyIncome: money(24_405),
  totalLiquidAssets: money(500_000),
});

const products = filterDisplayProducts(getAllProducts());
const groups = evaluateAll(transaction, products);

// `groups` is a ScopedRunResponse[] — one entry per product, each carrying
// `productId`, `productName`, `eligibility`, `checks`, `blocked`, and
// `estimates`. Filter to eligible matches:
const eligible = groups.filter((g) => g.eligibility.status === "eligible");
console.log(`${eligible.length}/${groups.length} products pass`);
```

## Changelog

See [`CHANGELOG.md`](./CHANGELOG.md) for per-package release history.

## Part of the LoanScope monorepo

See [the repository root](https://github.com/ramiisaac/loanscope) for the full list of `@loanscope/*` packages and the architecture reference.

## License

MIT
