# @loanscope/math

[![npm version](https://img.shields.io/npm/v/%40loanscope%2Fmath.svg)](https://www.npmjs.com/package/@loanscope/math) [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Pure mortgage math primitives used by the LoanScope underwriting engine: amortization (`calculatePMTFixed`, `calculateInterestOnlyPayment`), LTV / DTI / CLTV, reserves resolution (with AUS-floor layering), qualifying income / payment policies, multi-borrower FICO blending, government fee schedules (FHA UFMIP + annual MIP, VA funding fee with IRRRL handling, USDA upfront + annual), closing-cost / property-tax / HOA / insurance / MI estimators, and effective program limits.

All math is performed via [`decimal.js`](https://mikemcl.github.io/decimal.js/) under the hood; consumers receive branded primitives (`Money`, `Ratio`, etc.) from `@loanscope/domain`.

## Install

```bash
pnpm add @loanscope/math @loanscope/domain
```

## Usage

```ts
import {
  calculatePMTFixed,
  calculateLTV,
  calculateDTI,
  calculateFhaUfmip,
  calculateVaFundingFee,
} from "@loanscope/math";
import { LoanPurpose, money, months, ratePct } from "@loanscope/domain";

// Fully-amortizing monthly payment
const payment = calculatePMTFixed(money(500_000), ratePct(6.875), months(360));
// => Money — ~$3,285.31

// Loan-to-value ratio
const ltv = calculateLTV(money(500_000), money(625_000));
// => Ratio — 0.8

// Debt-to-income ratio (housing + liabilities / qualifying income)
const dti = calculateDTI(money(3_650), money(500), money(14_000));
// => Ratio — ~0.296

// FHA upfront mortgage insurance premium (1.75% of base loan)
const ufmip = calculateFhaUfmip({ loanAmount: money(500_000) });
// => Money — $8,750

// VA funding fee with IRRRL handling
const vaFee = calculateVaFundingFee({
  loanAmount: money(500_000),
  ltv,
  loanPurpose: LoanPurpose.IrrrlRefi,
  serviceContext: { priorUse: false, disabilityExempt: false, reserveOrGuard: false },
});
// => Money — $2,500 (0.5% IRRRL fixed rate)
```

## Changelog

See [`CHANGELOG.md`](./CHANGELOG.md) for per-package release history.

## Part of the LoanScope monorepo

See [the repository root](https://github.com/ramiisaac/loanscope) for the full list of `@loanscope/*` packages and the architecture reference.

## License

MIT
