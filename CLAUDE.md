# CLAUDE.md

Persistent context for Claude Code sessions in this repository. Detailed endpoint, model and
architecture notes live in [`docs/ai-workflow/api-inventory.md`](docs/ai-workflow/api-inventory.md);
read it before planning any migration or behavior change.

## Project

REST API for a small shop (users, categories, products with images, coupons, search).
The Express app is the root package (port 3002). The NestJS migration target is a separate package in
`nest/` (port 3003) with its own dependencies, scripts and tests. No frontend.

Stack (versions from `package-lock.json`):

- Node.js + TypeScript 5.8 (`strict: true`, `module: commonjs`, `target: es2016`)
- Express 4.18, `cors`, `cookie-parser`, `express-fileupload`
- MongoDB via Mongoose 7.3
- `express-validator` 7 for request validation
- `jsonwebtoken` 9 (access + refresh tokens), `bcryptjs` for password hashing
- Cloudinary SDK 1.x for product image storage
- `swagger-jsdoc` + `swagger-ui-express` (OpenAPI 3.0 generated from JSDoc comments)

## Architecture

Layered Express app, one file per resource in each layer:

```
src/app.ts         entry point: DB connect, listen, Swagger (calls createApp)
src/create-app.ts  createApp(): middleware, router mounting, GET / (no DB, no listen; used by tests)
test/              Jest + Supertest tests against an isolated in-memory MongoDB
nest/              separate NestJS app (migration target, port 3003); see nest/CLAUDE.md
src/routes/        Express Routers + @swagger JSDoc blocks
src/validators/    express-validator chains per route; db-validators.ts = DB-backed checks
src/controllers/   (req, res) handlers: call service, map result to HTTP status/JSON
src/services/      Mongoose queries and business rules (default-exported object)
src/models/        Mongoose schemas/models (Category, Coupon, Product, User)
src/interfaces/    TypeScript interfaces/enums used by models and services
src/middleware/    session.ts: checkJWT bearer-token middleware (currently unused, see below)
src/utils/         jwt, bcrypt, cloudinary, swagger, error and validation helpers
src/config/        mongo.ts: mongoose.connect(DB_URI)
public/            static files served by express.static
```

Request flow: `router -> validator chain -> validateResult -> controller -> service -> model`.
`search` is the exception: its controller queries models directly (`src/services/search.ts` is empty).

## Conventions observed in the code

- Controllers are named exports; services `export default { fn1, fn2 }`; routers `export default router`.
- Services signal business failures by returning sentinel strings (`"CATEGORY_ALREADY_EXISTS"`,
  `"USER_NOT_FOUND"`); controllers compare against them and return 400.
- Controller errors go through `handleHttpError(res, "ERROR_<ACTION>_<RESOURCE>", error)`,
  which always responds `400 { errors: "<CODE>" }`.
- Validators are arrays ending in a local `method` wrapper that calls `validateResult`.
- Deletes are soft: `status` set to `false`; list endpoints filter `status: true`.
- Models use `{ timestamps: true, versionKey: false }`.
- Formatting is inconsistent (mostly double quotes + 2 spaces; `controllers/auth.ts` and
  `utils/jwt.handle.ts` use single quotes + tabs). No linter or formatter is configured; match the file you edit.

## Commands

Only these exist in `package.json`. `node_modules` is not committed; `npm install` is required first.

| Command | Status |
| --- | --- |
| `npm install` | Installs dependencies. |
| `npm run dev` | Runs `nodemon ./src/app.ts` (via `ts-node`). Verified 2026-10-19: server starts, `GET /` and `/docs` return 200. Needs a reachable MongoDB: without one, data routes return 400 after 10 s and the process crashes once the connect attempt fails. |
| `npm test` | Runs Jest (`test/`) against a throwaway MongoDB from `mongodb-memory-server-core`; never uses `DB_URI`. First run downloads a MongoDB binary; set `MONGOMS_SYSTEM_BINARY=/path/to/mongod` to use an existing one. Verified 2026-10-19 in the cloud environment (2/2 pass). |
| `npx tsc --noEmit` | Not a script, but `typescript` is a devDependency. Passes (verified 2026-10-19). Use it as the type-check. |
| `cd nest && npm ci && npm run typecheck && npm test` | NestJS app checks; see `nest/CLAUDE.md`. Root `tsc` excludes `nest/`. |

There is no build, start, lint, or format script. Copy `.env.example` to `.env` for local setup. Environment variables read by
the code: `PORT`, `DB_URI`, `SECRET_JWT`, `SECRET_REFRESH_JWT`, `CLOUDINARY_NAME`, `CLOUDINARY_KEY`,
`CLOUDINARY_SECRET` (`.env` is gitignored). Never print their values.

## Verification status (2026-10-19)

| Check | Result | Verified by |
| --- | --- | --- |
| `npx tsc --noEmit` | Passes | Claude, cloud environment |
| `npm run dev` startup, `GET /`, `GET /docs` | Server starts; both return 200 | Claude, cloud environment (no DB) |
| MongoDB Atlas connection | Connects | Owner, local machine |
| App responds at `http://localhost:3002` | Responds | Owner, local machine |
| `GET /categories` | Characterized by `test/categories.list.test.ts` (3 tests pass) | Claude, cloud environment, isolated DB |
| NestJS `GET /categories` on 3003 | `nest/test/categories.list.test.ts` (3 tests pass); same body as Express side by side, see `parity.md` | Claude, cloud environment, isolated DB |
| Express on port 3002 against an isolated local MongoDB: `GET /`, `/docs`, `/categories` | All 200 | Claude, cloud environment |
| All other endpoints and features (CRUD, auth, uploads, search, Cloudinary) | **Not verified** | No tests yet |

A response at `http://localhost:3002` only shows the server is up and connected. It does not confirm that any
endpoint behaves correctly; treat endpoint behavior as unverified until tests cover it.

## Known issues (document, do not silently fix)

- **No authentication on any write route.** The `checkJWT` versions of category/user POST/PUT/DELETE are
  commented out; products and coupons never had it. Swagger still marks some as `bearerAuth`.
- Tests cover only `GET /categories` (both apps). No CI, no lint, no build output config (`tsconfig.json` has no `outDir`/`include`).
- Async handlers are not wrapped; errors thrown outside `try` (e.g. `createUser`, `createProduct`
  without a file, all `search` branches) are unhandled rejections in Express 4. No global error/404 handler.
- Port defaults to `30001` in `app.ts` when `PORT` is unset; README and `.env.example` use 3002.
- No DB connection error handling: `db()` has no `.catch`, so a failed connect crashes the process (unhandled rejection) after the server has started.
- Atlas `mongodb+srv` URIs can fail where local DNS refuses SRV lookups. Resolved for the owner's local setup by using
  the non-SRV form shown in `.env.example`; not a code issue.
- JWT payload `id` holds the user's **email**, not `_id`. `jwt.handle.ts` has hard-coded fallback secrets.
- Swagger is incomplete/inaccurate in places (coupons and search undocumented, product PUT missing its path).

Full list with file references: inventory doc, section "Known issues".

## Workflow

- Non-trivial changes and migration slices go through the `feature-workflow` skill
  (`.claude/skills/feature-workflow/SKILL.md`): explore, plan and wait for approval, test first, implement,
  review, record, PR.
- It uses Matt Pocock's `mattpocock-skills:tdd` and `mattpocock-skills:code-review` skills (plugin
  `mattpocock-skills@mattpocock`) and the read-only `reviewer` agent (`.claude/agents/reviewer.md`).
- Decisions and open questions: `docs/ai-workflow/decisions.md`. Migrated endpoints and their differences:
  `docs/ai-workflow/parity.md`.
- **Security flags S1–S7 and the authorization policy (A1) are open.** Never carry that behavior into
  NestJS without a decision recorded in `decisions.md`.
- Hook `protect-env` (`.claude/settings.json`) blocks Claude's file tools and Bash commands that name
  `.env` files. It reduces accidental exposure; it is not a guarantee. Test: `node .claude/hooks/protect-env.test.js`.

## Long-term goal: Express -> NestJS

The repository will be migrated incrementally to NestJS, in the separate app in `nest/` (NestJS 11).

Migration principles:

1. **Preserve existing API behavior** (paths, methods, status codes, response shapes, cookie names)
   unless a change is explicitly requested. Quirks are behavior too; record them before changing them.
2. **Migrate incrementally**, one resource or concern at a time, keeping the app runnable between steps.
3. **Avoid unnecessary rewrites.** Reuse models, schemas and business logic where they fit.
4. Establish a safety net (characterization tests, a passing type-check) before moving behavior.
5. Keep bug fixes and migration in separate changes so behavior diffs stay reviewable.

## AI collaboration rules

- Inspect the relevant files before modifying them; do not assume structure or behavior.
- For non-trivial changes, propose a short plan and wait for agreement before implementing.
- Keep changes scoped to the request; no drive-by refactors, renames or formatting of unrelated code.
- Verify claims against the code, and label anything inferred or unverified as such.
- Report actual command and test output. Never claim the app runs, the DB connects, or tests pass
  unless that was executed in the session.
- Do not print secrets or `.env` values. Do not install dependencies or run destructive commands without asking.
- When behavior or docs change, update `docs/ai-workflow/api-inventory.md` in the same change.
