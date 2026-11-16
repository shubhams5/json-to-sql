# Release notes — 0.3.0

## Highlights

- **TypeORM is dialect-aware**: generated Express/Nest projects pick driver defaults from `SchemaModel.dialect` (SQLite / PostgreSQL / MySQL / SQL Server) with matching `.env.example`, deps, and connection options (including MSSQL encrypt / trust-server-certificate).
- **Relationship entities**: `@ManyToOne` / `@OneToMany` / `@JoinColumn` from inferred FKs; composite FKs fail generation with a clear error instead of bad metadata.
- **Safer CRUD status + integrity**: TypeORM maps FK/unique driver errors to HTTP 409; Nest create returns 201 and delete 204; smokes assert PK mutation blocked and bad FK rejected.
- **Migrations stay production-safe**: `synchronize` only via `TYPEORM_SYNC=true`; CLI DataSource keeps `synchronize: false`.

## Upgrade

Bump `@json-to-sql/core` / `@json-to-sql/cli` to `0.3.0`. Regenerate TypeORM CRUD projects to pick up dialect env, relations, and error mapping.

## Publish

- npm: `@json-to-sql/core@0.3.0` and `@json-to-sql/cli@0.3.0` published (org `json-to-sql`)
- Install: `npm install @json-to-sql/core` / `npm install -g @json-to-sql/cli`
- Future releases: configure Trusted Publishing on both packages (workflow `release.yml`); no permanent `NPM_TOKEN` required
