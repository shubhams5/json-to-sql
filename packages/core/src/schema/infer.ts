import { getDialect } from "../dialects/index.js";
import type {
  ColumnModel,
  DbDialectId,
  FieldStats,
  ForeignKeyModel,
  InferredPrimitiveType,
  JsonObject,
  JsonValue,
  SchemaModel,
  TableModel,
} from "../types.js";
import { getColumns } from "../json/parse.js";

function detectPrimitive(value: JsonValue): InferredPrimitiveType {
  if (value === null) return "null";
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "number") return Number.isInteger(value) ? "integer" : "number";
  if (typeof value === "string") return "string";
  if (Array.isArray(value)) return "array";
  if (typeof value === "object") return "object";
  return "unknown";
}

function mergeTypes(a: InferredPrimitiveType, b: InferredPrimitiveType): InferredPrimitiveType {
  if (a === b) return a;
  if (a === "null") return b;
  if (b === "null") return a;
  if ((a === "integer" && b === "number") || (a === "number" && b === "integer")) return "number";
  if (a === "object" || b === "object" || a === "array" || b === "array") return "json";
  return "string";
}

function collectFieldStats(rows: JsonObject[], key: string): FieldStats {
  const types: Record<string, number> = {};
  let present = 0;
  let nullCount = 0;
  const sampleValues: JsonValue[] = [];

  for (const row of rows) {
    if (!(key in row)) continue;
    present += 1;
    const value = row[key];
    if (value === null) {
      nullCount += 1;
      types.null = (types.null ?? 0) + 1;
    } else {
      const t = detectPrimitive(value);
      types[t] = (types[t] ?? 0) + 1;
      if (sampleValues.length < 5) sampleValues.push(value);
    }
  }

  return { present, nullCount, types, sampleValues };
}

function inferColumnType(stats: FieldStats): InferredPrimitiveType {
  const entries = Object.entries(stats.types).filter(([t]) => t !== "null");
  if (entries.length === 0) return "null";
  return entries.reduce(
    (acc, [t]) => mergeTypes(acc, t as InferredPrimitiveType),
    entries[0][0] as InferredPrimitiveType
  );
}

function slugify(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase() || "table";
}

function makeFkId(from: string, to: string): string {
  return `fk_${from}_${to}`;
}

export interface InferOptions {
  dialect: DbDialectId;
  rootTableName?: string;
  nestedStrategy?: "json_column" | "child_tables";
  primaryKeyHint?: string;
}

export function inferSchema(rows: JsonObject[], options: InferOptions): SchemaModel {
  const dialect = getDialect(options.dialect);
  const nestedStrategy = options.nestedStrategy ?? "child_tables";
  const rootTableName = slugify(options.rootTableName ?? "my_table");
  const tables: TableModel[] = [];

  function buildTable(name: string, sourcePath: string, tableRows: JsonObject[], parent?: { table: string; fkColumn: string }): TableModel {
    const keys = getColumns(tableRows);
    const columns: ColumnModel[] = [];

    if (parent) {
      columns.push({
        name: parent.fkColumn,
        originalName: parent.fkColumn,
        inferredType: "integer",
        sqlType: dialect.mapType("integer"),
        nullable: false,
        isPrimaryKey: false,
        isUnique: false,
        isExcluded: false,
      });
    }

    for (const key of keys) {
      const stats = collectFieldStats(tableRows, key);
      let inferredType = inferColumnType(stats);
      const nullable = stats.nullCount > 0 || stats.present < tableRows.length;

      if (nestedStrategy === "json_column" && (inferredType === "object" || inferredType === "array")) {
        inferredType = "json";
      }

      if (nestedStrategy === "child_tables" && inferredType === "object") {
        const childRows = tableRows
          .map((row) => row[key])
          .filter((v): v is JsonObject => v !== null && typeof v === "object" && !Array.isArray(v));
        if (childRows.length > 0) {
          const childName = slugify(`${name}_${key}`);
          const fkColumn = `${name}_id`;
          const child = buildTable(childName, `${sourcePath}.${key}`, childRows, {
            table: name,
            fkColumn,
          });
          child.foreignKeys.push({
            id: makeFkId(childName, name),
            name: makeFkId(childName, name),
            columns: [fkColumn],
            refTable: name,
            refColumns: ["id"],
            onDelete: "CASCADE",
            onUpdate: "NO ACTION",
          });
          tables.push(child);
          continue;
        }
      }

      if (nestedStrategy === "child_tables" && inferredType === "array") {
        const arrayValues = tableRows.flatMap((row) => {
          const v = row[key];
          return Array.isArray(v) ? v : [];
        });
        if (arrayValues.length > 0 && arrayValues.every((v) => v !== null && typeof v === "object" && !Array.isArray(v))) {
          const childName = slugify(`${name}_${key}`);
          const fkColumn = `${name}_id`;
          const child = buildTable(childName, `${sourcePath}.${key}[]`, arrayValues as JsonObject[], {
            table: name,
            fkColumn,
          });
          child.foreignKeys.push({
            id: makeFkId(childName, name),
            name: makeFkId(childName, name),
            columns: [fkColumn],
            refTable: name,
            refColumns: ["id"],
            onDelete: "CASCADE",
            onUpdate: "NO ACTION",
          } satisfies ForeignKeyModel);
          tables.push(child);
          continue;
        }
        inferredType = "json";
      }

      const isPkHint = options.primaryKeyHint === key || (key === "id" && !options.primaryKeyHint);
      columns.push({
        name: key,
        originalName: key,
        inferredType,
        sqlType: dialect.mapType(inferredType),
        nullable: isPkHint ? false : nullable,
        isPrimaryKey: Boolean(isPkHint),
        isUnique: Boolean(isPkHint),
        isExcluded: false,
        autoIncrement: Boolean(isPkHint && (inferredType === "integer" || inferredType === "number")),
        stats,
      });
    }

    if (!columns.some((c) => c.isPrimaryKey)) {
      columns.unshift({
        name: "id",
        originalName: "id",
        inferredType: "integer",
        sqlType: dialect.mapType("integer"),
        nullable: false,
        isPrimaryKey: true,
        isUnique: true,
        isExcluded: false,
        autoIncrement: true,
      });
    }

    return {
      name,
      originalName: name,
      columns,
      primaryKey: columns.filter((c) => c.isPrimaryKey).map((c) => c.name),
      foreignKeys: [],
      indexes: [],
      sourcePath,
    };
  }

  const root = buildTable(rootTableName, "$", rows);
  tables.unshift(root);

  return {
    tables,
    dialect: options.dialect,
    rootTableName,
    nestedStrategy,
  };
}

export function applyColumnOverride(
  schema: SchemaModel,
  tableName: string,
  columnName: string,
  patch: Partial<ColumnModel>
): SchemaModel {
  return {
    ...schema,
    tables: schema.tables.map((table) => {
      if (table.name !== tableName) return table;
      const columns = table.columns.map((col) => {
        if (col.name !== columnName) return col;
        const next = { ...col, ...patch };
        if (patch.inferredType && !patch.sqlType) {
          next.sqlType = getDialect(schema.dialect).mapType(patch.inferredType);
        }
        return next;
      });
      return {
        ...table,
        columns,
        primaryKey: columns.filter((c) => c.isPrimaryKey).map((c) => c.name),
      };
    }),
  };
}

export function renameTable(schema: SchemaModel, oldName: string, newName: string): SchemaModel {
  const name = slugify(newName);
  return {
    ...schema,
    rootTableName: schema.rootTableName === oldName ? name : schema.rootTableName,
    tables: schema.tables.map((table) => {
      const renamed = table.name === oldName ? { ...table, name } : table;
      return {
        ...renamed,
        foreignKeys: renamed.foreignKeys.map((fk) => ({
          ...fk,
          refTable: fk.refTable === oldName ? name : fk.refTable,
        })),
      };
    }),
  };
}
