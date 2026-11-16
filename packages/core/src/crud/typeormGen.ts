import { camel, isSafeIdent, jsString, mapTsType, pascal, propKey, safeFileSegment } from "../codegen/safe.js";
import type { ForeignKeyModel, ReferentialAction, SchemaModel, TableModel } from "../types.js";

export function typeormDriverType(dialect: SchemaModel["dialect"]): "better-sqlite3" | "postgres" | "mysql" | "mssql" {
  if (dialect === "sqlite") return "better-sqlite3";
  if (dialect === "postgres") return "postgres";
  if (dialect === "mysql") return "mysql";
  return "mssql";
}

export function typeormDefaultPort(dialect: SchemaModel["dialect"]): number {
  if (dialect === "mysql") return 3306;
  if (dialect === "mssql") return 1433;
  if (dialect === "postgres") return 5432;
  return 0;
}

export function typeormEnvExample(dialect: SchemaModel["dialect"]): string {
  const driver = typeormDriverType(dialect);
  if (dialect === "sqlite") {
    return `DB_TYPE=${driver}\nDB_NAME=dev.db\nTYPEORM_SYNC=false\nPORT=3000\n`;
  }
  const port = typeormDefaultPort(dialect);
  const extra = dialect === "mssql" ? "DB_ENCRYPT=false\nDB_TRUST_SERVER_CERTIFICATE=true\n" : "";
  return `DB_TYPE=${driver}\nDB_HOST=localhost\nDB_PORT=${port}\nDB_USER=user\nDB_PASS=pass\nDB_NAME=app\nTYPEORM_SYNC=false\n${extra}PORT=3000\n`;
}

export function typeormColumnType(sqlType: string, inferred: string): string {
  const t = (sqlType || inferred).toLowerCase();
  if (t.includes("tinyint(1)") || t === "bit" || t.includes("bool")) return "boolean";
  if (t.includes("bigint")) return "bigint";
  if (t.includes("int")) return "int";
  if (t.includes("double") || t.includes("float") || t.includes("real")) return "float";
  if (t.includes("numeric") || t.includes("decimal")) return "decimal";
  if (t.includes("json")) return "simple-json";
  return "varchar";
}

function typeormAction(action: ReferentialAction): string {
  // TypeORM string literals for onDelete/onUpdate
  switch (action) {
    case "CASCADE":
      return "CASCADE";
    case "RESTRICT":
      return "RESTRICT";
    case "SET NULL":
      return "SET NULL";
    case "SET DEFAULT":
      return "SET DEFAULT";
    case "NO ACTION":
    default:
      return "NO ACTION";
  }
}

function relationPropName(fk: ForeignKeyModel, used: Set<string>): string {
  const base = camel(fk.name) || `${camel(fk.refTable)}By${pascal(fk.columns[0] ?? "id")}`;
  let name = isSafeIdent(base) ? base : safeFileSegment(base);
  if (!used.has(name)) {
    used.add(name);
    return name;
  }
  let i = 2;
  while (used.has(`${name}${i}`)) i += 1;
  const next = `${name}${i}`;
  used.add(next);
  return next;
}

function inversePropName(childTable: string, fk: ForeignKeyModel, used: Set<string>): string {
  const base = camel(fk.name) ? `${camel(childTable)}Via${pascal(fk.name)}` : camel(childTable);
  let name = isSafeIdent(base) ? base : safeFileSegment(base);
  // Prefer plural-ish unique name for OneToMany
  if (!name.endsWith("s") && !used.has(name)) {
    // keep as-is first attempt
  }
  if (!used.has(name)) {
    used.add(name);
    return name;
  }
  let i = 2;
  while (used.has(`${name}${i}`)) i += 1;
  const next = `${name}${i}`;
  used.add(next);
  return next;
}

/** Reject unsupported FK shapes for TypeORM entity relations. */
export function assertTypeOrmForeignKeys(schema: SchemaModel, target: string): void {
  const tableNames = new Set(schema.tables.map((t) => t.name));
  for (const table of schema.tables) {
    for (const fk of table.foreignKeys) {
      if (fk.columns.length !== 1 || fk.refColumns.length !== 1) {
        throw new Error(
          `${target}: composite foreign key "${fk.name}" on "${table.name}" is not supported for TypeORM relation codegen (columns=${fk.columns.join(",")}).`
        );
      }
      if (!tableNames.has(fk.refTable)) {
        throw new Error(`${target}: foreign key "${fk.name}" references missing table "${fk.refTable}".`);
      }
      const local = table.columns.find((c) => c.name === fk.columns[0]);
      if (!local || local.isExcluded) {
        throw new Error(
          `${target}: foreign key "${fk.name}" local column "${fk.columns[0]}" is missing or excluded on "${table.name}".`
        );
      }
      const refTable = schema.tables.find((t) => t.name === fk.refTable)!;
      const refCol = refTable.columns.find((c) => c.name === fk.refColumns[0]);
      if (!refCol || refCol.isExcluded) {
        throw new Error(
          `${target}: foreign key "${fk.name}" referenced column "${fk.refColumns[0]}" is missing or excluded on "${fk.refTable}".`
        );
      }
      if (!refTable.primaryKey.includes(fk.refColumns[0]) && !refCol.isUnique) {
        throw new Error(
          `${target}: foreign key "${fk.name}" must reference a primary or unique column (got "${fk.refColumns[0]}" on "${fk.refTable}").`
        );
      }
    }
  }
}

type RelEdge = {
  fk: ForeignKeyModel;
  childTable: string;
  parentTable: string;
  manyToOneProp: string;
  oneToManyProp: string;
  joinColumn: string;
  refColumn: string;
};

function buildRelationGraph(schema: SchemaModel): {
  outgoing: Map<string, RelEdge[]>;
  incoming: Map<string, RelEdge[]>;
} {
  const outgoing = new Map<string, RelEdge[]>();
  const incoming = new Map<string, RelEdge[]>();
  const usedChild = new Map<string, Set<string>>();
  const usedParent = new Map<string, Set<string>>();

  for (const table of schema.tables) {
    usedChild.set(table.name, new Set(table.columns.filter((c) => !c.isExcluded).map((c) => c.name)));
    usedParent.set(table.name, new Set(table.columns.filter((c) => !c.isExcluded).map((c) => c.name)));
  }

  for (const table of schema.tables) {
    for (const fk of table.foreignKeys) {
      const childUsed = usedChild.get(table.name)!;
      const parentUsed = usedParent.get(fk.refTable)!;
      const manyToOneProp = relationPropName(fk, childUsed);
      const oneToManyProp = inversePropName(table.name, fk, parentUsed);
      const edge: RelEdge = {
        fk,
        childTable: table.name,
        parentTable: fk.refTable,
        manyToOneProp,
        oneToManyProp,
        joinColumn: fk.columns[0],
        refColumn: fk.refColumns[0],
      };
      const out = outgoing.get(table.name) ?? [];
      out.push(edge);
      outgoing.set(table.name, out);
      const inn = incoming.get(fk.refTable) ?? [];
      inn.push(edge);
      incoming.set(fk.refTable, inn);
    }
  }
  return { outgoing, incoming };
}

export function renderTypeOrmEntity(
  schema: SchemaModel,
  table: TableModel,
  opts: { importExt: "" | ".js" } = { importExt: "" }
): string {
  const entity = pascal(table.name);
  const cols = table.columns.filter((c) => !c.isExcluded);
  const { outgoing, incoming } = buildRelationGraph(schema);
  const outs = outgoing.get(table.name) ?? [];
  const inns = incoming.get(table.name) ?? [];

  const imports = new Set<string>(["Entity", "PrimaryGeneratedColumn", "PrimaryColumn", "Column"]);
  if (outs.length) {
    imports.add("ManyToOne");
    imports.add("JoinColumn");
  }
  if (inns.length) imports.add("OneToMany");

  const relatedEntities = new Set<string>();
  for (const e of outs) relatedEntities.add(pascal(e.parentTable));
  for (const e of inns) relatedEntities.add(pascal(e.childTable));
  relatedEntities.delete(entity);

  const importLines = [...relatedEntities]
    .map((name) => {
      const t = schema.tables.find((x) => pascal(x.name) === name)!;
      return `import { ${name} } from './${safeFileSegment(t.name)}.entity${opts.importExt}';`;
    })
    .join("\n");

  const colBlocks = cols.map((c) => {
    if (c.isPrimaryKey && c.autoIncrement) {
      return `  @PrimaryGeneratedColumn()\n  ${propKey(c.name)}!: number;`;
    }
    if (c.isPrimaryKey) {
      const colType = typeormColumnType(c.sqlType, c.inferredType);
      return `  @PrimaryColumn({ type: ${jsString(colType)} })\n  ${propKey(c.name)}!: ${mapTsType(c.sqlType, c.inferredType)};`;
    }
    return `  @Column({ type: ${jsString(typeormColumnType(c.sqlType, c.inferredType))}, nullable: ${c.nullable} })\n  ${propKey(c.name)}${c.nullable ? "?" : "!"}: ${mapTsType(c.sqlType, c.inferredType)};`;
  });

  const manyBlocks = outs.map((e) => {
    const parent = pascal(e.parentTable);
    const optional = table.columns.find((c) => c.name === e.joinColumn)?.nullable ? "?" : "!";
    return `  @ManyToOne(() => ${parent}, (parent) => parent.${propKey(e.oneToManyProp)}, { onDelete: ${jsString(typeormAction(e.fk.onDelete))}, onUpdate: ${jsString(typeormAction(e.fk.onUpdate))} })
  @JoinColumn({ name: ${jsString(e.joinColumn)}, referencedColumnName: ${jsString(e.refColumn)} })
  ${propKey(e.manyToOneProp)}${optional}: ${parent};`;
  });

  const oneBlocks = inns.map((e) => {
    const child = pascal(e.childTable);
    return `  @OneToMany(() => ${child}, (child) => child.${propKey(e.manyToOneProp)})
  ${propKey(e.oneToManyProp)}!: ${child}[];`;
  });

  return `import { ${[...imports].join(", ")} } from 'typeorm';
${importLines ? importLines + "\n" : ""}
@Entity(${jsString(table.name)})
export class ${entity} {
${[...colBlocks, ...manyBlocks, ...oneBlocks].join("\n\n")}
}
`;
}

/** Shared DataSource option body for Express/Nest (env-driven, dialect defaults). */
export function renderTypeOrmDataSourceBody(
  schema: SchemaModel,
  opts: { synchronizeExpr: string; entityImportExt: string }
): string {
  const driver = typeormDriverType(schema.dialect);
  const defaultDb = schema.dialect === "sqlite" ? "dev.db" : "app";
  const entityImports = schema.tables
    .map((t) => `import { ${pascal(t.name)} } from './entities/${safeFileSegment(t.name)}.entity${opts.entityImportExt}';`)
    .join("\n");
  const entities = schema.tables.map((t) => pascal(t.name)).join(", ");
  const mssqlOpts =
    schema.dialect === "mssql"
      ? `
  options: {
    encrypt: process.env.DB_ENCRYPT === 'true',
    trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE !== 'false',
  },`
      : "";
  const sqliteOpts =
    schema.dialect === "sqlite"
      ? `
  prepareDatabase: (db: { pragma: (s: string) => void }) => {
    db.pragma('foreign_keys = ON');
  },`
      : "";

  return `import 'reflect-metadata';
import { DataSource } from 'typeorm';
${entityImports}

export const AppDataSource = new DataSource({
  type: (process.env.DB_TYPE as 'postgres' | 'mysql' | 'mssql' | 'better-sqlite3') ?? ${jsString(driver)},
  host: process.env.DB_HOST,
  port: process.env.DB_PORT ? Number(process.env.DB_PORT) : undefined,
  username: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME ?? ${jsString(defaultDb)},${mssqlOpts}${sqliteOpts}
  synchronize: ${opts.synchronizeExpr},
  entities: [${entities}],
  migrations: ['src/migrations/*.{ts,js}'],
  migrationsTableName: 'typeorm_migrations',
});
`;
}

export function renderNestTypeOrmForRoot(schema: SchemaModel): string {
  const driver = typeormDriverType(schema.dialect);
  const defaultDb = schema.dialect === "sqlite" ? "dev.db" : "app";
  const entities = schema.tables.map((t) => pascal(t.name)).join(", ");
  const mssql =
    schema.dialect === "mssql"
      ? `
      options: {
        encrypt: process.env.DB_ENCRYPT === 'true',
        trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE !== 'false',
      },`
      : "";
  const sqlite =
    schema.dialect === "sqlite"
      ? `
      prepareDatabase: (db: { pragma: (s: string) => void }) => {
        db.pragma('foreign_keys = ON');
      },`
      : "";
  return `TypeOrmModule.forRoot({
      type: (process.env.DB_TYPE as 'postgres' | 'mysql' | 'mssql' | 'better-sqlite3') ?? ${jsString(driver)},
      host: process.env.DB_HOST,
      port: process.env.DB_PORT ? Number(process.env.DB_PORT) : undefined,
      username: process.env.DB_USER,
      password: process.env.DB_PASS,
      database: process.env.DB_NAME ?? ${jsString(defaultDb)},${mssql}${sqlite}
      synchronize: process.env.TYPEORM_SYNC === 'true',
      entities: [${entities}],
    })`;
}

/** Express helper: map driver FK/unique failures to HTTP status. */
export function renderTypeOrmExpressErrorMapper(): string {
  return `
function mapTypeOrmError(err: unknown, res: import('express').Response): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  const anyErr = err as { code?: string | number; driverError?: { code?: string | number; message?: string } };
  const code = anyErr?.driverError?.code ?? anyErr?.code;
  const detail = String(anyErr?.driverError?.message ?? msg);
  if (
    code === 'SQLITE_CONSTRAINT' ||
    code === '23503' ||
    code === 'ER_NO_REFERENCED_ROW_2' ||
    code === 1452 ||
    /FOREIGN KEY constraint failed/i.test(detail) ||
    /foreign key constraint/i.test(detail)
  ) {
    res.status(409).json({ error: 'Foreign key constraint failed' });
    return true;
  }
  if (
    code === '23505' ||
    code === 'ER_DUP_ENTRY' ||
    code === 1062 ||
    /UNIQUE constraint failed/i.test(detail) ||
    /duplicate key/i.test(detail)
  ) {
    res.status(409).json({ error: 'Conflict' });
    return true;
  }
  return false;
}
`;
}

/** Nest helper: throw HTTP exceptions for TypeORM driver errors. */
export function renderTypeOrmNestErrorMapper(): string {
  return `
function rethrowTypeOrmHttp(err: unknown): never {
  const msg = err instanceof Error ? err.message : String(err);
  const anyErr = err as { code?: string | number; driverError?: { code?: string | number; message?: string } };
  const code = anyErr?.driverError?.code ?? anyErr?.code;
  const detail = String(anyErr?.driverError?.message ?? msg);
  if (
    code === 'SQLITE_CONSTRAINT' ||
    code === '23503' ||
    code === 'ER_NO_REFERENCED_ROW_2' ||
    code === 1452 ||
    /FOREIGN KEY constraint failed/i.test(detail) ||
    /foreign key constraint/i.test(detail)
  ) {
    throw new ConflictException('Foreign key constraint failed');
  }
  if (
    code === '23505' ||
    code === 'ER_DUP_ENTRY' ||
    code === 1062 ||
    /UNIQUE constraint failed/i.test(detail) ||
    /duplicate key/i.test(detail)
  ) {
    throw new ConflictException('Conflict');
  }
  throw err;
}
`;
}

export const TYPEORM_MIGRATION_README = `## Schema changes (production-safe)

\`synchronize\` is **off** unless \`TYPEORM_SYNC=true\` (local/dev only). Do not enable sync in production.

1. Edit entities under \`src/entities/\`
2. Generate a migration after pointing DataSource at a real DB:
   \`\`\`bash
   npm run migration:generate -- src/migrations/NameYourChange
   \`\`\`
3. Review the generated SQL, then apply:
   \`\`\`bash
   npm run migration:run
   \`\`\`
4. Revert last migration if needed: \`npm run migration:revert\`

Dialect defaults follow \`SchemaModel.dialect\` in \`.env.example\` (\`DB_TYPE\`, host/port). Keep migrations checked in for production deploys.
`;
