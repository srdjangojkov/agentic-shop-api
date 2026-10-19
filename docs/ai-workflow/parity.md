# Parity ledger

One row per endpoint migrated to NestJS. "Express test" and "NestJS test" name the files that pin the
behavior; "Differences" lists every known difference, accepted or not. Security flags refer to
`decisions.md`.

| Endpoint | Express test | NestJS test | Status | Differences | Flags |
| --- | --- | --- | --- | --- | --- |
| `GET /categories` | `test/categories.list.test.ts` | `nest/test/categories.list.test.ts` | Migrated; parity verified 2026-10-19 (cloud, then by the owner locally) | Body identical. Error response identical (`400 { errors: "ERROR_GET_CATEGORIES" }`); Express also `console.log`s the raw error, NestJS does not. Headers differ only app-wide (below). | None (A1 open: endpoint stays public) |

How `GET /categories` parity was checked: both test files assert the same three cases (empty list,
active-only with exact fields, query failure). Both apps were then run side by side (3002 and 3003) against
one isolated local MongoDB seeded with three fixed categories; the `GET /categories` bodies, sorted by name,
were byte-identical. A mutation check (dropping the `status: true` filter) failed the active-only test in
each app.

## App-wide differences (NestJS vs Express)

Observed 2026-10-19 with both apps running side by side against the same isolated local MongoDB.

| Area | Express (3002) | NestJS (3003) | Status |
| --- | --- | --- | --- |
| HTTP layer | Express 4.18 | NestJS 11 on Express 5 | Accepted (separate app) |
| Unknown route | Express default 404 HTML page (`Cannot GET /…`) | `404` JSON `{ message, error, statusCode }` | Not decided; only matters once clients move |
| `X-Powered-By` header | Disabled | Sent (`Express`) | Not decided |
| CORS | `cors()` allows all origins | Not enabled | Not decided |
