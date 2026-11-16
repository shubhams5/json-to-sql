# Architecture

```text
JSON input
  -> parseJsonInput (limits + validation)
  -> inferSchema (tables/columns/FKs)
  -> SchemaModel (editable in UI)
  -> Dialect SQL generators / CRUD generators / Exporters
```

## Packages

### `@json-to-sql/core`

Pure TypeScript. No React. Safe to use from CLI, scripts, or the Next.js UI.

| Module | Responsibility |
|--------|----------------|
| `json/` | Parse, validate, column discovery |
| `schema/` | Inference + overrides |
| `dialects/` | Dialect interface + PG/MySQL/MSSQL/SQLite |
| `sql/` | DML + DDL + SELECT/JOIN + parameterized templates |
| `crud/` | Express / NestJS code generation |
| `export/` | SQL / TS / JSON Schema / CSV / bundle |

### `@json-to-sql/cli`

Thin wrapper: read file → core → write artifacts.

### Next.js UI (`src/app`)

Tabs for JSON, Schema, ER, SQL, CRUD, Export. Calls core only; does not embed dialect conditionals for SQL syntax.

## Extending

### New database dialect

1. Implement `Dialect` in `packages/core/src/dialects/<name>.ts`
2. Register in `dialects/index.ts`
3. Add Vitest coverage for quoting + CREATE TABLE

### New CRUD target

1. Add renderer in `packages/core/src/crud/generate.ts` (or split templates under `packages/core/templates`)
2. Extend `CrudTarget` type
3. Wire CLI `--crud` option and UI selector
