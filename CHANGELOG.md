# Changelog

All notable changes to this project will be documented in this file.

## [0.2.1] - 2026-11-16

### Fixed

- Prisma schema: named relations, FK onDelete/onUpdate, composite `@@id`, Decimal/`@db.Decimal`, per-dialect `.env.example`
- Express Prisma: strict Zod writable schemas (no passthrough), PUT validation, filter allowlist, Prisma error mapping
- Nest Prisma: `PartialType` update DTOs, real search/sort/filter/`orderBy`
- Relational PK assignment respects UUID vs integer; errors on unsupported missing string PKs; MSSQL `IDENTITY_INSERT`
- FK cycles emit `ALTER TABLE` constraints (Postgres `DEFERRABLE`) instead of silently invalid CREATE order

### Added

- Independent consumer import test (`npm run test:consumer`)
- Generated CI: all four targets `tsc`, `prisma validate`, Express+Prisma SQLite smoke
- Separate CI jobs for Postgres / MySQL / SQL Server execution
- Release workflow on `v*` tags
- Package `prepack` build; versions synchronized at 0.2.1

### Deferred (Dependabot majors)

- TypeScript 7, Next 16, ESLint 10, Vitest 5, `@types/node` 26 — incompatible with current engines/stack; leave open or close until planned upgrade.

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
