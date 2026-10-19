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

Write a short plan for the user:

- The behavior to keep, as observed in Express (status codes, response shape, error shape).
- Any contract change, named explicitly. None is made silently.
- Any security flag from `decisions.md` (S1–S7, A1) the change touches. If one is touched, stop: the user
  decides first. Never copy flagged behavior into NestJS by default.
- The test seam (normally the HTTP endpoint) and the test files.

Wait for the user's approval before writing code.

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
