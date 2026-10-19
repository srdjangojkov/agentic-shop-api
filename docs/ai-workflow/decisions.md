# Decisions

One line per decision: what, why, date. Newest last. "Open" items must be decided by the owner (Srdjan)
before any change relies on them.

## Decided

| Date | Decision | Why |
| --- | --- | --- |
| 2026-10-19 | The project is a Claude Code workflow showcase; the Express → NestJS migration is its worked example. | Keeps scope on the workflow, not a full rewrite. |
| 2026-10-19 | NestJS runs as a separate app in `nest/` with its own dependencies, scripts, tests and port (3003). Express stays on 3002. | Both apps stay independently runnable; nothing in Express is replaced. |
| 2026-10-19 | Express behavior is the migration reference, but not an accepted contract. Quirks are recorded in `parity.md`; any contract change is named explicitly. | Prevents silently copying bugs or silently changing behavior. |
| 2026-10-19 | Tests run only against an isolated, throwaway MongoDB with deterministic fixtures. Never against Atlas or any shared data. | Protects real data. |
| 2026-10-19 | No MongoDB MCP server; database behavior is verified through tests. | Tests are reproducible and isolated. |
| 2026-10-19 | No new dependency, network-policy change or machine-wide setting without the owner's approval. | Keeps the setup minimal and reviewable. |
| 2026-10-19 | Workflow v1 is minimal: one `feature-workflow` skill, Matt Pocock's `tdd` and `code-review` skills, one read-only `reviewer` agent, the built-in Explore agent, one `protect-env` hook. | Add pieces only when a real need appears. |
| 2026-10-19 | NestJS 11 (CommonJS), not 12. NestJS 12 packages are ESM-only, and Jest cannot load them from CommonJS tests on Node below 24.9 (verified: `Must use import to load ES Module`). | Keeps Jest + ts-jest working with the same CommonJS setup as the Express app. |
| 2026-10-19 | The NestJS app copies the schemas it needs instead of importing from `src/`. | Keeps the apps independent. |
| 2026-10-19 | `GET /categories` in NestJS keeps the Express error response (`400 { errors: "ERROR_GET_CATEGORIES" }`) for the demo. Recorded in `parity.md`. | Parity first; changing it is a separate decision. |
| 2026-10-19 | NestJS `POST`, `PUT`, `DELETE /categories` require a valid access token (S3, owner's choice in the project thread). `JwtAuthGuard` mirrors `checkJWT`: last segment of `Authorization`, `401 { msg: "INVALID_SESSION" }` on any failure. Express is unchanged and stays public. | Owner chose "Require JWT" over keeping parity. |
| 2026-10-19 | S6 defaults for that guard: `SECRET_JWT` is required at NestJS startup (no hard-coded fallback), HS256 pinned. Tokens issued by Express with the same `SECRET_JWT` verify (checked side by side). The email-as-`id` claim is not used by the guard. | Owner chose "Require JWT", which forces these; no fallback secret is the safe default. |
| 2026-10-19 | The guard does not distinguish access from refresh tokens (neither does `checkJWT`); this is safe only while `SECRET_REFRESH_JWT` differs from `SECRET_JWT`. Not hardened further. | Reviewer note; a token-type claim would need a change to Express token issuing (S6). |
| 2026-10-19 | `jsonwebtoken` ^9 (+ `@types/jsonwebtoken`) added to `nest/`. | Owner-approved; same library and major as the Express app. |
| 2026-10-19 | Any valid token may write categories; no role check. | A1 is still open; roles are not invented. |
| 2026-10-19 | Category endpoints in NestJS keep the Express error contract: validation failures `400 { errors: [ { type, value, msg, path, location } ] }`, other failures `400 { errors: "ERROR_<ACTION>_CATEGORY" }`, not-found as 400. No `class-validator` dependency: `CategoriesValidation` mirrors the chains. | Parity first; no new dependency needed. |
| 2026-10-19 | Stop-hook verification gate `verify-gate` added (owner request), replacing the earlier "no Stop gate yet" choice. It uses only the existing `typecheck`/`test` scripts; missing scripts or `node_modules` are reported, not blocked on; at most 3 consecutive blocks. | Owner asked for an automated gate; limits keep it from trapping a session. |
| 2026-10-19 | Plan step of `feature-workflow` expanded: reads the project docs first, uses `mattpocock-skills:codebase-design` for module/seam changes and `mattpocock-skills:grill-with-docs` for ambiguous behavior, and follows a fixed plan template. | Owner request after the `GET /categories` demo. |

## Open (owner decides)

Security-sensitive behavior observed in Express. None of it may be carried into NestJS without a decision
recorded here. Details: `api-inventory.md` section 9.

| ID | Behavior | Where | Status |
| --- | --- | --- | --- |
| S1 | Password hash returned in responses | `POST /users`, `PUT /users/:id`, `DELETE /users/:id`, `GET /search/users/:term` | Open |
| S2 | Password stored unhashed on update | `PUT /users/:id` | Open |
| S3 | No authentication on any write endpoint | All POST/PUT/DELETE routes | Decided for NestJS category writes (require JWT, above); open for everything else. Express unchanged. |
| S4 | Anyone can create an admin (`role: 2`) | `POST /users` | Open |
| S5 | Refresh token written to logs | `POST /auth/refresh` | Open |
| S6 | Email used as the JWT `id` claim; hard-coded fallback JWT secrets | `services/auth.ts`, `utils/jwt.handle.ts` | Open. NestJS guard: no fallback, HS256 pinned (above). Email claim untouched. |
| S7 | Unescaped user input in a regex | `GET /search/:collection/:term` | Open |
| S8 | Mass assignment and operator injection: `PUT` passes the raw body to `findByIdAndUpdate` (operators such as `$unset` are applied); an object `name` reaches `findOne` as a query operator | `PUT /categories/:id`, `POST /categories` (verified); `services/users.ts` and `services/coupons.ts:26-27` pass the body the same way (read, not executed) | Decided for NestJS categories 2026-10-19 (owner chose "Keep hardening"): `PUT` applies only `name` and `status`, object/array `name` is a 400 validation error. Express unchanged; other resources still open. |
| A1 | Authorization policy: which endpoints need login, which need admin | All | Open |
