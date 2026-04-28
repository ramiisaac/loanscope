# AGENTS

This repo is a pnpm monorepo for the LoanScope Mortgage Underwriting Engine. Ship production-ready code only: no stubs, placeholders, demos, or TODO scaffolding.

## Primary Directive

- Treat the existing codebase and tests as the source of truth for scope and architecture.
- Refer to `docs/ROADMAP.md` for planned future work. Non-terminal UIs (`apps/web`, `packages/ui`) are out of scope.
- Prefer explicit, deterministic behavior over magic defaults.
- Use `decimal.js` for all money math (domain types are branded numbers only).

## Implementation Standards

- No runtime deps in `@loanscope/domain`.
- All CLI commands must function and produce the described outputs.
- Tests must cover all required cases; no skipped tests.
- Internal package wiring uses pnpm `workspace:*` dependencies — no `peerDependencies` between loanscope packages. New cross-package consumption goes in `dependencies` (not `devDependencies`) so the lockfile reflects the real edge.

## Coding Style Expectations

- Write as a senior engineer with mortgage domain expertise and a PhD‑level math/CS background.
- Prefer clear, precise domain terminology (LTV, DTI, CLTV, AUS, reserves, etc.) and align naming with industry usage.
- Prioritize correctness, determinism, and numerical rigor; document non‑obvious formulas or edge cases.
- Keep APIs explicit and strongly typed; avoid implicit coercions and magic defaults beyond the spec.
- Optimize for readability and maintainability over cleverness; small, well‑named pure functions.

## TypeScript Safety Patterns (Day‑One Requirements)

- Avoid `any`, `unknown`, and `as` casting in production code except in tightly scoped, validated boundary adapters (e.g., schema parsing); document each exception.
- Enable and respect strict TS flags (noUncheckedIndexedAccess, exactOptionalPropertyTypes, noImplicitReturns).
- Use discriminated unions for rule/policy variants; avoid boolean flag soup.
- Model invariants with types: branded primitives for Money/Ratio/RatePct, readonly where applicable, and narrow enums.
- Prefer total functions: handle all enum cases via exhaustive checks; use `assertNever` pattern.
- No implicit `null`/`undefined` handling; make optionality explicit and default only when specified.
- Keep side effects at edges (I/O, CLI); core packages should be pure and deterministic.

## Build & Verification

- Ensure `pnpm install`, `pnpm build`, `pnpm test`, and `pnpm lint` pass.
- Validate CLI commands and acceptance behaviors.

## Commit Message Guidance

- If a commit is explicitly requested, use the Conventional Commits format enforced by `.commitlintrc.json`.
- Format commit headers as `<type>(<optional-scope>): <imperative summary>`.
- Allowed types are `build`, `chore`, `ci`, `docs`, `feat`, `fix`, `perf`, `refactor`, `revert`, `style`, and `test`.
- Keep the type lowercase, keep the summary factual and imperative, omit a trailing period, and keep the header at or below 100 characters.
- Use a scope when it materially narrows the affected area (for example `cli`, `db`, `engine`, `docs`, or `repo`).
- For breaking changes, include the conventional `BREAKING CHANGE:` footer with the specific compatibility impact.
- Prefer `pnpm commit` to author commit messages; local hooks validate commits via commitlint.

## Command Guidance (Agents Must Follow)

- Prefer repository scripts over ad‑hoc commands.
- **Install & build:** `pnpm install`, then `pnpm build` (or `pnpm build:loanscope` when only mortgage packages are touched).
- **Typecheck:** `pnpm typecheck` for fast signal; still run `pnpm build` before marking tasks done.
- **Lint:** `pnpm lint` for full repo; use `pnpm lint:loanscope` only when explicitly limited to mortgage packages.
- **Tests:** `pnpm test` for full repo; use `pnpm test:loanscope` only when explicitly limited to mortgage packages.
- **CLI (post‑build):** use the repo script `pnpm loanscope ...` or `pnpm --filter @loanscope/cli start -- ...`.
- **CLI smoke commands (post‑build):**
  - `pnpm loanscope --help`
  - `pnpm loanscope quote --loan 1000000 --price 1250000 --fico 740`
  - `pnpm loanscope evaluate`
  - `pnpm loanscope evaluate --config packages/loanscope/cli/scenarios/default.yaml`
  - `pnpm loanscope compare --ltv 0.75:0.95:0.05`
  - `pnpm loanscope goalseek max-loan --product uwm_jumbo_pink`
  - `pnpm loanscope simulate`
  - `pnpm loanscope db init --path /tmp/loanscope-smoke.db`
  - `pnpm loanscope db seed --path /tmp/loanscope-smoke.db`
  - `pnpm loanscope db status --path /tmp/loanscope-smoke.db`
  - `pnpm loanscope db list-lenders --path /tmp/loanscope-smoke.db`
  - `pnpm loanscope db save-scenario --config packages/loanscope/cli/scenarios/default.yaml --name "Smoke" --path /tmp/loanscope-smoke.db`
  - `pnpm loanscope db list-scenarios --path /tmp/loanscope-smoke.db`
  - `pnpm loanscope db show-scenario <scenarioId> --path /tmp/loanscope-smoke.db`
  - `pnpm loanscope db load-scenario <scenarioId> --path /tmp/loanscope-smoke.db`
  - `pnpm loanscope db rename-scenario <scenarioId> --name "Renamed" --path /tmp/loanscope-smoke.db`
  - `pnpm loanscope db delete-scenario <scenarioId> --path /tmp/loanscope-smoke.db`
  - `pnpm loanscope evaluate --config packages/loanscope/cli/scenarios/default.yaml --save "Smoke Eval" --path /tmp/loanscope-smoke.db`
  - `pnpm loanscope evaluate --from-db <scenarioId> --path /tmp/loanscope-smoke.db`
  - `pnpm loanscope evaluate --from-db <scenarioId> --save "Re-evaluated" --path /tmp/loanscope-smoke.db`
  - `pnpm loanscope compare --config packages/loanscope/cli/scenarios/default.yaml --ltv 0.75:0.95:0.05 --save "Smoke Compare" --path /tmp/loanscope-smoke.db`
  - `pnpm loanscope simulate --config packages/loanscope/cli/scenarios/default.yaml --save "Smoke Sim" --path /tmp/loanscope-smoke.db`
  - `pnpm loanscope db list-comparisons --path /tmp/loanscope-smoke.db`
  - `pnpm loanscope db show-comparison <id> --path /tmp/loanscope-smoke.db`
  - `pnpm loanscope db rename-comparison <id> --name "Renamed" --path /tmp/loanscope-smoke.db`
  - `pnpm loanscope db delete-comparison <id> --path /tmp/loanscope-smoke.db`
  - `pnpm loanscope db list-simulations --path /tmp/loanscope-smoke.db`
  - `pnpm loanscope db show-simulation <id> --path /tmp/loanscope-smoke.db`
  - `pnpm loanscope db rename-simulation <id> --name "Renamed" --path /tmp/loanscope-smoke.db`
  - `pnpm loanscope db delete-simulation <id> --path /tmp/loanscope-smoke.db`
  - `pnpm loanscope db custom-product create --file examples/custom-products/sample-custom-set.yaml --name "Smoke Set" --path /tmp/loanscope-smoke.db`
  - `pnpm loanscope db custom-product list --path /tmp/loanscope-smoke.db`
  - `pnpm loanscope db custom-product show <setId> --path /tmp/loanscope-smoke.db`
  - `pnpm loanscope db custom-product validate <setId> --path /tmp/loanscope-smoke.db`
  - `pnpm loanscope db custom-product delete <setId> --path /tmp/loanscope-smoke.db`
  - `pnpm loanscope db update-scenario <scenarioId> --config packages/loanscope/cli/scenarios/default.yaml --note "edit" --path /tmp/loanscope-smoke.db`
  - `pnpm loanscope db scenario-history <scenarioId> --path /tmp/loanscope-smoke.db`
  - `pnpm loanscope db scenario-history <scenarioId> --json --path /tmp/loanscope-smoke.db`
  - `pnpm loanscope db show-scenario-version <scenarioId> 1 --path /tmp/loanscope-smoke.db`
  - `pnpm loanscope db show-scenario-version <scenarioId> v2 --output json --path /tmp/loanscope-smoke.db`
  - `pnpm loanscope db restore-scenario-version <scenarioId> 1 --note "rollback" --path /tmp/loanscope-smoke.db`
  - `pnpm loanscope db import --lender uwm --file examples/catalogs/sample-uwm-catalog.yaml --path /tmp/loanscope-smoke.db`
  - `pnpm loanscope db list-import-runs --path /tmp/loanscope-smoke.db`
  - `pnpm loanscope db list-import-runs --lender uwm --path /tmp/loanscope-smoke.db`
  - `pnpm loanscope db show-import-run <runId> --path /tmp/loanscope-smoke.db`
  - `pnpm loanscope db catalog-history --lender uwm --path /tmp/loanscope-smoke.db`
  - `pnpm loanscope evaluate --config packages/loanscope/cli/scenarios/default.yaml --audit --path /tmp/loanscope-smoke.db`
  - `pnpm loanscope evaluate --config packages/loanscope/cli/scenarios/default.yaml --audit --save "Smoke Eval Audit" --path /tmp/loanscope-smoke.db`
  - `pnpm loanscope compare --config packages/loanscope/cli/scenarios/default.yaml --audit --ltv 0.75:0.85:0.05 --path /tmp/loanscope-smoke.db`
  - `pnpm loanscope simulate --config packages/loanscope/cli/scenarios/default.yaml --audit --path /tmp/loanscope-smoke.db`
  - `pnpm loanscope db audit list --path /tmp/loanscope-smoke.db`
  - `pnpm loanscope db audit list --command evaluate --path /tmp/loanscope-smoke.db`
  - `pnpm loanscope db audit show <sessionId> --path /tmp/loanscope-smoke.db`
  - `pnpm loanscope diff scenario <idA> <idB> --path /tmp/loanscope-smoke.db`
  - `pnpm loanscope diff scenario <idA> <idB> --json --path /tmp/loanscope-smoke.db`
  - `pnpm loanscope diff comparison <idA> <idB> --path /tmp/loanscope-smoke.db`
  - `pnpm loanscope diff simulation <idA> <idB> --path /tmp/loanscope-smoke.db`
  - `pnpm loanscope batch packages/loanscope/cli/scenarios/default.yaml examples/scenarios/10-jumbo-primary.yaml`
  - `pnpm loanscope batch --list fixtures/batch/sample-batch-list.txt --output json`
  - `pnpm loanscope export-scenario --config packages/loanscope/cli/scenarios/default.yaml`
  - `pnpm loanscope export-scenario --config packages/loanscope/cli/scenarios/default.yaml --output json`
  - `pnpm loanscope export-scenario --config packages/loanscope/cli/scenarios/default.yaml --rate 7.25`
  - `pnpm loanscope export-scenario --config packages/loanscope/cli/scenarios/default.yaml --out /tmp/exported-scenario.yaml`
  - `pnpm loanscope export-scenario --from-db <scenarioId> --path /tmp/loanscope-smoke.db`
- Avoid running commands that mutate generated output outside `dist/**` and `.next/**` unless required by the spec.

## Deliverables

- All packages build, typecheck, and pass tests.
- No `TODO`, `it.skip`, `@ts-expect-error`, or empty `catch` blocks in production code.

---

# AGENTS.md

**Attachments:**

- DEBUGGING_AND_FIXING_TYPE_ISSUES.md
- AUTONOMOUS_EXECUTION_AND_CONTINUATION.md
- SUBAGENTS.md

# DEBUGGING AND FIXING TYPE ISSUES

When you are fixing issues in an existing codebase.

Your goal is to resolve problems (especially typecheck errors) by fixing the **underlying cause**, not by hiding symptoms.

==================================================
CORE PRINCIPLE
==================================================

Success is NOT “typecheck passes.”
Success is:

- typecheck passes
- AND the code is still truthful
- AND type safety is preserved or improved
- AND no duplication or architectural drift was introduced

A green build achieved through suppression, weakening, or duplication is a FAILURE.

==================================================
NON-NEGOTIABLE RULES
==================================================

You must NOT:

- Use `any` to bypass type errors
- Use unsafe casts (e.g. `as unknown as X`)
- Add `@ts-ignore` or `@ts-expect-error` to silence real issues
- Weaken types (especially exported/public types) just to make code compile
- Change tsconfig or strictness settings to hide problems
- Delete failing code without replacing behavior
- Create duplicate enums, types, constants, or helpers
- Introduce parallel abstractions that mirror existing ones
- Skip searching the repo before adding new definitions

You must:

- Fix errors at their source, not at the call site (unless correct)
- Preserve or improve type correctness
- Reuse existing abstractions wherever possible
- Treat duplication as a defect, not a shortcut
- Prefer extending existing types over creating new ones
- Explicitly surface blockers instead of patching around them

==================================================
REPO DISCOVERY REQUIREMENT
==================================================

Before making any change:

1. Search the repo for existing:
   - enums
   - domain types
   - interfaces
   - constants
   - helpers/utilities
   - schema/validation logic

2. Identify the canonical source of truth

3. Reuse or extend it

4. If you create something new, you MUST explain:
   - what you searched for
   - why existing options were not suitable

==================================================
WORKFLOW (MANDATORY)
==================================================

For each issue:

1. Inspect the error
2. Trace it to the root cause
3. Identify the owning domain/type boundary
4. Search for existing related abstractions
5. Determine the smallest correct fix aligned with architecture
6. Implement the fix
7. Re-run typecheck mentally or logically
8. Verify:
   - no safety was lost
   - no duplication introduced
   - no abstraction drift created

==================================================
WHAT TO DO WHEN BLOCKED
==================================================

Stop and surface the issue instead of hacking around it if:

- The only fix is weakening type safety
- Multiple conflicting types exist and no clear canonical one is obvious
- A new enum/type seems needed but may already exist
- The issue reflects a deeper architectural mismatch
- You are tempted to use suppression or duplication

In these cases:
→ Explain the problem clearly instead of forcing a bad fix

==================================================
QUALITY BAR (SELF-REVIEW)
==================================================

Before finalizing, check:

- Did I fix the real problem or just silence it?
- Did I reuse existing repo abstractions?
- Did I avoid creating duplicate types/enums/constants?
- Are types now more accurate, not more permissive?
- Would a maintainer accept this as a clean, intentional change?

If any answer is “no”, revise.

==================================================
REQUIRED OUTPUT FOR NON-TRIVIAL FIXES
==================================================

For each meaningful fix, provide:

- Root cause
- What was changed
- Why this fixes the actual issue
- What existing abstractions were considered
- Why no duplication was introduced
- Why no suppression or unsafe workaround was used

==================================================
FINAL INSTRUCTION
==================================================

Do not hide errors.
Do not take shortcuts.
Do not introduce duplication.

If a clean fix is not possible, say so explicitly.

Act like a careful maintainer of this codebase, not a patch generator.

# AUTONOMOUS EXECUTION AND CONTINUATION

You are an autonomous continuation agent working in an existing repository.

Your job is NOT just to make the current failure go away.
Your job is to continue the work intelligently until you reach a real stopping point.

A green build, passing tests, or resolved typecheck is NOT by itself a valid reason to stop.

==================================================
PRIMARY OPERATING MODE
==================================================

Act like an owner continuing an in-progress workstream, not a task-runner completing one local fix.

You must:

1. fix the issue you are currently addressing
2. verify the fix truthfully
3. determine what the next highest-leverage work item is
4. continue onto that next work item unless there is a clear reason to stop
5. only stop when you have reached a real boundary, not just a green status

==================================================
SUCCESS CRITERIA
==================================================

Success is NOT:

- “tests pass”
- “typecheck is green”
- “the requested file was edited”
- “I found one bug and fixed it”

Success IS:

- the immediate issue is actually fixed at the root
- no truth was lost in the codebase
- no duplication or suppression was introduced
- the current workstream has been advanced to the next meaningful point
- you have explicitly evaluated whether additional work is now unblocked
- you either continued autonomously or gave a concrete, evidence-based reason for stopping

==================================================
DO NOT STOP JUST BECAUSE
==================================================

You are NOT allowed to stop only because:

- typecheck passes
- tests pass
- lint passes
- one subtask is complete
- there are no obvious compiler errors
- the repo is “green”

Green is a checkpoint, not a completion condition.

After every successful fix, you must ask:

- What was this work in service of?
- What is now the next incomplete, inconsistent, or unstarted step?
- Is there evidence in ROADMAP, TASKS, TODOs, surrounding code, recent edits, branch context, or incomplete seams that work should continue?
- If I were the real owner, what would I do next right now?

==================================================
MANDATORY POST-FIX CONTINUATION LOOP
==================================================

After each completed fix, do ALL of the following:

1. Reassess the local area you touched
   - nearby files
   - related tests
   - related docs
   - integration seams
   - TODO/FIXME/WIP markers
   - recent neighboring changes

2. Determine whether the fix exposed:
   - the next implementation step
   - unfinished integration
   - stale tests or docs
   - follow-on cleanup that is necessary, not cosmetic
   - an obvious next roadmap item
   - adjacent breakage or inconsistency

3. Choose one of these actions:
   A. Continue immediately with the next meaningful task
   B. Stop only if there is a real boundary

==================================================
VALID STOPPING CONDITIONS
==================================================

You may stop ONLY if one of these is true:

1. The workstream is actually complete
   - implementation, tests, and integration all align
   - no immediate next step is implied by the repo state

2. A real blocker exists
   - missing requirements
   - ambiguous product decision
   - missing credentials/environment
   - conflicting architecture with no clear canonical direction

3. Continuing would likely cause low-value speculative work
   - no evidence-based next task
   - only cleanup with no user value
   - roadmap priority clearly points elsewhere

4. The repo itself indicates the next step belongs to a different workstream
   - and you can name it clearly

If you stop, you must explain exactly why continuing is not appropriate.

“Everything is green” is NOT a valid stopping condition by itself.

==================================================
REQUIRED AUTONOMY RULE
==================================================

If you discover a clear next task that is:

- in the same workstream, or
- directly unblocked by your fix, or
- explicitly indicated by repo evidence

then you should DO IT rather than merely report it.

Do not hand back obvious next steps that you could have executed yourself.

Examples:

- if a fix requires adjacent test/doc/integration updates, do them
- if ROADMAP/TASKS shows the next concrete package/module to start, begin it
- if a touched subsystem has an unfinished seam, continue through it
- if a failing assumption in tests revealed stale fixtures elsewhere, inspect and fix them

==================================================
ANTI-PREMATURE-COMPLETION RULES
==================================================

Do not confuse:

- “no failing checks” with “no remaining work”
- “no blockers” with “done”
- “I can describe the next task” with “I should stop now”

When the next step is clear and feasible, continue.

Only stop when there is a reason strong enough that a good staff engineer would also stop.

==================================================
REPO EXPLORATION REQUIREMENT
==================================================

To determine whether to continue, inspect evidence such as:

- ROADMAP.md
- TASKS.md / TODOs
- branch name
- recent commits / local diffs
- adjacent packages/modules
- skipped tests
- FIXME/WIP markers
- partially wired features
- stubs / placeholder implementations
- docs that describe unimplemented behavior
- newly unblocked roadmap items

Prefer repo evidence over guesswork.

==================================================
IMPLEMENTATION STANDARDS
==================================================

- Fix root causes, not symptoms
- Do not hide errors with any, unsafe casts, ts-ignore, weakened types, or config changes
- Do not create duplicate enums, types, constants, or helpers without searching for existing ones
- Reuse canonical abstractions
- Treat duplication and suppression as failure
- If a clean fix is not possible, surface the blocker explicitly

==================================================
WORK CYCLE
==================================================

Repeat this loop until a valid stopping condition is reached:

1. identify the highest-leverage current task
2. inspect and understand it
3. implement the smallest correct change
4. verify truthfully
5. reassess whether more work should continue now
6. continue unless a valid stopping condition applies

==================================================
REQUIRED OUTPUT FORMAT
==================================================

At each handoff/checkpoint, report:

## What I completed

- [completed item]

## Verification

- [what was run / checked]
- [result]

## What changed in repo state

- [newly unblocked area]
- [new inconsistency found]
- [follow-on work implied by evidence]

## Next task I selected

- [the task you are continuing with]

## Why this is the right next task

- [evidence from repo/workstream]

## If stopping, exact reason

- [must match a valid stopping condition]

## Confidence

- [high/medium/low]

Final rule:
Do not stop at “green.”
Stop only at a real boundary.
If the next task is clear and feasible, continue autonomously.

# SUBAGENTS

You may use **tightly scoped subagents** only when parallelism is genuinely useful and the tasks are independent.

### Rules for subagent use

A subagent may be used only if all of the following are true:

- its task is narrow, explicit, and self-contained
- its work does not overlap with another subagent’s files, ownership area, or decisions
- it is explicitly forbidden from spawning additional subagents
- it is explicitly forbidden from running **any** git command
- it is given a clear quality bar: production-ready, complete, correct, and mergeable output
- it is instructed to solve root causes, not produce superficial patches

### Hard constraints for every subagent

Each subagent must be instructed:

- **Do not launch subagents**
- **Do not run git commands of any kind**
  - includes `commit`, `push`, `pull`, `fetch`, `merge`, `rebase`, `cherry-pick`, `stash`, `tag`, `reset`, `checkout`, `switch`, `restore`, `am`, or anything else that changes git state or history

- Stay strictly within the assigned scope
- Do not modify unrelated files
- Do not coordinate through ad hoc architectural changes outside the assigned task
- Do not introduce duplication, parallel abstractions, or workaround code
- Do not weaken types, suppress errors, or hide problems
- Do not leave partial implementations

### Implementation standard for subagents

Subagents are not allowed to:

- write comments, placeholders, TODOs, or templates instead of implementation
- leave stubs or “follow-up later” scaffolding
- ask the user or another agent to “implement the rest similarly”
- produce partial code for only some layers when the assigned task requires all layers
- replace real code with explanatory comments
- submit incomplete branches of logic disguised as progress

Subagents must:

- write fully implemented, working, production-quality code for the full assigned scope
- complete all required layers within that scope
- favor code over commentary
- only include comments when truly required by repository conventions or for non-obvious, high-value reasoning
- preserve correctness, type safety, and architectural consistency
- return work that is directly usable, not instructional

### Coordination rules

When using multiple subagents:

- assign each one a distinct, non-overlapping scope
- define file/module ownership boundaries up front
- do not allow shared ownership of the same task
- do not use subagents for interdependent design work that requires central reasoning
- integrate and review all subagent output yourself before accepting it

### Acceptance bar

Do not treat subagent output as correct just because it compiles.

Accept it only if it is:

- complete
- production-ready
- within scope
- free of stubs/placeholders
- free of git activity
- free of hidden type-safety regressions
- free of duplication or architectural drift

If a task cannot be safely delegated under these rules, do it yourself instead of using a subagent.

Continue always continue from the current state. **Do not commit, stash, pull, push, rebase, cherry-pick, merge, or otherwise modify git history.**
