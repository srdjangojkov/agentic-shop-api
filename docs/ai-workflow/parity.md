# Parity ledger

One row per endpoint migrated to NestJS. "Express test" and "NestJS test" name the files that pin the
behavior; "Differences" lists every known difference, accepted or not. Security flags refer to
`decisions.md`.

| Endpoint | Express test | NestJS test | Status | Differences | Flags |
| --- | --- | --- | --- | --- | --- |
| `GET /categories` | `test/categories.list.test.ts` | — | Characterized in Express; not migrated | — | None |

## App-wide differences (NestJS vs Express)

Observed 2026-10-19 with both apps running side by side against the same isolated local MongoDB.

| Area | Express (3002) | NestJS (3003) | Status |
| --- | --- | --- | --- |
| HTTP layer | Express 4.18 | NestJS 11 on Express 5 | Accepted (separate app) |
| Unknown route | Express default 404 HTML page | `404` JSON `{ message, error, statusCode }` | Not decided; only matters once clients move |
| `X-Powered-By` header | Disabled | Sent (`Express`) | Not decided |
| CORS | `cors()` allows all origins | Not enabled | Not decided |
