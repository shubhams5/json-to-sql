import {
  camel,
  isSafeIdent,
  jsString,
  parseDecimalPrecision,
  pascal,
  safeFileSegment,
} from "../codegen/safe.js";
import type { ColumnModel, ForeignKeyModel, ReferentialAction, SchemaModel, TableModel } from "../types.js";

function prismaFieldName(col: ColumnModel): string {
  return isSafeIdent(col.name) ? col.name : safeFileSegment(col.name);
}

function prismaAction(action: ReferentialAction): string {
  switch (action) {
    case "CASCADE":
      return "Cascade";
    case "RESTRICT":
      return "Restrict";
    case "SET NULL":
      return "SetNull";
    case "SET DEFAULT":
      return "SetDefault";
    case "NO ACTION":
    default:
      return "NoAction";
  }
}

export function prismaScalarType(col: ColumnModel): { type: string; attrs: string[] } {
  const t = (col.sqlType || col.inferredType).toLowerCase();
  const attrs: string[] = [];
  if (t.includes("decimal") || t.includes("numeric") || t.includes("money")) {
    const ps = parseDecimalPrecision(col.sqlType);
    if (ps) attrs.push(`@db.Decimal(${ps.precision}, ${ps.scale})`);
    return { type: "Decimal", attrs };
  }
  if (t.includes("uuid") || t === "uniqueidentifier") return { type: "String", attrs: ["@db.Uuid"] };
  if (t.includes("tinyint(1)") || t === "bit" || t.includes("bool")) return { type: "Boolean", attrs: [] };
  if (t.includes("bigint")) return { type: "BigInt", attrs: [] };
  if (t.includes("int") || t.includes("serial")) return { type: "Int", attrs: [] };
  if (t.includes("double") || t.includes("float") || t.includes("real")) return { type: "Float", attrs: [] };
  if (t.includes("json")) return { type: "Json", attrs: [] };
  if (t.includes("date") || t.includes("time")) return { type: "DateTime", attrs: [] };
  return { type: "String", attrs: [] };
}

function relationFieldName(fk: ForeignKeyModel, used: Set<string>): string {
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

function prismaProvider(dialect: SchemaModel["dialect"]): string {
  if (dialect === "postgres") return "postgresql";
  if (dialect === "mysql") return "mysql";
  if (dialect === "mssql") return "sqlserver";
  return "sqlite";
}

export function databaseUrlExample(dialect: SchemaModel["dialect"]): string {
  if (dialect === "sqlite") return 'DATABASE_URL="file:./dev.db"\nPORT=3000\n';
  if (dialect === "mysql") return 'DATABASE_URL="mysql://user:pass@localhost:3306/app"\nPORT=3000\n';
  if (dialect === "mssql") {
    return 'DATABASE_URL="sqlserver://localhost:1433;database=app;user=sa;password=pass;encrypt=true"\nPORT=3000\n';
  }
  return 'DATABASE_URL="postgresql://user:pass@localhost:5432/app"\nPORT=3000\n';
}

export function writableColumns(table: TableModel): ColumnModel[] {
  const pk = new Set(table.primaryKey);
  return table.columns.filter((c) => !c.isExcluded && !c.autoIncrement && !pk.has(c.name));
}

export function stringSearchColumns(table: TableModel): string[] {
  return table.columns
    .filter((c) => {
      if (c.isExcluded) return false;
      const t = (c.sqlType || c.inferredType).toLowerCase();
      return t.includes("char") || t.includes("text") || t === "string" || c.inferredType === "string";
    })
    .map((c) => c.name);
}

export function renderPrismaSchema(schema: SchemaModel): string {
  for (const table of schema.tables) {
    if (!table.primaryKey.length) {
      throw new Error(`Cannot generate Prisma schema: table ${table.name} has no primary key`);
    }
    for (const fk of table.foreignKeys) {
      if (fk.columns.length !== fk.refColumns.length) {
        throw new Error(`Cannot generate Prisma schema: FK ${fk.name} has unequal column counts`);
      }
    }
  }

  type ModelBuild = { name: string; model: string; fieldLines: string[] };
  const builds: ModelBuild[] = [];
  const backFields = new Map<string, string[]>();

  for (const table of schema.tables) {
    const model = pascal(table.name);
    const usedFieldNames = new Set<string>();
    const fieldLines: string[] = [];
    const pkCols = table.primaryKey;
    const isCompositePk = pkCols.length > 1;

    for (const col of table.columns.filter((c) => !c.isExcluded)) {
      const field = prismaFieldName(col);
      usedFieldNames.add(field);
      const { type, attrs } = prismaScalarType(col);
      const optional = col.nullable && !col.isPrimaryKey ? "?" : "";
      const colAttrs = [...attrs];
      if (!isCompositePk && col.isPrimaryKey) colAttrs.unshift("@id");
      if (col.autoIncrement && type === "Int") colAttrs.push("@default(autoincrement())");
      if (col.isUnique && !col.isPrimaryKey) colAttrs.push("@unique");
      if (field !== col.name) colAttrs.push(`@map(${jsString(col.name)})`);
      fieldLines.push(`  ${field} ${type}${optional}${colAttrs.length ? " " + colAttrs.join(" ") : ""}`);
    }

    for (const fk of table.foreignKeys) {
      const relName = relationFieldName(fk, usedFieldNames);
      const fkNullable = fk.columns.every((c) => table.columns.find((col) => col.name === c)?.nullable);
      const relType = `${pascal(fk.refTable)}${fkNullable ? "?" : ""}`;
      const fields = fk.columns.map((c) => {
        const col = table.columns.find((x) => x.name === c);
        return prismaFieldName(col ?? ({ name: c } as ColumnModel));
      });
      const refs = fk.refColumns.map((c) => {
        const refTable = schema.tables.find((t) => t.name === fk.refTable);
        const col = refTable?.columns.find((x) => x.name === c);
        return prismaFieldName(col ?? ({ name: c } as ColumnModel));
      });
      fieldLines.push(
        `  ${relName} ${relType} @relation(${jsString(fk.name)}, fields: [${fields.join(", ")}], references: [${refs.join(", ")}], onDelete: ${prismaAction(fk.onDelete)}, onUpdate: ${prismaAction(fk.onUpdate)})`
      );

      const parentLines = backFields.get(fk.refTable) ?? [];
      let backName = camel(table.name);
      let i = 2;
      while (parentLines.some((l) => l.startsWith(`  ${backName} `))) {
        backName = `${camel(table.name)}${i++}`;
      }
      parentLines.push(`  ${backName} ${model}[] @relation(${jsString(fk.name)})`);
      backFields.set(fk.refTable, parentLines);
    }

    if (isCompositePk) {
      fieldLines.push(
        `  @@id([${pkCols.map((c) => prismaFieldName(table.columns.find((x) => x.name === c)!)).join(", ")}])`
      );
    }
    for (const index of table.indexes) {
      const cols = index.columns
        .map((c) => prismaFieldName(table.columns.find((x) => x.name === c) ?? ({ name: c } as ColumnModel)))
        .join(", ");
      fieldLines.push(index.unique ? `  @@unique([${cols}])` : `  @@index([${cols}])`);
    }
    fieldLines.push(`  @@map(${jsString(table.name)})`);
    builds.push({ name: table.name, model, fieldLines });
  }

  const rendered = builds
    .map((m) => {
      const backs = backFields.get(m.name) ?? [];
      const lines = [...m.fieldLines];
      const mapIdx = lines.findIndex((l) => l.trim().startsWith("@@map"));
      if (backs.length) lines.splice(mapIdx >= 0 ? mapIdx : lines.length, 0, ...backs);
      return `model ${m.model} {\n${lines.join("\n")}\n}`;
    })
    .join("\n\n");

  return `generator client {\n  provider = "prisma-client-js"\n}\n\ndatasource db {\n  provider = "${prismaProvider(schema.dialect)}"\n  url      = env("DATABASE_URL")\n}\n\n${rendered}\n`;
}
