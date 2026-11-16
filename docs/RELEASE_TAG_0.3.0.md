# Tag and publish 0.3.0

Full process: [NPM_PUBLISHING.md](./NPM_PUBLISHING.md) · [RELEASE_PROCESS.md](./RELEASE_PROCESS.md)

## Preflight

```bash
npm ci
npm run build:packages
npm test
npm run lint
npm run verify:npm
npm run pack:check
npm run release:preflight -- v0.3.0
```

## Blockers before any publish

1. npm org **`json-to-sql`** must exist (currently missing → `E404 Scope not found`).
2. Do **not** push `v0.3.0` expecting Actions to create the org or packages.

## Bootstrap (local, once)

```bash
npm login
npm publish -w @json-to-sql/core --access public
npm view @json-to-sql/core@0.3.0 version
npm publish -w @json-to-sql/cli --access public
npm view @json-to-sql/cli@0.3.0 version
```

Then configure Trusted Publishing on both packages (workflow filename `release.yml`).

## After bootstrap

- Create GitHub Release for `v0.3.0` with `docs/RELEASE_NOTES_0.3.0.md`.
- Future cuts: bump version → tag → Actions OIDC publish (no `NPM_TOKEN`).

## Do not

- Republish `0.3.0` if already on the registry
- Commit tokens / OTP / `.npmrc` auth
- Rename packages away from `@json-to-sql/*` without an explicit decision
