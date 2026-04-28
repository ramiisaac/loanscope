# @loanscope/program-rules

[![npm version](https://img.shields.io/npm/v/%40loanscope%2Fprogram-rules.svg)](https://www.npmjs.com/package/@loanscope/program-rules) [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Canonical resolver primitives for `ProgramRules`: `toProgramRules`, `mergeRules`, `resolveVariant`, `findApplicableTier`.

## Why a separate package

These four primitives flatten, merge, and dispatch over the `ProgramRules` shape from `@loanscope/domain`. They are consumed by both `@loanscope/engine` (for runtime tier / variant / occupancy resolution) and `@loanscope/products` (for catalog-flattening via `extends` chains).

Until this package existed, each consumer had its own private copy of the three primitives — byte-identical except for trivial parameter-name differences. That duplication was a documented drift risk: any new `ProgramRules` field had to be threaded through four places (two `toProgramRules` implementations, two `mergeRules` implementations), and every bug fix had to be replicated.

Factoring the primitives into this leaf package:

- **Eliminates the drift risk.** One canonical `toProgramRules`, one `mergeRules`, one `resolveVariant`, one `findApplicableTier`.
- **Preserves the correct dependency direction.** Neither `@loanscope/engine` nor `@loanscope/products` can depend on the other (would cycle). Both can depend on this package, which in turn depends only on `@loanscope/domain` for type shapes.
- **Is pinned by invariant tests.** 10 tests live in the package's `__tests__/` asserting the merge / normalize / override-wins semantics that every consumer relies on.

## What it does

- **`toProgramRules(rules, context)`** — normalize a `Partial<ProgramRules>` into a fully-typed `ProgramRules` by asserting the two strictly-required fields (`allowedPurposes`, `allowedOccupancies`) and copying every optional field through only when defined. `context` is threaded into the error message so catalog authors can locate offending products.
- **`mergeRules(base, override)`** — layer `override` onto `base` field-by-field with override-wins semantics. `maxLtvByOccupancy` and `maxLtvByPurpose` are merged key-by-key via `mergeRecord` so partial overrides refine individual occupancies / purposes without clobbering siblings. Nested-object rules (borrower, appraisal, cash-out, property, AUS, asset-eligibility, buydown, MI) are merged shallowly via `mergeOptional`.
- **`resolveVariant(product, term, occupancy, amortizationType, programKind?, armFixedPeriod?)`** — resolve the single `ProductVariant` that matches. The resolver is total: exactly-one match is required; zero matches and more-than-one matches both throw so ambiguous catalog shapes surface at runtime instead of producing silently-wrong evaluations.
- **`findApplicableTier(tiers, loanAmount)`** — find the first `LoanAmountTier` whose range contains `loanAmount`. Missing bounds are treated as open (`min ?? 0`, `max ?? +Infinity`).

## Install

```bash
pnpm add @loanscope/program-rules @loanscope/domain
```

## Usage

```ts
import {
  mergeRules,
  resolveVariant,
  findApplicableTier,
  toProgramRules,
} from "@loanscope/program-rules";
import { AmortizationType, Occupancy, ProgramKind } from "@loanscope/domain";

// Flatten a partial rules object (throws if required fields are missing)
const normalized = toProgramRules(product.baseConstraints, `product ${product.id}`);

// Layer an override onto a base set of rules
const merged = mergeRules(normalized, {
  maxLTVRatio: 0.9,
  maxLtvByOccupancy: { [Occupancy.Investment]: 0.75 },
});

// Dispatch to the matching variant for a given transaction shape
const variant = resolveVariant(
  product,
  360,
  Occupancy.Primary,
  AmortizationType.FullyAmortizing,
  ProgramKind.Fixed,
);

// Walk tier overrides for loan-amount-dependent rules
const tier = findApplicableTier(product.tiers, loanAmount);
```

## Part of the LoanScope monorepo

See [the repository root](https://github.com/ramiisaac/loanscope) for the full list of `@loanscope/*` packages and the architecture reference.

## License

MIT
