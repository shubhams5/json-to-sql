# Tag and publish 0.3.0

## Preflight (local or CI)

```bash
npm ci
npm run build:packages
npm test
npm run lint
npm run test:generated   # CI=true on GitHub Actions
npm run test:e2e
npm run build
npm run pack:check
npm run test:consumer
```

## Git tag (after merge to main)

```bash
git tag -a v0.3.0 -m "v0.3.0 TypeORM dialect + relations"
git push origin v0.3.0
```

## npm (GitHub Actions Release workflow)

1. Create npm Granular Access Token with **Read and write** for `@json-to-sql/core` and `@json-to-sql/cli` (or org-wide publish).
2. Repo → Settings → Secrets → Actions → add `NPM_TOKEN`.
3. Push `v0.3.0` tag (workflow `.github/workflows/release.yml` publishes with `--provenance`).

## Manual publish fallback

```bash
npm login
npm publish -w @json-to-sql/core --access public --provenance
npm publish -w @json-to-sql/cli --access public --provenance
```

## GitHub Release

Attach `docs/RELEASE_NOTES_0.3.0.md` as the release body for tag `v0.3.0`.
