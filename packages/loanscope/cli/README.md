# @loanscope/cli

[![npm version](https://img.shields.io/npm/v/%40loanscope%2Fcli.svg)](https://www.npmjs.com/package/@loanscope/cli) [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

LoanScope command-line interface. Wraps the underwriting engine, comparison grids, goal-seek, simulation, scenario / comparison / simulation persistence, custom product set management, catalog import pipeline, audit sessions, diff, batch mode, and scenario export in a Commander-based CLI.

## Install

```bash
pnpm add -g @loanscope/cli
```

After install, the `loanscope` binary is on your `PATH`.

## Commands

Quick one-shot quote (no config file):

```bash
loanscope quote --loan 1000000 --price 1250000 --fico 740
```

Full evaluation from a YAML scenario:

```bash
loanscope evaluate --config scenarios/default.yaml --output table
loanscope evaluate --config scenarios/default.yaml --output json
```

Comparison grid across LTV and term:

```bash
loanscope compare --config scenarios/default.yaml --ltv 0.75:0.95:0.05 --terms 360,480
```

Goal-seek maximum loan amount that still passes every check:

```bash
loanscope goalseek max-loan --product uwm_jumbo_pink --config scenarios/default.yaml
```

Simulate borrower actions (pay-down, add reserves, include borrower, etc.):

```bash
loanscope simulate --config scenarios/default.yaml
```

Persist and replay:

```bash
loanscope db init
loanscope db save-scenario --name "Smith Refi" --config scenarios/default.yaml
loanscope evaluate --from-db <scenarioId> --save "Smith Refi Eval"
loanscope db show-scenario <scenarioId>
```

Reproducible audit trail:

```bash
loanscope evaluate --config scenarios/default.yaml --audit
loanscope db audit list
loanscope db audit show <sessionId>
```

Diff two persisted runs:

```bash
loanscope diff scenario <idA> <idB>
loanscope diff comparison <idA> <idB>
loanscope diff simulation <idA> <idB>
```

Batch evaluate a list of scenarios:

```bash
loanscope batch scenarios/a.yaml scenarios/b.yaml scenarios/c.yaml --output csv
```

Export a scenario back to a re-loadable YAML file (with optional rate/term overrides):

```bash
loanscope export-scenario --from-db <scenarioId> --out /tmp/rederived.yaml --rate 7.25
```

See `loanscope --help` for the full command tree and `loanscope <command> --help` for per-command options.

## Changelog

See [`CHANGELOG.md`](./CHANGELOG.md) for per-package release history.

## Part of the LoanScope monorepo

See [the repository root](https://github.com/ramiisaac/loanscope) for the full list of `@loanscope/*` packages and the architecture reference.

## License

MIT
