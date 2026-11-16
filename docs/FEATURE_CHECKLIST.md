# Feature checklist

Honest status after 0.2.0 hardening. `[x]` = implemented and covered by automated tests where noted. `[~]` = partial. `[ ]` = not done.

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
- [~] Live PG/MySQL/MSSQL container integration tests (not in default CI yet)

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

- [x] Express + Prisma (package.json, env, routes, validation)
- [x] Express + TypeORM
- [x] NestJS + Prisma
- [x] NestJS + TypeORM
- [~] Experimental `orm:none` scaffolds (explicitly labeled)
- [~] Generated-project compile CI for Express+TypeORM; Prisma/Nest full install not gated on every PR

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
