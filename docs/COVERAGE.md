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
- Export + CRUD generators (Prisma Decimal dialect gates, Nest `sanitizeFilter`, TypeORM sync/mass-assignment, composite PK reject)

As of 2026-11-16 (0.2.1 correctness): **55 unit tests** in core, plus Playwright smoke (`e2e/smoke.spec.js`), generated-project validation (`npm run test:generated`), and consumer pack import (`npm run test:consumer`).

Optional HTML coverage:

```bash
npm run test -w @json-to-sql/core -- --coverage
```

(Add `@vitest/coverage-v8` when you want CI coverage artifacts.)
