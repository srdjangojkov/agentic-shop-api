# Parity ledger

One row per endpoint migrated to NestJS. "Express test" and "NestJS test" name the files that pin the
behavior; "Differences" lists every known difference, accepted or not. Security flags refer to
`decisions.md`.

| Endpoint | Express test | NestJS test | Status | Differences | Flags |
| --- | --- | --- | --- | --- | --- |
| `GET /categories` | `test/categories.list.test.ts` | — | Characterized in Express; not migrated | — | None |
