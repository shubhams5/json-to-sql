# npm publishing — `@json-to-sql/*`

Packages:

| Package | Version (repo) | Scope |
|---------|----------------|-------|
| `@json-to-sql/core` | `0.3.0` | `json-to-sql` |
| `@json-to-sql/cli` | `0.3.0` | `json-to-sql` |

Prefer **Trusted Publishing (OIDC)** from GitHub Actions. Do **not** commit tokens. Do **not** rename packages to a personal unscoped/user scope unless you explicitly decide to abandon the org scope.

## Current registry facts (verified during setup)

- npm org `json-to-sql` **does not exist** (`/-/org/json-to-sql` → ResourceNotFound).
- `@json-to-sql/core` and `@json-to-sql/cli` are **not published** (registry `E404`).
- Local `npm whoami` may show your personal account (e.g. `shubhams5`); that alone is **not** enough to publish under `@json-to-sql` until the org exists and you are a member with publish rights.

That matches common errors:

| Error | Meaning |
|-------|---------|
| `E404 Scope not found` | Org/scope `@json-to-sql` missing or you lack access |
| `E403` 2FA / granular token | Classic token or missing 2FA/bypass on publish; use login+OTP for bootstrap or Trusted Publishing afterward |
| `ENEEDAUTH` | No usable credentials / empty `NODE_AUTH_TOKEN` in CI |

## 1. Create the npm organization (manual)

Do this in a browser while signed into npm:

1. Open [https://www.npmjs.com/org/create](https://www.npmjs.com/org/create) (or Account → Organizations → Create).
2. Organization name: **`json-to-sql`** (must match the scope exactly).
3. Choose a plan that allows **public** packages (often the free org plan for public packages).
4. Confirm you (your npm user) are an **owner** or have **publish** rights on the org.
5. Do **not** create random packages with wrong names.

Optional check after creation:

```bash
curl -s https://registry.npmjs.org/-/org/json-to-sql
# expect JSON describing the org, not ResourceNotFound
```

## 2. Bootstrap: first publication (local, required once)

Trusted Publishing is configured **on existing packages**. First `0.3.0` publish is local (interactive 2FA).

Prerequisites:

- Org `json-to-sql` exists
- You are logged in: `npm whoami`
- Account has 2FA enabled (npm requirement for publish)
- Repo built: `npm run build:packages && npm test && npm run verify:npm`

Commands (run from repo root; you will be prompted for OTP):

```bash
npm login
# complete browser/OTP login — do not paste tokens into the repo

npm run release:preflight -- v0.3.0
# REQUIRE_UNPUBLISHED defaults true: fails if 0.3.0 already exists

npm publish -w @json-to-sql/core --access public
npm view @json-to-sql/core@0.3.0 version

npm publish -w @json-to-sql/cli --access public
npm view @json-to-sql/cli@0.3.0 version
```

Verify from a clean temp dir:

```bash
cd "$(mktemp -d)"
npm install @json-to-sql/core@0.3.0
node -e "import('@json-to-sql/core').then(m => console.log(Object.keys(m).slice(0,5)))"
npm install @json-to-sql/cli@0.3.0
npx json2sql --help
```

**Do not** re-publish `0.3.0` if it already succeeded. For a failed half-publish (core ok, CLI missing), publish only the missing package.

## 3. Configure Trusted Publishing (after packages exist)

For **each** package on npmjs.com:

1. Open package page → **Settings** → **Trusted Publisher** (or Automation / Publishing access).
2. Add GitHub Actions publisher:
   - **Organization or user:** `shubhams5`
   - **Repository:** `json-to-sql`
   - **Workflow filename:** `release.yml` (filename only, not full path)
   - Environment: leave empty unless you intentionally use a GitHub Environment
3. Allow **`npm publish`** (and staged publish if you use it later).
4. Save.

Docs: [Trusted publishing for npm packages](https://docs.npmjs.com/trusted-publishers/)

Requirements:

- npm CLI **≥ 11.5.1**
- Node **≥ 22.14** (release job uses Node **24**)
- Workflow permission `id-token: write`
- Public GitHub repo + public packages for automatic provenance

## 4. GitHub Actions (after Trusted Publisher configured)

Workflow: `.github/workflows/release.yml`

- Trigger: push tag `v*`
- Permissions: `contents: read`, `id-token: write`
- **No** `NPM_TOKEN` required for Trusted Publishing
- **No** `registry-url` on `setup-node` (avoids empty `_authToken` blocking OIDC)
- Publishes **core → wait → CLI** via `scripts/npm-publish-ordered.mjs`
- Skips a package if that exact version already exists (idempotent recovery)
- Stops on any real publish failure

After Trusted Publishers are set:

```bash
# only after 0.3.0 docs/code are on the default branch and org+TP ready
# if 0.3.0 was already published locally, do NOT retag the same version for a second publish
git tag -a v0.3.0 -m "v0.3.0"
git push origin v0.3.0
```

If `0.3.0` was bootstrapped locally, the next automated release should be a **new** version (e.g. `0.3.1`) with matching package.json bumps.

## 5. Optional fallback: `NPM_TOKEN`

Prefer Trusted Publishing. If you must use a token temporarily:

1. npm → Access Tokens → **Granular Access Token**
2. Permission: read/write on `@json-to-sql/core` and `@json-to-sql/cli` (or org packages)
3. Enable whatever 2FA policy npm requires for publish (bypass only if you accept that risk)
4. GitHub repo → Settings → Secrets → Actions → `NPM_TOKEN`
5. You would need a **separate** workflow path that sets `NODE_AUTH_TOKEN` — the current `release.yml` is OIDC-first and does **not** inject `NPM_TOKEN`

Do not put the token in source, `.npmrc` in git, or logs.

## 6. Common recovery

| Situation | Action |
|-----------|--------|
| Org missing | Create org `json-to-sql` (section 1) |
| Core published, CLI not | `npm publish -w @json-to-sql/cli --access public` only |
| Both published | Tag/GitHub Release only; bump version for next publish |
| CI `ENEEDAUTH` with Trusted Publishing | Confirm Trusted Publisher workflow name is `release.yml`; ensure no empty `_authToken` npmrc |
| Duplicate version | Never force republish; bump version in all package.json + lockfile |

## 7. Local verification scripts

```bash
npm run build:packages
npm run verify:npm          # metadata, pack contents, exports, registry ping
npm run release:preflight -- v0.3.0
DRY_RUN=true node scripts/npm-publish-ordered.mjs
```
