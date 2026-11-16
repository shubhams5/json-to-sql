# Release process

## Version source of truth

Keep these equal before tagging:

- Root `package.json` `version`
- `packages/core/package.json` `version`
- `packages/cli/package.json` `version`
- `packages/cli` dependency `@json-to-sql/core`
- Root dependency `@json-to-sql/core` (workspace)
- Git tag `vX.Y.Z`

Never auto-bump in CI. Never republish an existing version.

## Pre-release checklist

```bash
npm ci
npm run build:packages
npm test
npm run lint
npm run pack:check
npm run verify:npm
npm run test:consumer
# optional but recommended before a public cut:
# CI=true npm run test:generated
# npm run test:e2e
# npm run build
```

Update `CHANGELOG.md` and `docs/RELEASE_NOTES_X.Y.Z.md` when shipping user-visible changes.

## First-time npm bootstrap (0.3.0)

See [NPM_PUBLISHING.md](./NPM_PUBLISHING.md).

Order:

1. Create npm org **`json-to-sql`**
2. Local publish core then CLI with `npm login` + 2FA
3. Configure Trusted Publisher on **both** packages → workflow `release.yml`
4. Subsequent versions: bump → tag → Actions publish

## Tagging (after merge to default branch)

```bash
npm run release:preflight -- v0.3.0
git tag -a v0.3.0 -m "v0.3.0"
git push origin v0.3.0
```

Only push the tag when:

- Package versions match the tag, **and**
- Either packages are unpublished (Actions will publish), **or**
- Packages were already bootstrapped locally and you only want CI to no-op skip / you are tagging for GitHub Release notes (prefer not to re-run publish for the same version)

## What the Release workflow does

File: `.github/workflows/release.yml`

1. Checkout
2. Node 24 + npm ≥ 11.5.1
3. Strip empty `_authToken` that would break OIDC
4. `npm ci` → build → test → pack check → `verify:npm`
5. Tag ↔ version preflight
6. `npm-publish-ordered.mjs` (core, wait for registry, CLI; skip if already present)
7. `npm view` both packages

Permissions: `contents: read`, `id-token: write`. No permanent token in the default path.

## GitHub Release notes

Create a GitHub Release for the tag and paste the matching `docs/RELEASE_NOTES_*.md` body.

## Partial failure recovery

1. Read Actions logs / local publish output (never paste tokens).
2. `npm view @json-to-sql/core@X.Y.Z version`
3. `npm view @json-to-sql/cli@X.Y.Z version`
4. Publish only the missing package (local OTP or re-run workflow — skip logic is idempotent).
5. If both exist, stop; cut a new version for further changes.
