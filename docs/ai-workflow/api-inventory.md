# API and architecture inventory

Snapshot of the existing Express implementation, written to support planning the NestJS migration.
Project-wide context and working rules are in [`CLAUDE.md`](../../CLAUDE.md).

**Basis:** static reading of every file under `src/`, plus `package.json`, `package-lock.json`,
`tsconfig.json`, `README.md` and `.gitignore` at commit `093b7cb` ("first commit").
The app was not started and `tsc` was not run while writing the first version.
**Update 2026-10-19 (after commit `2120abe`):** `npx tsc --noEmit` passes, and `npm run dev` starts the
server (`GET /` and `GET /docs/` return 200) with an unreachable DB. No database was connected from the
cloud environment. **Owner-verified on a local machine:** the app connects to MongoDB Atlas and responds at
`http://localhost:3002`. That confirms startup and connectivity only; the endpoint behavior described below
is still read from code and has not been exercised (there are no tests). Labels used below:

- **Confirmed**: read directly in the code (file and line given where useful).
- **Inferred**: follows from the code and library semantics, but was not executed.
- **Unknown**: cannot be established from the repository.

Unlabeled statements are confirmed.

---

## 1. Directory and runtime overview

| Path | Responsibility |
| --- | --- |
| `src/app.ts` | Entry point. Loads `dotenv/config`, builds the Express app, registers middleware and routers, calls `db()`, `app.listen`, then `swaggerDocs(app)` inside the listen callback. |
| `src/config/mongo.ts` | `dbConnect()` → `mongoose.connect(process.env.DB_URI)`. |
| `src/routes/*.ts` | One `Router` per resource; holds the `@swagger` JSDoc blocks. |
| `src/validators/*.ts` | express-validator chains per route; `db-validators.ts` has DB-backed existence/uniqueness checks. |
| `src/controllers/*.ts` | HTTP handlers. Map service results to status codes. |
| `src/services/*.ts` | Mongoose data access and business rules. `services/search.ts` is an empty file. |
| `src/models/*.ts` | Mongoose models: `Category`, `Coupon`, `Product`, `User`. |
| `src/interfaces/*.ts` | TS interfaces (`Auth`, `LoginResponse`, `Category`, `Coupon`, `Product`, `User`, `Address`) and enums (`UserType`, `boardType`). |
| `src/middleware/session.ts` | `checkJWT` bearer-token middleware. Not used by any active route. |
| `src/utils/` | `jwt.handle.ts`, `bcrypt.handle.ts`, `cloudinary.handle.ts`, `swagger.ts`, `error.handle.ts`, `validate.handle.ts`. |
| `public/images/swagger-img.jpg` | Screenshot used by README; served statically. |

### Global middleware (`src/app.ts`, in order)

1. `app.disable("x-powered-by")`
2. `cors()` with defaults (all origins). A stricter origin allow-list is commented out (lines 21–31).
3. `express.json()`
4. `express.static("public")` (path relative to the process working directory)
5. `cookieParser()` (no secret, so unsigned cookies only)
6. `fileUpload({ useTempFiles: true, tempFileDir: "/tmp/", createParentPath: true })`. No size limit, no
   `abortOnLimit`, no file type filtering.

### Router mounting

| Prefix | Router |
| --- | --- |
| `/search/` | `routes/search.ts` |
| `/categories` | `routes/categories.ts` |
| `/products` | `routes/products.ts` |
| `/users` | `routes/users.ts` |
| `/auth` | `routes/auth.ts` |
| `/coupons` | `routes/coupons.ts` |
| `GET /` | inline handler, responds with the text `Backend radi!` |
| `/docs` | Swagger UI, registered after the server starts listening |

### Startup behavior

- `PORT = process.env.PORT || 30001` (`app.ts:16`). README and a comment in `controllers/search.ts`
  mention port 3002. **Unknown:** what `PORT` is set to in real environments.
- `db().then(...)` has no `.catch`; `app.listen` runs regardless of DB connection. Verified: a failed
  connection is an unhandled rejection that terminates the process (Node 22 default).
- No global error-handling middleware and no 404 handler. Unmatched routes get Express's default 404.

### Environment variables (names only)

`PORT`, `DB_URI`, `SECRET_JWT`, `SECRET_REFRESH_JWT`, `CLOUDINARY_NAME`, `CLOUDINARY_KEY`,
`CLOUDINARY_SECRET`. `.env` is gitignored; `.env.example` lists them with empty or local placeholder values. `jwt.handle.ts` falls back to
hard-coded secret strings when the JWT variables are unset.

---

## 2. Cross-cutting patterns

### Validation

- Each route validator is an array of `check(...)` chains followed by a local `method` that calls
  `validateResult` (`utils/validate.handle.ts`).
- `validateResult` calls `validationResult(req).throw()` and on failure responds `400` with the thrown
  object as JSON. **Verified 2026-10-19 (category tests):** the body is
  `{ errors: [ { type: "field", value, msg, path, location } ] }` (`value` omitted when the field is
  missing), not the `{ errors: "<CODE>" }` shape used by `handleHttpError`. Chains do not bail, so one
  input can produce several entries, and a DB error inside a custom validator becomes an entry whose `msg`
  is the raw Mongoose message.
- `check()` (not `param()`/`body()`) is used everywhere, so a field like `id` is looked up in body,
  cookies, headers, params and query.
- Existence checks (`*IdExists`) hit the DB inside validators; "not found" therefore surfaces as a
  **400 validation error**, never 404.
- `check("id", "name")` in category/coupon/user update validators: in express-validator the second
  argument is the error **message**, not a second field. The custom validator receives `id` and reads
  `req.body.name` / `req.body.email` itself, so it works, but the error message would be `"name"`/`"email"`.

### Error handling

- `handleHttpError(res, code, raw)` logs `raw` with `console.log` and always responds
  `400 { errors: code }`, including for server-side failures.
- Business-rule failures are sentinel strings returned by services, mapped to `400 { msg: "<SENTINEL>" }`.
- Async route handlers are not wrapped. Express 4 does not catch rejected promises, so any throw outside a
  controller's `try` produces an unhandled rejection. **Inferred:** the request then never receives a
  response. Affected code is listed per endpoint below.

### Soft delete

All `DELETE` endpoints set `status: false` and return the updated document. List endpoints filter
`status: true`; get-by-id endpoints do **not** filter by status, so soft-deleted records stay readable.

### Response conventions

Controllers return raw Mongoose documents as JSON (no DTO/serialization layer). Models use
`timestamps: true` (`createdAt`, `updatedAt`) and `versionKey: false` (no `__v`).

---

## 3. Authentication and authorization

### Tokens (`utils/jwt.handle.ts`)

| Token | Secret env var | Lifetime | Payload |
| --- | --- | --- | --- |
| Access | `SECRET_JWT` (hard-coded fallback) | `1h` | `{ id }` |
| Refresh | `SECRET_REFRESH_JWT` (hard-coded fallback) | `7d` | `{ id }` |

`services/auth.ts:14-15` passes **`user.email`** as `id`, so the `id` claim is an email address, not a
Mongo `_id`. Default `jsonwebtoken` algorithm is used (no algorithm pinned).

### Login flow (`POST /auth/login`)

1. `authService.loginUser` finds the user by `email` (no `status` check, so soft-deleted users can log in).
2. `bcryptjs.compare` the password. Unknown email and wrong password both map to the same 400 response.
3. On success: sets cookie `refreshToken` (`httpOnly: true`, `secure: true`, `sameSite: "strict"`,
   `maxAge` 7 days, default path) and responds `200 { accessToken }`.

**Inferred:** because the cookie is `secure`, it is only stored/sent over HTTPS (or contexts browsers
treat as secure, such as `localhost` in some browsers).

### Refresh flow (`POST /auth/refresh`)

Reads `req.cookies.refreshToken`, verifies it, issues a new access token from `payload.id`. The refresh
token is not rotated, and the user is not re-checked against the DB. The handler `console.log`s all
request cookies, including the refresh token (`controllers/auth.ts:36`).

### Request authentication (`middleware/session.ts`)

`checkJWT` reads `Authorization`, takes the last space-separated segment, verifies it, stores the payload on
`req.user`, and responds `401 { msg: "INVALID_SESSION" }` on any error (a falsy result would return
`401 { msg: '"INVALID_JWT"' }` with literal quotes).

- It imports `verifyAccessToken as verifyToken` from `jwt.handle.ts`. (Before commit `2120abe` it imported a
  non-existent `verifyToken`, which broke the type-check.)
- `checkJWT` is attached to **no active route**. Protected variants exist only as comments in
  `routes/categories.ts:160-162` and `routes/users.ts:164-166`.

### Authorization

No role checks exist. `User.role` is a number enum `1 | 2` (`UserType.USER = 1`, `UserType.ADMIN = 2`),
default `1`. `validators/users.ts:1` has `// todo : validate role on each necesary method`.
**Unknown:** which endpoints are intended to be admin-only.

### Other

No logout endpoint, no registration endpoint distinct from `POST /users`, no password reset.

---

## 4. Database models

All models are in `src/models/`. Unique constraints are Mongoose `unique: true` indexes. **Unknown:**
whether those indexes exist in the real database (depends on Mongoose `autoIndex` at first run).

### Category (`Category`)

| Field | Type | Rules |
| --- | --- | --- |
| `name` | String | required, unique |
| `status` | Boolean | required, default `true` |

A `user` reference is commented out. The `Category` interface also declares `user` and `category`, which
the schema does not have.

### Coupon (`Coupon`)

| Field | Type | Rules |
| --- | --- | --- |
| `name` | String | required, unique |
| `discount` | Number | required, **unique** (two coupons cannot share a discount value) |
| `status` | Boolean | required, default `true` |

**Unknown:** whether `discount` is a percentage or an amount. Coupons are not referenced by any other
model or endpoint (no order/cart exists).

### Product (`Product`)

| Field | Type | Rules |
| --- | --- | --- |
| `name` | String | required, unique |
| `description` | String | required |
| `price` | Number | required |
| `img.public_id` | String | required (Cloudinary public id) |
| `img.url` | String | required (Cloudinary `secure_url`) |
| `category` | ObjectId → `Category` | required |
| `status` | Boolean | default `true` |

Commented-out `user` reference and an unused `boardType` enum remain.

### User (`User`)

| Field | Type | Rules |
| --- | --- | --- |
| `firstName`, `lastName` | String | required |
| `email` | String | required, unique |
| `password` | String | required (bcrypt hash, cost 10, when created via `POST /users`) |
| `address.street`, `address.city`, `address.state`, `address.zip` | String | required |
| `address.country` | String | optional |
| `phone` | String | optional |
| `role` | Number | enum `[1, 2]`, required, default `1` |
| `status` | Boolean | default `true` |

`password` is not `select: false`; only some queries exclude it (see Users).

### Relationships

Only `Product.category → Category` exists. It is populated with `name` only in product list/get, and fully
in `search/products/<id>`. No cascade: soft-deleting a category leaves its products active.

---

## 5. Endpoints

Auth column: **None** means no authentication middleware runs. That is the case for every endpoint today.

### Auth (`routes/auth.ts` → `controllers/auth.ts` → `services/auth.ts`)

| Method | Path | Purpose | Auth | Inputs | Responses |
| --- | --- | --- | --- | --- | --- |
| POST | `/auth/login` | Log in | None | JSON `{ email, password }`, no validator | `200 { accessToken }` + `refreshToken` cookie; `400 { msg: "User/Password incorrect" }`; `400 { errors: "ERROR_LOGIN_USER" }` on exception |
| POST | `/auth/refresh` | New access token | Refresh cookie | Cookie `refreshToken` | `200 { accessToken }`; `401 { msg: "Refresh token missing" }`; `403 { msg: "Invalid refresh token" }` |

`loginUser` also destructures an unused `name` from the body. `routes/users.ts` imports `loginUser` but
does not use it.

### Users (`routes/users.ts` → `validators/users.ts` → `controllers/users.ts` → `services/users.ts`)

| Method | Path | Purpose | Auth | Validation | Responses |
| --- | --- | --- | --- | --- | --- |
| GET | `/users` | List active users | None | — | `200 [User]` without `password` |
| GET | `/users/:id` | Get one user | None | `id` is MongoId and exists | `200 User` without `password` (soft-deleted included); `400` validation |
| POST | `/users` | Create user | None | `firstName`, `lastName` non-empty, max 20, custom min-length 2 (message says "min length 8"); `email` is email and unused; `password` non-empty | `200` (not 201) with the created document **including the password hash**; `400 { msg: "EMAIL_ALREADY_EXISTS" }`; `400` validation |
| PUT | `/users/:id` | Update user | None | `id` MongoId and exists; new `email` must be unused | `200` updated document **including password**; `400 { errors: "ERROR_UPDATE_USER" }` |
| DELETE | `/users/:id` | Soft delete | None | `id` MongoId and exists | `200` updated document (includes password); `400 { errors: "ERORR_DELETE_USER" }` (typo is the actual code) |

Notes:

- `createUser` has no `try/catch`. **Inferred:** a Mongoose validation error (for example a missing
  `address.street`) becomes an unhandled rejection and the request hangs.
- `updateUser` passes the body straight to `findByIdAndUpdate`, so `password` is stored **unhashed** if
  sent (`// todo hash password`), and `role`/`status` can be changed by anyone.
- `role` can be set to `2` (admin) on create without authentication.

### Categories (`routes/categories.ts` → `validators/categories.ts` → `controllers/categories.ts` → `services/categories.ts`)

| Method | Path | Purpose | Auth | Validation | Responses |
| --- | --- | --- | --- | --- | --- |
| GET | `/categories` | List active categories | None | — | `200 [Category]` |
| GET | `/categories/:id` | Get one | None | MongoId and exists | `200 Category`; `400` validation (Swagger documents a 404 that the code never returns) |
| POST | `/categories` | Create | None (Swagger says bearer) | `name` present, non-empty, unused | `201 Category`; `400 { msg: "CATEGORY_ALREADY_EXISTS" }`; `400` validation |
| PUT | `/categories/:id` | Update | None | MongoId, exists, new `name` unused | `200 Category`; `400` |
| DELETE | `/categories/:id` | Soft delete | None | MongoId and exists | `200 Category` (status `false`); `400` |

`createCategory` saves only `name`. `updateCategory` passes the whole body to `findByIdAndUpdate`.

**Verified 2026-10-19** by `test/categories.{list,get,create,update,delete}.test.ts` (isolated DB). The
full case table (status codes, every validation entry, quirks) is in
[`specs/categories-crud.md`](specs/categories-crud.md). Highlights:

- Validators use `check()`, so `POST` accepts `name` from the query string; it then fails with
  `400 { errors: "ERROR_CREATE_CATEGORY" }` because the service reads the body.
- `name` `123`/`true`/`"  "` is stored as a string; `""`, `null` and missing are rejected; an array fails the
  create (`ERROR_CREATE_CATEGORY`); an object such as `{ "$ne": null }` is used as a query operator in the
  uniqueness check (**S8**).
- A taken name (also by a soft-deleted category) is a validation error; on `PUT` it is reported on `id`.
- `PUT` applies any body key, including `status` (soft-delete or restore) and MongoDB update operators:
  `{ "$unset": { "status": 1 } }` removed the field (**S8**). `name: ""` is stored.
- `GET /:id` and `DELETE /:id` work on soft-deleted categories; `DELETE` is idempotent (200 again).
- An invalid id gives 2 entries (`Invalid value` + CastError message), 3 on `PUT`.

### Products (`routes/products.ts` → `validators/products.ts` → `controllers/products.ts` → `services/products.ts`)

| Method | Path | Purpose | Auth | Inputs / validation | Responses |
| --- | --- | --- | --- | --- | --- |
| GET | `/products` | List active products | None | — | `200 [Product]`, `category` populated with `name` |
| GET | `/products/:id` | Get one | None | MongoId and exists | `200 Product` (populated); `400` |
| POST | `/products` | Create with image | None (Swagger says bearer) | `multipart/form-data`: `name` (only validated field), `description`, `price`, `category` (ObjectId), file `img` | `201 Product`; `400 { errors: "ERROR_CREATE_PRODUCT" }` |
| PUT | `/products/:id` | Update, optional new image | None | MongoId and exists; JSON or multipart; optional file `img` | `200 Product`; `400 { errors: "ERROR_UPDATE_PRODUCT" }` |
| DELETE | `/products/:id` | Soft delete | None | MongoId and exists | `200 Product`; `400` |

Notes:

- `createProduct` reads `req.files?.img.tempFilePath` **before** its `try`. **Inferred:** a request without
  an `img` file throws a `TypeError` outside the `try`, producing an unhandled rejection. If several files
  are sent as `img`, `req.files.img` is an array and `tempFilePath` is `undefined`. **Unknown:** what the
  Cloudinary SDK does with an `undefined` path.
- The image is uploaded before the DB write. **Inferred:** if the DB write fails (duplicate `name`, missing
  `price`), the Cloudinary asset is orphaned. Replaced images on update and soft-deleted products'
  images are never removed from Cloudinary. Temp files in `/tmp/` are not cleaned up by the code.
- `updateProduct` builds the update with all of `name`, `description`, `price`, `category` even when
  absent from the body. **Unknown (not executed):** whether Mongoose 7 strips those `undefined` keys or
  unsets the fields.
- Swagger `ProductInput.category` shows the example `'Longboard'`, but the schema requires an ObjectId.

### Coupons (`routes/coupons.ts` → `validators/coupons.ts` → `controllers/coupons.ts` → `services/coupons.ts`)

| Method | Path | Purpose | Auth | Validation | Responses |
| --- | --- | --- | --- | --- | --- |
| GET | `/coupons` | List active | None | — | `200 [Coupon]` |
| GET | `/coupons/:id` | Get one | None | MongoId and exists | `200 Coupon`; `400` |
| POST | `/coupons` | Create | None | `name` present, non-empty, unused. `discount` not validated (schema requires it) | `201 Coupon`; `400 { msg: "COUPON_ALREADY_EXISTS" }`; `400 { errors: "ERROR_CREATE_COUPON" }` |
| PUT | `/coupons/:id` | Update | None | MongoId, exists, new `name` unused | `200 Coupon`; `400` |
| DELETE | `/coupons/:id` | Soft delete | None | MongoId and exists | `200 Coupon`; `400` |

Coupons have no Swagger documentation. `createCoupon` and its service `console.log` the request body.

### Search (`routes/search.ts` → `controllers/search.ts`; no service)

`GET /search/:collection/:term`, no auth, no validator. Response shape is `{ results: [...] }`.

| `collection` | Behavior |
| --- | --- |
| `users` | If `term` is a valid ObjectId: `findById` (status not filtered). Else case-insensitive regex on `name` or `email` with `status: true`. `User` has no `name` field, so only `email` can match. **Password hashes are returned** (no `.select("-password")`). |
| `categories` | ObjectId → `findById`; else regex on `name`, `status: true`. |
| `products` | ObjectId → `findById` with full `category` populate; else regex on `name`, `status: true`, not populated. |
| `findProductsByCategoryId` | `term` must be an ObjectId (else `400 { msg: "Not valid Category ID" }`); active products in that category, `category` populated with `name`. |
| `roles` | Admitted, but no `case`: falls to `default` → `500 { msg: "This search doesnt exists" }`. |
| anything else | `400 { msg: "<collection> is not admitted collection" }` |

Notes:

- `term` is passed to `new RegExp` unescaped. **Inferred:** a term like `(` throws, and because the async
  helpers are called without `await`/`catch`, that is an unhandled rejection with no response. User input in
  a regex is also a ReDoS risk.
- `Types.ObjectId.isValid` returns `true` for any 12-character string, so a 12-character text term is
  treated as an id. **Inferred** from Mongoose/bson semantics.
- Search is not documented in Swagger.

### Misc

| Method | Path | Behavior |
| --- | --- | --- |
| GET | `/` | `200` text `Backend radi!` |
| GET | `/docs` | Swagger UI |
| GET | `/<file>` | Static files from `public/` |

---

## 6. File uploads and external services

- **express-fileupload** (global): multipart bodies are parsed into `req.body` (fields) and `req.files`
  (files, written to `/tmp/`). Only the products endpoints use files.
- **Cloudinary** (`utils/cloudinary.handle.ts`): configured from `CLOUDINARY_NAME`, `CLOUDINARY_KEY`,
  `CLOUDINARY_SECRET` at import time, using `require("cloudinary").v2` (untyped). Uploads go to folder
  `products`; `public_id` and `secure_url` are stored on the product. No delete/destroy calls exist.
- **MongoDB**: the only other external dependency. Connection string from `DB_URI`; no options, retry,
  or pool settings.
- No email, payment, queue, cache or third-party auth integrations exist.

---

## 7. Swagger / OpenAPI

- `utils/swagger.ts`: `swagger-jsdoc` with OpenAPI `3.0.0`, title "Shop API Docs", `bearerAuth` HTTP bearer
  security scheme, sources `./src/routes/*.ts` and `./src/models/*.ts` (relative to the working directory;
  the model files contain no `@swagger` blocks). UI served at `/docs`. No JSON spec endpoint.
- Tags: Auth, Categories, Products, Users.
- Component schemas: `Category`, `CategoryNotFound`, `CreateCategoryInput`, `CreateCategoryResponse`,
  `GetCategoryResponse`, `Product`, `ProductInput`, `User`, `UserInput`. Parameters: `categoryId`,
  `productId`, `userId`.

Documented vs. actual, confirmed from the JSDoc text:

| Issue | Location |
| --- | --- |
| Coupons and search have no docs. | `routes/coupons.ts`, `routes/search.ts` |
| Product PUT block has no path key (`put:` directly under `@swagger`). **Unknown:** how swagger-jsdoc merges it; it is not attached to `/products/{productId}`. | `routes/products.ts:153-175` |
| Product DELETE uses `paremeters` (typo), so its path param is not declared. | `routes/products.ts:184` |
| Login documents `{ token, user }`; the code returns `{ accessToken }` only. | `routes/auth.ts:33-43` |
| `UserNotFound` is indented under `components`, not `components.schemas`. | `routes/users.ts:99` |
| `GetCategoryResponse` is `type: string` with `properties` and a `parameters` key inside a schema. | `routes/categories.ts:46-55` |
| Category PUT 400 schema is a bare string instead of `$ref`; DELETE uses `appliation/json`. | `routes/categories.ts:218, 241` |
| `User.role` / `UserInput.role` documented as string (`ADMIN_ROLE`); model uses numbers `1 | 2`. | `routes/users.ts:40, 77` |
| `bearerAuth` is declared on category/product/user POST, but no auth runs. | routes files |
| Category GET documents 404; user POST documents 201 (code returns 200). | routes/controllers |

---

## 8. Tooling and build

- Scripts: `dev` (`nodemon ./src/app.ts`, nodemon is a devDependency since `2120abe`) and `test` (Jest). No `build`, `start`, `lint`, or `format`.
- `tsconfig.json`: `strict`, `commonjs`, `es2016`, `esModuleInterop`, `skipLibCheck`. No `outDir`,
  `rootDir` or `include`, so `tsc` would emit `.js` next to the sources. `experimentalDecorators` and
  `emitDecoratorMetadata` are off (NestJS needs both).
- `@types/mongoose` 5.x is installed alongside Mongoose 7, which ships its own types. **Unknown:** whether it
  causes type conflicts.
- Separate NestJS 11 app in `nest/` (own `package.json`, port 3003); root `tsconfig.json` excludes it.
- Jest + Supertest + `mongodb-memory-server-core` tests in `test/` (only `GET /categories` so far; `nest/test/` mirrors them for the NestJS app). App creation lives in `src/create-app.ts`, separate from DB connect and listen in `src/app.ts`. No CI config, ESLint, Prettier or editorconfig. No Dockerfile or compose file.

---

## 9. Known issues (confirmed unless labeled)

Security-sensitive items are tracked as open decisions in [`decisions.md`](decisions.md): item 2 = S3/A1,
item 3 = S6, item 17 = S8, item 4 = S1, item 5 = S2, item 6 = S5, item 10 = S7; S4 (admin role on `POST /users`) is in section 5, Users. They must not be carried into
NestJS without a recorded decision.

Documented here only; only item 1 has been fixed.

1. ~~`middleware/session.ts` imports non-existent `verifyToken`~~ Fixed in `2120abe`.
2. No authentication or authorization on any write endpoint. (NestJS requires a JWT on category writes,
   decided 2026-10-19; Express is unchanged.)
3. JWT `id` claim contains the email; hard-coded fallback JWT secrets.
4. Password hash leaked by `POST /users`, `PUT /users/:id`, `DELETE /users/:id` and `search/users`.
5. `PUT /users/:id` stores passwords unhashed and allows changing `role`/`status`.
6. Refresh token printed to logs (`controllers/auth.ts:36`); request bodies logged in coupons.
7. Unhandled async errors: `createUser`, `createProduct` without file, all search helpers (hang **inferred**).
8. "Not found" returns 400 from validators; `handleHttpError` returns 400 for server errors.
9. `search/roles` returns 500; `search/users` text search uses non-existent `name` field.
10. Unescaped user regex in search (ReDoS / throw).
11. Cloudinary assets orphaned on failed create, update and delete.
12. Login succeeds for soft-deleted users; get-by-id returns soft-deleted records.
13. Default port `30001` vs. README's 3002 (nodemon added in `2120abe`; `npm test` runs Jest since the test baseline).
14. Swagger inaccuracies listed in section 7.
15. Validator message "min length 8" for a min-length-2 check; error code typo `ERORR_DELETE_USER`.
16. With MongoDB unreachable the server starts, `GET /categories` returns `400 { errors: "ERROR_GET_CATEGORIES" }` after Mongoose's 10 s buffering timeout, and the process then exits on the unhandled `MongooseServerSelectionError` from `db()` (verified 2026-10-19).
17. Category writes accept MongoDB operators and object values from the body (`PUT` mass assignment,
    object `name` as a query operator). Verified 2026-10-19; tracked as S8.

---

## 10. Migration considerations (Express → NestJS)

General:

- Characterization tests against the current Express app (e.g. supertest + an in-memory or test MongoDB)
  should come first, so each migrated module can be compared to the original responses, quirks included.
- NestJS runs as a separate app in `nest/` on port 3003 (decided 2026-10-19, see `decisions.md`).
  All five `/categories` endpoints are migrated; status per endpoint is in `parity.md`.
- `tsconfig` needs `experimentalDecorators` and `emitDecoratorMetadata`, plus an `outDir`.
- Error shapes (`{ errors: CODE }`, `{ msg: ... }`, express-validator objects) and the "400 for everything"
  behavior must be reproduced with exception filters if behavior is preserved.
- Soft-delete and `status: true` list filtering should stay in services/repositories.

Per area:

| Area | Notes for NestJS |
| --- | --- |
| Config | Replace `dotenv/config` imports with `@nestjs/config`; keep the same variable names. |
| Database | `@nestjs/mongoose`; existing schemas port to `@Schema`/`SchemaFactory` or reuse via `MongooseModule.forFeature` with the raw schemas. Keep model names (`Category`, `Coupon`, `Product`, `User`) so collections do not change. |
| Validation | express-validator chains become DTOs + `ValidationPipe` (class-validator) and custom pipes for DB checks. The response body for validation errors will differ unless a custom exception factory reproduces it. |
| Categories, Coupons | Simplest CRUD with DB-backed uniqueness checks; good first modules. |
| Users | Hide `password` (serializer or `select: false`) only if the leak is explicitly approved as a fix; otherwise preserve and flag. |
| Auth | `checkJWT` maps to a guard; the email-as-`id` payload, cookie options and refresh behavior must be kept for existing clients. Which routes become protected is a product decision, not a migration detail. |
| Products | `express-fileupload` temp files map to Multer (`FileInterceptor`) in Nest; field name `img`, folder `products`, and multipart field parsing must match. Cloudinary becomes an injectable provider. |
| Search | Dynamic `:collection` switch maps to one controller or several routes; keep the `{ results }` shape and the `400` for unknown collections. |
| Swagger | `@nestjs/swagger` generates from decorators; the current JSDoc spec is incomplete, so it is not a reliable contract. Use code behavior as the source of truth. |
| Static files / root | `express.static("public")` → `ServeStaticModule` or `app.useStaticAssets`; keep `GET /` text. |

---

## 11. Open questions

- Which clients consume this API, and do they depend on current quirks (400-for-404, email in JWT, password in responses)?
- Intended access rules: which endpoints require login, which require `role = 2`?
- Real `PORT`, deployment target, and whether HTTPS is used (affects the `secure` refresh cookie).
- Is there production data, and do the unique indexes exist in it?
- Coupon semantics (`discount` unit, why it is unique) and whether coupons connect to any order flow elsewhere.
