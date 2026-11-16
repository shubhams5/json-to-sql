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
- Export + CRUD generators

As of 2026-11-16: **22 unit tests passing**, plus Playwright smoke (`e2e/smoke.spec.js`).

Optional HTML coverage:

```bash
npm run test -w @json-to-sql/core -- --coverage
```

(Add `@vitest/coverage-v8` when you want CI coverage artifacts.)
