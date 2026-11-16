# Feature checklist

Honest status for **0.3.0**. `[x]` = implemented and covered by automated tests where noted. `[~]` = partial. `[ ]` = not done.

## JSON import and analysis

- [x] JSON object / array
- [x] Nested JSON / arrays of objects → child tables
- [x] Nullable + missing properties
- [x] Validation + parse errors
- [x] Schema inference + type detection (+ mixed-type warnings)
- [x] Field stats
- [x] Manual type/SQL overrides (designer + `applyColumnOverride`)
- [x] UTF-8 byte / depth / node / row / column limits

## Database support

- [x] PostgreSQL / MySQL / SQL Server / SQLite dialects
- [x] Dialect interface
- [x] CREATE / DROP TABLE
- [x] ALTER TABLE ADD COLUMN
- [x] PK / FK / unique / indexes / NOT NULL / defaults (literal-safe) / identity
- [x] Relational INSERT for nested data (SQLite execution test)
- [x] Live PG/MySQL/MSSQL **SQL** execution jobs in CI (SQL dialect jobs ≠ Prisma against those DBs)

## Schema designer

- [x] Edit table/column names (rename propagates PK/FK/indexes via core helpers)
- [x] Change SQL types (datalist per dialect)
- [x] Configure PK / nullable / unique / exclude
- [x] FK ON DELETE/UPDATE editing
- [x] Schema validation issues surfaced in UI
- [x] Nested strategy toggle (re-infer required for structural rebuild)
- [x] ER diagram with handles + drag

## SQL generation

- [x] INSERT / UPDATE / DELETE (legacy flat DML preserved)
- [x] CREATE schema + full bundle with relational inserts
- [x] SELECT with JOINs (unique aliases)
- [x] Parameterized CRUD templates
- [x] Identifier + literal escaping (MySQL backslash, MSSQL `N''`, no PG ARRAY heuristic)
- [x] Never auto-executes SQL

## CRUD generator

- [x] Express + Prisma — strict Zod, `sanitizeFilter`, Prisma error mapping; unit tests + CI HTTP smoke when engines available
- [x] NestJS + Prisma — `sanitizeFilter` / string query guards / P2025·P2002 mapping
- [x] Express + TypeORM — dialect-aware DataSource/env (sqlite/pg/mysql/mssql), Zod `.strict()`, FK/unique → 409, relations (`ManyToOne`/`OneToMany`/`JoinColumn`), `TYPEORM_SYNC` opt-in, migrations; SQLite HTTP smoke (CRUD, PK protect, bad FK, child FK) when `better-sqlite3` loads
- [x] NestJS + TypeORM — same dialect/relation/migration rules; Create/Update DTOs + whitelist; PK strip; HttpCode 201/204; SQLite HTTP smoke when native loads
- [x] Custom string PK routes (create accepts PK; update rejects PK mutation) — unit tests always; Express TypeORM smoke when native loads
- [x] Composite TypeORM FKs rejected at generate time (clear error)
- [~] Experimental `orm:none` scaffolds (explicitly labeled)
- [x] Generated-project compile for TypeORM always; Prisma validate/generate + TypeORM native smokes mandatory when `CI=true` (local may WARN-skip engines/native)

## Import / export

- [x] JSON import (paste + file)
- [x] SQL / TS interfaces / JSON Schema / CSV (formula-safe)
- [x] CRUD project files
- [x] ZIP download with preview

## UX

- [x] CodeMirror editors
- [x] Database selector
- [x] Copy / download
- [x] Error / warning panels
- [x] Light / dark toggle
- [x] Responsive layout
- [x] Designer edits protected until explicit re-infer
