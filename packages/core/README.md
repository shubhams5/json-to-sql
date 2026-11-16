# @json-to-sql/core

Framework-independent TypeScript library: parse JSON, infer schemas, generate dialect SQL, and emit CRUD projects.

## Install

```bash
npm install @json-to-sql/core
```

ESM only (`"type": "module"`). Node.js 22+.

## Quick example

```ts
import { parseJsonInput, inferSchema, generateFullSqlBundle, generateCrud, parseCrudTargetFlag } from "@json-to-sql/core";

const parsed = parseJsonInput(`[{"id":1,"name":"Ada","orders":[{"sku":"A","qty":1}]}]`);
const schema = inferSchema(parsed.rows, { dialect: "postgres", rootTableName: "people" });
const sql = generateFullSqlBundle(schema, parsed.rows);
const crud = generateCrud(schema, parseCrudTargetFlag("express-prisma"));
```

## Public surface

- `parseJsonInput` / `getColumns`
- `inferSchema` / `renameTable` / `renameColumn` / `validateSchema` / `applyColumnOverride`
- `getDialect` / `listDialects`
- `generateDml` / `generateRelationalInserts` / `generateFullSqlBundle` / `generateCreateSchema`
- `generateCrud` / `parseCrudTargetFlag`
- `buildExportBundle`

See repository `docs/ARCHITECTURE.md` for module layout.
