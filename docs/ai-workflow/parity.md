# Parity ledger

One row per endpoint migrated to NestJS. "Express test" and "NestJS test" name the files that pin the
behavior; "Differences" lists every known difference, accepted or not. Security flags refer to
`decisions.md`.

| Endpoint | Express test | NestJS test | Status | Differences | Flags |
| --- | --- | --- | --- | --- | --- |
| `GET /categories` | `test/categories.list.test.ts` | `nest/test/categories.list.test.ts` | Migrated; parity verified 2026-10-19 (cloud, then by the owner locally) | Body identical. Error response identical (`400 { errors: "ERROR_GET_CATEGORIES" }`); Express also `console.log`s the raw error, NestJS does not. Headers differ only app-wide (below). | None (A1 open: endpoint stays public) |
| `GET /categories/:id` | `test/categories.get.test.ts` | `nest/test/categories.get.test.ts` | Migrated; parity verified 2026-10-19 (cloud) | Only field locations (below). Otherwise identical: soft-deleted categories readable, not-found and invalid id are `400` validation entries (2 for an invalid id). | None (A1 open: stays public) |
| `POST /categories` | `test/categories.create.test.ts` | `nest/test/categories.create.test.ts`, `nest/test/categories.auth.test.ts` | Migrated 2026-10-19 (cloud) | **Auth:** NestJS requires a JWT (`401 { msg: "INVALID_SESSION" }`), Express is public (S3). **S8:** object/array `name` is `400 [Invalid value on name]` in NestJS; Express uses it as a query operator (`400 "[object Object] already exists"`) or fails the create (`ERROR_CREATE_CATEGORY`). `name` only in the query string: NestJS `400` 2 × `Invalid value`, Express `400 ERROR_CREATE_CATEGORY`. Field locations differ (below). Everything else identical (201 body, duplicate/missing/empty/`null`, `123` stored as `"123"`). The `CATEGORY_ALREADY_EXISTS` sentinel (race only) is mirrored but untested. | S3 decided, S8 |
| `PUT /categories/:id` | `test/categories.update.test.ts` | `nest/test/categories.update.test.ts`, `nest/test/categories.auth.test.ts` | Migrated 2026-10-19 (cloud) | **Auth:** as POST. **S8:** NestJS applies only `name` and `status`; Express applies the whole body including `$unset`/`$set`. Object/array `name`: NestJS `400 [Invalid value on name]`, Express `400 [CastError on id]`. Kept: `status` changeable (soft-delete/restore via PUT), `name: ""` stored, duplicate reported on `id`, 3 entries for an invalid id. | S3 decided, S8 |
| `DELETE /categories/:id` | `test/categories.delete.test.ts` | `nest/test/categories.delete.test.ts`, `nest/test/categories.auth.test.ts` | Migrated 2026-10-19 (cloud) | **Auth:** as POST. Field locations differ (below). Otherwise identical: soft delete, `200` again on an already deleted category. | S3 decided |

How `GET /categories` parity was checked: both test files assert the same three cases (empty list,
active-only with exact fields, query failure). Both apps were then run side by side (3002 and 3003) against
one isolated local MongoDB seeded with three fixed categories; the `GET /categories` bodies, sorted by name,
were byte-identical. A mutation check (dropping the `status: true` filter) failed the active-only test in
each app.

How the remaining category endpoints were checked (2026-10-19, cloud): each pair of test files asserts the
same cases; the NestJS tests failed first with `404` (route missing) and the auth tests failed 19/24 with
the guard removed. Both apps then ran side by side (3002, 3003) on one local MongoDB (separate databases)
and received the same 17-request sequence (create, duplicate, missing name, number name, get, get missing,
get invalid, rename, rename to taken, PUT status, PUT invalid id, delete, delete again, delete missing, get
deleted, list); after replacing generated ids and timestamps, all 17 status codes and bodies were
identical (NestJS calls carried a token). NestJS `POST` without a token returned `401 {"msg":"INVALID_SESSION"}`,
and an access token issued by Express `POST /auth/login` (same `SECRET_JWT`) was accepted by NestJS.
A mutation check (dropping the HS256 pin) failed the HS512 cases. Not yet checked by the owner locally.

Field locations: Express `check("id")` / `check("name")` validate the field wherever it appears (params, body,
query, cookies, headers). NestJS reads `id` from the route and `name` from the body only. So an extra
`id` in the body or query (e.g. `PUT /categories/<valid>?id=bad`) adds entries and a `400` in Express but is
ignored in NestJS, and a `name` header or cookie on `POST` behaves like the query-string case above. Not
mirrored on purpose. Pinned by the "Express only" / "NestJS differs" cases in the create and delete tests
(Express: `?name=` next to a valid body name is `400` on `location: "query"`; a body `id: "abc"` on DELETE is
`400` and nothing is deleted. NestJS: `201` and `200`).

Race only (validation passed, then the document vanished): Express responds `200` with body `null`, NestJS
`200` with an empty body. Not tested.

Not covered by tests: the `ERROR_*_CATEGORY` handler branches after validation passed (reachable only on
a race or a DB failure between the validator and the write), and the `CATEGORY_ALREADY_EXISTS` sentinel.
A DB outage is covered; in both apps it surfaces as validation entries carrying the Mongoose message, whose
text depends on the connection state.

## App-wide differences (NestJS vs Express)

Observed 2026-10-19 with both apps running side by side against the same isolated local MongoDB.

| Area | Express (3002) | NestJS (3003) | Status |
| --- | --- | --- | --- |
| HTTP layer | Express 4.18 | NestJS 11 on Express 5 | Accepted (separate app) |
| Unknown route | Express default 404 HTML page (`Cannot GET /…`) | `404` JSON `{ message, error, statusCode }` | Not decided; only matters once clients move |
| `X-Powered-By` header | Disabled | Sent (`Express`) | Not decided |
| CORS | `cors()` allows all origins | Not enabled | Not decided |
