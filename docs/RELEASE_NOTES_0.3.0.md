# Release notes — 0.3.0

## Highlights

- **TypeORM is dialect-aware**: generated Express/Nest projects pick driver defaults from `SchemaModel.dialect` (SQLite / PostgreSQL / MySQL / SQL Server) with matching `.env.example`, deps, and connection options (including MSSQL encrypt / trust-server-certificate).
- **Relationship entities**: `@ManyToOne` / `@OneToMany` / `@JoinColumn` from inferred FKs; composite FKs fail generation with a clear error instead of bad metadata.
- **Safer CRUD status + integrity**: TypeORM maps FK/unique driver errors to HTTP 409; Nest create returns 201 and delete 204; smokes assert PK mutation blocked and bad FK rejected.
- **Migrations stay production-safe**: `synchronize` only via `TYPEORM_SYNC=true`; CLI DataSource keeps `synchronize: false`.

## Upgrade

Bump `@json-to-sql/core` / `@json-to-sql/cli` to `0.3.0`. Regenerate TypeORM CRUD projects to pick up dialect env, relations, and error mapping.

## Publish

Requires GitHub secret `NPM_TOKEN` (npm granular token with publish on `@json-to-sql/*`). Tag `v0.3.0` after CI green.
