# @loanscope/graph

[![npm version](https://img.shields.io/npm/v/%40loanscope%2Fgraph.svg)](https://www.npmjs.com/package/@loanscope/graph) [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Generic typed DAG evaluator with provenance tracking, scoped evaluation, and a `BlockedNode` surface for missing inputs. Used as the computation substrate for the LoanScope underwriting engine.

## Why a separate package

Mortgage underwriting is the motivating use case, but the graph mechanism is domain-agnostic — it's a typed DAG library in the same way [`immer`](https://immerjs.github.io/immer/) is a typed structural-sharing library. Factoring it out of `@loanscope/engine`:

- **Keeps `engine` focused on mortgage orchestration.** The engine's source deals with tier resolution, variant selection, effective-data assembly, and scoped responses — not with DAG traversal algorithms.
- **Makes the DAG semantics reusable.** Any other LoanScope package (comparison grids, simulations, future rules engines) can compose the same provenance-tracking evaluator without depending on `@loanscope/engine`.
- **Makes the DAG semantics testable in isolation.** The graph package has its own unit test suite (29 tests) pinning ordering, provenance, and blocked-node invariants independent of any mortgage logic.
- **Enables `@loanscope/calculations` to exist as a pure wiring layer.** Calculations imports `@loanscope/graph` types and emits `NodeDefinition` / `EdgeDefinition` values; it never touches traversal code.

## What it does

A graph is built from:

- `NodeDefinition<T>` — a typed value keyed by string id. Inputs supply values; intermediates and outputs receive values from edges.
- `EdgeDefinition` — a pure function over input node ids that produces one or more output node ids. Each edge declares its `confidence` (`derived` / `estimated` / `partial`), which flows through to the resolved node.

Evaluation is total:

- Every output is either **resolved** (with a confidence label) or **blocked** (with the set of missing input node ids that prevented its evaluation).
- There are no silent defaults: a missing input blocks downstream evaluation cleanly rather than being coerced to `0` / `null`.
- Provenance is recorded: every computed value carries the id of the edge that produced it, so downstream tooling can trace any result back to its source.

Checks are first-class edges that emit `UnderwritingCheck` records; they participate in the same blocked-vs-resolved semantics as every other node.

## Install

```bash
pnpm add @loanscope/graph
```

## Usage

Rarely consumed directly by external code — `@loanscope/calculations` is the canonical in-repo consumer. See that package for end-to-end examples of building a graph from node and edge definitions and evaluating it via `@loanscope/graph`.

## Part of the LoanScope monorepo

See [the repository root](https://github.com/ramiisaac/loanscope) for the full list of `@loanscope/*` packages and the architecture reference.

## License

MIT
