# @loanscope/products

[![npm version](https://img.shields.io/npm/v/%40loanscope%2Fproducts.svg)](https://www.npmjs.com/package/@loanscope/products) [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Declarative LoanScope mortgage product catalogs across the Agency (Fannie Mae, Freddie Mac), Government (FHA, VA, USDA, plus Streamline / IRRRL refinances), and Portfolio (Jumbo Pink, Prime Jumbo, Prime Jumbo Max) channels. Products use `extends`-based inheritance and per-occupancy / per-tier constraint refinement; the resolved tree is flattened by `@loanscope/program-rules`.

## Install

```bash
pnpm add @loanscope/products @loanscope/domain @loanscope/program-rules
```

## Usage

```ts
import { getAllProducts, filterDisplayProducts } from "@loanscope/products";

const products = filterDisplayProducts(getAllProducts());
```

## Part of the LoanScope monorepo

See [the repository root](https://github.com/ramiisaac/loanscope) for the full list of `@loanscope/*` packages, the underwriting engine, and the CLI.

## License

MIT
