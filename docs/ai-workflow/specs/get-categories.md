# Spec: migrate `GET /categories` to NestJS

Workflow demo slice, approved by the owner on 2026-10-19 (workflow Revision 2, PR 4). Only this endpoint
is migrated. Express behavior comes from `src/routes/categories.ts:133`, `src/controllers/categories.ts:6-13`,
`src/services/categories.ts:4-10` and `src/models/category.ts`.

**Status:** implemented and verified 2026-10-19. Tests and parity results: `parity.md`.

## Behavior to keep (observed in Express)

1. `GET /categories` returns `200` with a JSON array.
2. Only categories with `status: true` are returned; an empty collection returns `[]`.
3. Each item has exactly `_id`, `name`, `status`, `createdAt`, `updatedAt` (no `__v`). `_id` is a 24-hex
   string, dates are ISO strings.
4. No ordering is guaranteed (natural order, no sort). Tests compare names sorted.
5. If the query fails, the response is `400 { "errors": "ERROR_GET_CATEGORIES" }` (decision in
   `decisions.md`).

## NestJS implementation

- `nest/src/categories/`: `category.schema.ts` (copied fields and options: `name` required + unique,
  `status` Boolean required default `true`, `timestamps: true`, `versionKey: false`, collection
  `categories`), `categories.service.ts`, `categories.controller.ts`, `categories.module.ts`.
- `CategoriesModule` imported by `AppModule.forRoot`.

## Out of scope / not copied

- POST, PUT, DELETE `/categories` and every other endpoint.
- Express logs the raw error with `console.log`; not copied.
- App-wide header differences (`X-Powered-By`, CORS `*`) stay as recorded in `parity.md`; open CORS is not
  copied without a decision.
- Security flags: none of S1–S7 apply to this read endpoint. A1 (whether GET needs auth) stays open; the
  endpoint stays public as in Express.

## Tests (seam: HTTP `GET /categories`)

- Express: `test/categories.list.test.ts` (existing two cases) plus the error case.
- NestJS: `nest/test/categories.list.test.ts` with the same three expectations, written before the code.
