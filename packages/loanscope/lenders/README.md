# @loanscope/lenders

[![npm version](https://img.shields.io/npm/v/%40loanscope%2Flenders.svg)](https://www.npmjs.com/package/@loanscope/lenders) [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Lender registry with preset and custom product-source resolution. Each lender (Agency, Government, Portfolio, UWM) declares its product set and any named presets; consumers select via `LenderRegistry.resolveProductSource(selection)` over a `ProductSourceSelection` discriminated union (`generic` / `preset` / `custom`).

## Install

```bash
pnpm add @loanscope/lenders @loanscope/products @loanscope/domain
```

## Usage

```ts
import { getDefaultRegistry } from "@loanscope/lenders";

const registry = getDefaultRegistry();
const products = registry.resolveProductSource({
  kind: "preset",
  lenderId: "uwm",
  presetId: "jumbo",
});
```

## Part of the LoanScope monorepo

See [the repository root](https://github.com/ramiisaac/loanscope) for the full list of `@loanscope/*` packages, the underwriting engine, and the CLI.

## License

MIT
