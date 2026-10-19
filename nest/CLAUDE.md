# nest/ — NestJS migration target

Independent NestJS app. It shares nothing at runtime with the Express app in `../src`: own
`package.json`, lockfile, `tsconfig.json`, Jest config and `.env`. Root `CLAUDE.md` rules apply here too.

- Port 3003 (`PORT` in `nest/.env`); Express keeps 3002.
- `AppModule.forRoot(uri, jwtSecret)` takes the MongoDB URI and JWT secret explicitly. `main.ts` passes `DB_URI`
  and `SECRET_JWT` (both required; use the Express app's `SECRET_JWT` so its tokens verify). Tests pass the
  in-memory database from `test/test-db.ts` and `TEST_JWT_SECRET` from `test/test-app.ts`. Tests must never
  use `DB_URI`.
- `src/auth/`: `JwtAuthGuard` (mirrors Express `checkJWT`) guards category writes (S3 decision).
- One module per migrated resource under `src/<resource>/` (schema, service, controller, module). Copy the
  Mongoose schema from `../src/models` rather than importing it.
- Migrate only through the `feature-workflow` skill, one endpoint at a time, and record it in
  `../docs/ai-workflow/parity.md`. Security flags in `../docs/ai-workflow/decisions.md` are not copied
  without a decision.

Commands (run in `nest/`):

| Command | Does |
| --- | --- |
| `npm ci` | Install dependencies |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Jest + Supertest against an in-memory MongoDB (`MONGOMS_SYSTEM_BINARY` to reuse a local `mongod`) |
| `npm start` | Runs `src/main.ts` with `ts-node` on port 3003 |
