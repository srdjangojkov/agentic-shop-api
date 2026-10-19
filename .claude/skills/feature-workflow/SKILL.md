---
name: feature-workflow
description: Plan, test-drive, implement, verify and review one change in this repo (for example migrating one Express endpoint to the NestJS app in nest/). Use for any non-trivial code change or migration slice.
---

# Feature workflow

Runs one change from plan to PR. It orchestrates existing tools instead of re-implementing them. Read
`CLAUDE.md`, `docs/ai-workflow/decisions.md` and `docs/ai-workflow/parity.md` first.

Scope is one change: one endpoint or one concern. Never migrate more than was asked.

## 1. Explore

Use the built-in **Explore** agent to map the code the change touches: the Express route, validator,
controller, service and model chain, and anything already in `nest/`. Ask it for `file:line` references.
Check `docs/ai-workflow/api-inventory.md` for the documented behavior and quirks.

## 2. Plan, then stop for approval

Before proposing the plan, read `CLAUDE.md`, `docs/ai-workflow/decisions.md`, `docs/ai-workflow/parity.md`
and the relevant sections of `docs/ai-workflow/api-inventory.md`. Use the findings from step 1 and cite
`file:line` locations where useful.

- If the change introduces or modifies module boundaries, service responsibilities or test seams, invoke
  **`mattpocock-skills:codebase-design`** and use its relevant recommendations. Add no unnecessary
  abstractions or unrelated refactors.
- If existing behavior, business rules or the intended API contract are ambiguous, invoke
  **`mattpocock-skills:grill-with-docs`** to resolve it before finalizing the plan. Ask only questions that
  materially affect behavior, compatibility, security or data integrity. Do not guess missing requirements.

Write a short plan for the user with these sections:

- **Current behavior:** the Express implementation as observed in the code: status codes, request
  validation, response shapes, error handling, persistence and relevant edge cases. Separate verified
  behavior from assumptions or undocumented behavior.
- **Target behavior:** how the change is implemented in NestJS and how it fits the existing module
  architecture. Keep it as small as reasonably possible.
- **Contract changes:** every proposed difference from Express, each with why it is needed. No API contract
  or business-rule change is made silently. If there are none, say so.
- **Security flags:** any flag from `decisions.md` (S1–S7, A1) the change touches. If one is involved, stop
  and ask the user to decide. Never copy flagged behavior into NestJS by default or resolve a security
  decision silently.
- **Test strategy:** the test seam, the Express characterization tests, the NestJS tests, their files and
  the isolated test-database helpers. List the success, validation, not-found and failure cases to cover.
- **Verification and review:** the type-checks, test suites, hook test and independent reviews that will
  run, using the commands in step 4 and the reviews in step 5.
- **Documentation:** the expected updates to `parity.md`, `api-inventory.md` and `decisions.md`.

Keep the plan concise but specific enough for the user to judge behavior, scope, risks and tests.

Wait for the user's explicit approval before writing or modifying implementation code, tests or project
files. Read-only exploration and analysis are allowed before approval. If a blocking ambiguity or security
decision needs the user, ask one focused question and wait instead of assuming.

After approval, follow the remaining steps in order. Approval of the plan is not permission to expand scope
or to make further contract or security decisions.

## 3. Test first

Invoke the **`mattpocock-skills:tdd`** skill with the Skill tool and follow it: red before green, one
test per cycle, tests at the agreed seam only.

- Characterize Express first: a test in `test/` that passes against the current Express app.
- Then write the NestJS test in `nest/test/` with the same assertions. It must fail before the code exists.
- Tests use the isolated test database helpers only (`test/helpers/test-db.ts`, `nest/test/test-db.ts`).
  Never point a test at `DB_URI`, Atlas or any shared database.

If the skill is not available in the session, say so in the PR and the reply. Do not claim it was used.

## 4. Implement

Write the smallest change that makes the failing test pass. No unrelated fixes or refactors.

Run and keep the real output:

```
npx tsc --noEmit                      # Express type-check
npm test                              # Express tests
cd nest && npx tsc --noEmit && npm test
node .claude/hooks/protect-env.test.js
```

## 5. Review

Two independent checks, both on the diff against the base branch:

1. Invoke **`mattpocock-skills:code-review`** in the main session (it runs its own Standards and Spec
   sub-agents). The spec is the approved plan from step 2 plus `parity.md`.
2. Delegate to the **`reviewer`** agent. It starts without this session's context, re-runs the commands,
   and checks the diff against `CLAUDE.md`, `decisions.md` and the security flags.

Fix blocking findings, then re-run step 4's commands. A finding you do not fix gets a one-line reason.

## 6. Record

- Update the endpoint's row in `docs/ai-workflow/parity.md`, including every difference.
- Add any new decision to `docs/ai-workflow/decisions.md`.
- Update `docs/ai-workflow/api-inventory.md` and `CLAUDE.md` only where behavior or commands changed.

## 7. PR

Use whichever GitHub tool the session actually has. If none works, push the branch and say so; never
claim a PR exists unless it was created. The PR description includes the plan, the reviewer's report, the
code-review summary and the real command output from step 4.
