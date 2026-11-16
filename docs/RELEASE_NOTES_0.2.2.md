# Release notes — v0.2.2

Final security and release hardening on top of 0.2.1.

## Highlights

- **TypeORM mass-assignment closed**: Express Zod `.strict()` create/update; Nest DTOs + `forbidNonWhitelisted`; update paths cannot rewrite primary keys
- **Production-safe TypeORM defaults**: `synchronize` only via `TYPEORM_SYNC=true`; generated migration scripts and docs
- **Safer CI validation**: no default TLS bypass; reliable temp cleanup; Prisma skips fail when `CI=true`
- **Broader smoke coverage**: Express + Nest TypeORM SQLite CRUD/HTTP (including FK + invalid payloads); custom string PK Express smoke

## Not in this release

- UI redesigns or new product features
- Prisma-against-Postgres/MySQL/MSSQL (dialect CI remains SQL execution only)
- Composite-PK HTTP routes (still rejected at generate time)

## Upgrade

Bump `@json-to-sql/core` / `@json-to-sql/cli` to `0.2.2`. Regenerate CRUD projects to pick up TypeORM validation, migration scaffolding, and safer defaults.
