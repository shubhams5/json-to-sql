# Security assessment

Date: 2026-11-16 (updated for **0.3.0** TypeORM dialect/relations)

## Scope

Local JSON → schema/SQL/CRUD generation in browser and CLI. Generated Express/Nest × Prisma/TypeORM apps are developer scaffolds, not turnkey production services.

## Controls

| Risk | Mitigation |
|------|------------|
| Resource exhaustion via huge/deep JSON | UTF-8 `maxBytes` 5MB (`TextEncoder`/`Buffer.byteLength`), `maxDepth` 32, `maxNodes` 100k, row/column caps; partial limits merged with defaults |
| SQL injection in generated scripts | Dialect-specific identifier + literal escaping; MySQL backslash escaping; defaults quoted as literals unless tagged expression allowlist |
| Accidental execution of generated SQL | Tool only generates text; never connects to a DB (except optional local test runners) |
| Supply-chain / paid APIs | No conversion network calls; OSS dependencies only |
| XSS via rendered output | Output shown in CodeMirror as text, not `dangerouslySetInnerHTML` |
| Code injection in generated apps | Property access via safe helpers / `JSON.stringify` for string literals; file segments slugified; path traversal blocked in CLI |
| ZIP path abuse | Table/file segments sanitized via `safeFileSegment` |
| Mass assignment in generated CRUD | Express: Zod `.strict()` writable schemas (autoIncrement PKs excluded; update excludes all PKs). Nest: class-validator DTOs + `ValidationPipe` `whitelist`/`forbidNonWhitelisted`; update strips PK from data |
| TypeORM schema drift in prod | `synchronize` only when `TYPEORM_SYNC=true` (default false); generated migration scripts + README; Nest CLI DataSource forces `synchronize: false` |
| TypeORM bad FK / unique | Generated Express/Nest map driver FK/unique errors to HTTP 409; SQLite `prepareDatabase` enables `foreign_keys = ON` |
| TypeORM composite FK | Rejected at generate time (no silent invalid metadata) || Query filter injection (Prisma) | `sanitizeFilter` allowlist + reject relation/logical ops (Express + Nest) |
| CI TLS bypass | `scripts/validate-generated.mjs` never sets `NODE_TLS_REJECT_UNAUTHORIZED=0`; uses Node default verification |

## Corporate TLS / Prisma engines

If Prisma engine downloads fail under SSL inspection, do **not** disable TLS verification. Install the corporate root CA and point Node at it:

```bash
export NODE_EXTRA_CA_CERTS=/path/to/corp-root-ca.pem
```

Windows (PowerShell): `$env:NODE_EXTRA_CA_CERTS="C:\path\to\corp-root-ca.pem"`

Locally, engine-download failures may WARN/skip Prisma smoke. With `CI=true`, those skips are **failures**.

## Residual risks / honest limitations

- Users may execute generated SQL on production DBs without review
- Generated CRUD still needs human review (auth, rate limits, tenancy, migrations against real schemas)
- Composite primary keys: Prisma schema may emit `@@id`, but HTTP route generators **reject** composite PKs at generate time
- Live PG/MySQL/MSSQL jobs exercise **SQL dialect execution**, not Prisma against those databases
- TypeORM smoke uses opt-in `TYPEORM_SYNC=true` against throwaway SQLite files only; requires a working `better-sqlite3` native binary (CI Node 22 prebuilds; local Node without prebuild/toolchain WARNs, CI fails)
- Client-side ZIP/codegen is not a substitute for security review of emitted application code

## Recommendation

Safe for local developer use. Review all generated artifacts before applying to real databases or shipping generated services. Prefer Prisma/TypeORM targets over experimental `orm:none` scaffolds. Prefer migrations over `TYPEORM_SYNC` outside throwaway local DBs.

## Accepted dependency limitations (0.3.0)

- **Next.js 15.5.4** kept (not 15.5.29): patch advisories exist (App Router Server Actions / middleware), but `15.5.29` breaks this repo’s static-export Turbopack build (`/_not-found` invariant) and webpack build (`assetPrefix: "."` vs `next/font`). App is `output: "export"` (no server runtime), so those server-side advisories have limited blast radius here. Revisit when a later 15.5.x patch builds cleanly.
- **Prisma / better-sqlite3 smokes** require network + native binaries; corporate TLS intercept or missing native toolchain WARNs locally; GitHub Actions `CI=true` fails those skips (mandatory).
- **npm publish** requires repo secret `NPM_TOKEN` (not inventable from this environment).
