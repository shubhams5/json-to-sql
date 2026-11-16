# Test coverage

Run unit tests:

```bash
npm test
```

Current suite (Vitest in `packages/core`):

- JSON parser + limits
- Schema inference + overrides
- Dialect listing / escaping / CREATE TABLE
- Legacy DML INSERT/UPDATE/DELETE
- Export + CRUD generators (Prisma dialect gates, Nest `sanitizeFilter`, TypeORM dialect env/relations/sync/mass-assignment/migrations/custom PK, composite PK + composite FK reject)

As of 2026-11-16 (**0.2.2**): **58** unit tests in core. Also:

- Playwright smoke (`npm run test:e2e`)
- Generated-project validation (`npm run test:generated`) — four-target `tsc`, Prisma validate/generate (CI-mandatory), Express Prisma HTTP smoke when engines available, Express+Nest TypeORM SQLite HTTP smokes + custom PK when `better-sqlite3` native loads (CI-mandatory; local Node without prebuild/Python may WARN-skip)
- Consumer pack import (`npm run test:consumer`)
- Dialect SQL jobs in CI (Postgres / MySQL / MSSQL) — SQL only

Optional HTML coverage:

```bash
npm run test -w @json-to-sql/core -- --coverage
```

(Add `@vitest/coverage-v8` when you want CI coverage artifacts.)
