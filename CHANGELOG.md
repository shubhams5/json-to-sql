# Changelog

All notable changes to this project will be documented in this file.

## [0.2.1] - 2026-11-16

### Fixed

- Prisma schema: named relations, FK onDelete/onUpdate, composite `@@id`, Decimal/`@db.Decimal` (postgres/mysql/mssql only), UUID native attrs dialect-gated, per-dialect `.env.example`
- Express Prisma: strict Zod writable schemas (no passthrough), PUT validation, filter allowlist, Prisma error mapping, `Number.isInteger` id checks
- Nest Prisma: `PartialType` update DTOs, real search/sort/`orderBy`, shared `sanitizeFilter` + string query guards, P2025/P2002 mapping
- TypeORM Express/Nest: Zod/DTO validation (no mass-assignment), Nest update strips PK from data only, `TYPEORM_SYNC` opt-in (default false), SQLite `DB_TYPE=better-sqlite3`
- Route generators reject composite PKs at generate time
- Relational PK assignment respects UUID vs integer; errors on unsupported missing string PKs; MSSQL `IDENTITY_INSERT`
- FK cycles emit `ALTER TABLE` constraints (Postgres `DEFERRABLE`) instead of silently invalid CREATE order
- CI: `CI=true` fails Prisma engine-download skips; Express HTTP smoke (extra key / create / bad filter); no default `NODE_TLS_REJECT_UNAUTHORIZED=0`

### Added

- Independent consumer import test (`npm run test:consumer`)
- Generated CI: all four targets `tsc`, `prisma validate`, Express+Prisma SQLite + HTTP smoke
- Separate CI jobs for Postgres / MySQL / SQL Server **SQL** execution (not Prisma-against-PG)
- Release workflow on `v*` tags
- Package `prepack` build; versions synchronized at 0.2.1

### Deferred (Dependabot majors)

- TypeScript 7, Next 16, ESLint 10, Vitest 5, `@types/node` 26 — ignored in `.github/dependabot.yml`; leave open PRs deferred until planned stack upgrade. No major merges in 0.2.1.

## [0.2.0] - 2026-11-16

### Fixed

- Relational INSERT for nested objects/arrays with FK values and dependency order
- MySQL backslash literal escaping; removed unsafe Postgres ARRAY heuristic
- MSSQL boolean/`N''` literals; SQLite `INTEGER PRIMARY KEY AUTOINCREMENT`
- Default values quoted as literals (injection-safe)
- UTF-8 byte size limits; partial `ParseLimits` merge
- FK inference after surrogate PK insertion; unique table/column names
- Schema designer rename propagation; ER diagram handles
- `next start` vs static export: `npm start` now serves `out/`

### Added

- Express/NestJS × Prisma/TypeORM CRUD generators (self-contained projects)
- `validateSchema`, `renameColumn`, relational planner APIs
- SQLite execution tests via `node:sqlite`
- CLI stdin, `--overwrite`, path traversal guards, expanded `--crud` flags
- Generated-project validation script + CI pack check

### Changed

- Root package marked `private: true`; packages at 0.2.0, ESM-only exports
- Experimental label for `orm: none` scaffolds
- Docs/checklists updated to honest status

## [0.1.0] - 2026-11-16

### Added

- Modular `@json-to-sql/core` library
- CLI package `@json-to-sql/cli` (`json2sql`)
- Schema inference with nested child-table / JSON-column strategies
- Dialect SQL generators: PostgreSQL, MySQL, SQL Server, SQLite
- Schema designer UI and ER diagram
- CRUD generators for Express and NestJS
- Export bundle: SQL, TypeScript interfaces, JSON Schema, CSV, ZIP
- Vitest unit tests, Playwright smoke test, GitHub Actions CI
- Open-source documentation set (MIT)
