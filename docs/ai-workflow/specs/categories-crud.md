# Spec: migrate the remaining `/categories` endpoints to NestJS

Owner request 2026-10-19 (project thread "Categories CRUD"): `GET /categories/:id`, `POST /categories`,
`PUT /categories/:id`, `DELETE /categories/:id`. Same workflow and layout as `get-categories.md`.

**Status:** implemented and verified 2026-10-19 (cloud). S3 decided by the owner: writes require a JWT in NestJS. Results: `parity.md`.

## Current behavior (Express, observed)

Sources: `src/routes/categories.ts:159,191,221,245`, `src/validators/categories.ts:15-33`,
`src/validators/db-validators.ts:32-55`, `src/controllers/categories.ts:15-57`,
`src/services/categories.ts:12-37`, `src/utils/validate.handle.ts:4-12`, `src/utils/error.handle.ts:3-7`.
Every row below was executed against an isolated in-memory MongoDB on 2026-10-19.

Validation failures respond `400 { errors: [ { type: "field", value, msg, path, location } ] }`
(express-validator 7; `value` is omitted when the field is missing). Chains do not bail, so one bad
input can produce several entries. "Not found" is a validation error (400), never 404.

| Endpoint | Case | Express response |
| --- | --- | --- |
| `GET /:id` | exists (active or soft-deleted) | `200` the document; no `status` filter |
| | valid id, not found | `400`, 1 entry: `Category id: <id> doesn't exist` (path `id`, location `params`) |
| | invalid id (`abc`) | `400`, 2 entries: `Invalid value`, then the Mongoose CastError message |
| `POST /` | `{ name }` new | `201` the new document; only `name` is saved (`status` and other fields ignored) |
| | name taken (also by a soft-deleted category) | `400`, 1 entry: `<name> already exists` (path `name`, location `body`) |
| | name missing | `400`, 2 entries `Invalid value` (exists + notEmpty), no `value` |
| | name `""` or `null` | `400`, 1 entry `Invalid value` |
| | name `"  "`, `123`, `true` | `201`, stored as `"  "`, `"123"`, `"true"` |
| | name array | `400 { errors: "ERROR_CREATE_CATEGORY" }` (cast error on create) |
| | name object (`{ "$ne": null }`) | used as a query operator in `findOne`; `400` `[object Object] already exists` when any category exists |
| | name only in the query string | passes the validator (`check()` reads query too), then `400 { errors: "ERROR_CREATE_CATEGORY" }` |
| | duplicate after the validator (race) | `400 { msg: "CATEGORY_ALREADY_EXISTS" }` (service sentinel) |
| `PUT /:id` | exists, new or same name | `200` updated document (`new: true`) |
| | body has `status` | applied: PUT can soft-delete or restore |
| | body without `name` | `200`, other fields applied |
| | name `""` | `200`, name stored as `""` (no validators on update) |
| | name taken by another category | `400`, 1 entry `<name> already exists`, path `id`, location `params`, value = id |
| | valid id, not found | `400`, 1 entry `Category id: <id> doesn't exist` |
| | invalid id | `400`, 3 entries: `Invalid value`, CastError, CastError |
| | body with `$unset` etc. | **applied**: whole body goes to `findByIdAndUpdate` (verified: `$unset: { status: 1 }` removed `status`) |
| `DELETE /:id` | exists | `200` the document with `status: false` (soft delete) |
| | already deleted | `200` again (idempotent) |
| | not found / invalid id | same entries as `GET /:id` |
| all four | DB unreachable | `400`, validator entry whose `msg` is the Mongoose buffering-timeout message |

`handleHttpError` (`400 { errors: "ERROR_<ACTION>_CATEGORY" }`) is reached only when the service fails after
validation passed. Express also `console.log`s raw errors.

## Target behavior (NestJS)

Extend `nest/src/categories/` only: no new module, no new dependency.

- `categories.service.ts`: `getCategory`, `createCategory` (keeps the sentinel), `updateCategory`,
  `deleteCategory` (soft delete), mirroring `src/services/categories.ts`.
- `category.validation.ts`: mirrors the four express-validator chains and builds the same error entries,
  using the same Mongoose queries (`findById`, `findOne`) so messages match. `isMongoId` = 24 hex chars, as in
  validator.js.
- `categories.controller.ts`: `@Get(":id")`, `@Post()` (201), `@Put(":id")`, `@Delete(":id")`. Validation
  errors throw `BadRequestException({ errors: [...] })`; service failures throw
  `BadRequestException({ errors: "ERROR_<ACTION>_CATEGORY" })`.

## Contract changes (1-4 keep status 400)

1. `name` that is an object or array (POST, PUT) is rejected as a validation error
   `{ value, msg: "Invalid value", path: "name", location: "body" }` before any DB query. Express used it as
   a query operator or failed on cast. Why: new flag S8.
2. PUT applies only `name` and `status` from the body. Update operators (`$unset`, `$set`, ...) and other keys
   are dropped. Why: S8. Normal payloads behave the same.
3. POST reads `name` from the body only (Express also accepted it from query, headers and cookies, which then
   failed with `ERROR_CREATE_CATEGORY`). Same status, different body.
4. No `console.log` of raw errors (same as `GET /categories`).
5. POST, PUT and DELETE require a JWT (S3, owner decision).

Kept on purpose (quirks, recorded in `parity.md`): 400 instead of 404, duplicated CastError entries,
soft-deleted categories readable and blocking their name, `"  "`/`123` accepted, PUT may set `status` and
`name: ""`, DELETE idempotent, DB errors surfacing as validation entries.

## Security flags

- **S3** (no authentication on writes) applies to POST, PUT, DELETE. Owner decided 2026-10-19: NestJS
  requires a valid access token (`JwtAuthGuard`, mirrors `checkJWT`, `401 { msg: "INVALID_SESSION" }`).
  S6 defaults: `SECRET_JWT` required, no fallback, HS256 pinned. `jsonwebtoken` ^9 added (owner-approved).
- **A1** stays open. `GET /:id` stays public like `GET /categories`; any valid token may write.
- **S8 (new):** mass assignment and operator injection on categories (raw PUT body to `findByIdAndUpdate`,
  object `name` in `findOne`). Not copied (changes 1 and 2).

## Test strategy (seam: HTTP)

- Express: `test/categories.{get,create,update,delete}.test.ts` pin the table above (success, not found, invalid id, invalid and
  duplicate `name`, soft-delete, DB unreachable). Passes against unchanged Express.
- NestJS: `nest/test/categories.{get,create,update,delete}.test.ts`, same cases; differs only where a contract
  change is listed. `nest/test/categories.auth.test.ts` covers the guard.
  Written before the code; must fail first (404 from Nest's router).
- Isolated DBs only: `test/helpers/test-db.ts`, `nest/test/test-db.ts`. Fixtures are inserted per test; no
  assertions on generated ids or timestamps beyond format.

## Verification and review

`npx tsc --noEmit`, `npm test`, `cd nest && npx tsc --noEmit && npm test`,
`node .claude/hooks/protect-env.test.js`; both apps side by side (3002, 3003) on one isolated local MongoDB
with the same requests compared. Reviews: `reviewer` agent and a code-review pass.

## Documentation

`parity.md` rows per endpoint, `decisions.md` (S8, contract changes, S3 outcome), `api-inventory.md`
Categories section and the validation shape (now verified), `CLAUDE.md` verification table.
