import { getDialect } from "../dialects/index.js";
import type {
  DbDialectId,
  GenerateDmlOptions,
  JsonObject,
  SchemaModel,
  TableModel,
} from "../types.js";

export function generateDml(options: GenerateDmlOptions): string {
  const {
    data,
    tableName,
    primaryKey = "",
    operation,
    batchInsert = true,
    dbType,
    conditionColumns = [],
    excludePrimaryKeyOnInsert = true,
  } = options;

  if (!data.length || !tableName) return "";

  const dialect = getDialect(dbType);
  const columns = Object.keys(data[0]);
  const conditionColNames = conditionColumns.filter(Boolean);
  const qTable = dialect.quoteIdent(tableName);
  const qPrimaryKey = primaryKey ? dialect.quoteIdent(primaryKey) : "";

  const valueColumns = (rowKeys: string[]) =>
    rowKeys.filter((col) => {
      if (conditionColNames.includes(col)) return false;
      if (excludePrimaryKeyOnInsert && operation === "INSERT" && col === primaryKey) return false;
      if (operation === "UPDATE" && col === primaryKey) return false;
      return true;
    });

  const qColumns = valueColumns(columns).map((col) => dialect.quoteIdent(col));

  const extraWhere = (row: JsonObject) =>
    conditionColNames
      .map((col) => ` AND ${dialect.quoteIdent(col)} = ${dialect.quoteLiteral(row[col])}`)
      .join("");

  if (operation === "UPDATE") {
    if (!primaryKey) return "-- Please select a primary key for UPDATE";
    return data
      .map((row) => {
        const sets = valueColumns(columns)
          .map((col) => `${dialect.quoteIdent(col)} = ${dialect.quoteLiteral(row[col])}`)
          .join(", ");
        return `UPDATE ${qTable} SET ${sets} WHERE ${qPrimaryKey} = ${dialect.quoteLiteral(row[primaryKey])}${extraWhere(row)};`;
      })
      .join("\n");
  }

  if (operation === "INSERT") {
    if (batchInsert) {
      const values = data
        .map(
          (row) =>
            `(${valueColumns(columns)
              .map((col) => dialect.quoteLiteral(row[col]))
              .join(", ")})`
        )
        .join(",\n");
      return `INSERT INTO ${qTable} (${qColumns.join(", ")}) VALUES\n${values};`;
    }
    return data
      .map(
        (row) =>
          `INSERT INTO ${qTable} (${qColumns.join(", ")}) VALUES (${valueColumns(columns)
            .map((col) => dialect.quoteLiteral(row[col]))
            .join(", ")});`
      )
      .join("\n");
  }

  if (operation === "DELETE") {
    if (!primaryKey) return "-- Please select a primary key for DELETE";
    if (batchInsert) {
      const pkValues = data.map((row) => dialect.quoteLiteral(row[primaryKey])).join(", ");
      return `DELETE FROM ${qTable} WHERE ${qPrimaryKey} IN (${pkValues});`;
    }
    return data
      .map(
        (row) =>
          `DELETE FROM ${qTable} WHERE ${qPrimaryKey} = ${dialect.quoteLiteral(row[primaryKey])}${extraWhere(row)};`
      )
      .join("\n");
  }

  return "";
}

/** @deprecated alias preserving older call shape */
export function generateSQL(options: GenerateDmlOptions): string {
  return generateDml(options);
}

export function generateCreateSchema(schema: SchemaModel): string {
  const dialect = getDialect(schema.dialect);
  const ordered = orderTables(schema.tables);
  const parts: string[] = [];
  for (const table of ordered) {
    parts.push(dialect.createTable(table));
    for (const index of table.indexes) {
      parts.push(dialect.createIndex(table, index));
    }
  }
  return parts.join("\n\n");
}

export function generateDropSchema(schema: SchemaModel): string {
  const dialect = getDialect(schema.dialect);
  const ordered = [...orderTables(schema.tables)].reverse();
  return ordered.map((table) => dialect.dropTable(table, true)).join("\n");
}

export function generateSelectWithJoins(schema: SchemaModel, tableName?: string): string {
  const dialect = getDialect(schema.dialect);
  const root = schema.tables.find((t) => t.name === (tableName ?? schema.rootTableName)) ?? schema.tables[0];
  if (!root) return "";

  const aliasFor = (name: string) => name.slice(0, 1) || "t";
  const rootAlias = aliasFor(root.name);
  const selectCols = root.columns
    .filter((c) => !c.isExcluded)
    .map((c) => `${rootAlias}.${dialect.quoteIdent(c.name)}`)
    .join(", ");

  const joins: string[] = [];
  for (const child of schema.tables) {
    for (const fk of child.foreignKeys) {
      if (fk.refTable !== root.name) continue;
      const childAlias = aliasFor(child.name) + "_" + child.name.slice(0, 3);
      joins.push(
        `LEFT JOIN ${dialect.quoteIdent(child.name)} ${childAlias} ON ${childAlias}.${dialect.quoteIdent(fk.columns[0])} = ${rootAlias}.${dialect.quoteIdent(fk.refColumns[0])}`
      );
      for (const col of child.columns.filter((c) => !c.isExcluded)) {
        // include child cols
      }
    }
  }

  const childSelect = schema.tables
    .filter((t) => t.foreignKeys.some((fk) => fk.refTable === root.name))
    .flatMap((child) => {
      const childAlias = aliasFor(child.name) + "_" + child.name.slice(0, 3);
      return child.columns
        .filter((c) => !c.isExcluded)
        .map((c) => `${childAlias}.${dialect.quoteIdent(c.name)} AS ${dialect.quoteIdent(`${child.name}_${c.name}`)}`);
    });

  const allSelect = [selectCols, ...childSelect].filter(Boolean).join(",\n  ");
  return `SELECT\n  ${allSelect}\nFROM ${dialect.quoteIdent(root.name)} ${rootAlias}\n${joins.join("\n")};`;
}

export function generateParameterizedCrud(schema: SchemaModel, tableName?: string): string {
  const dialect = getDialect(schema.dialect);
  const table = schema.tables.find((t) => t.name === (tableName ?? schema.rootTableName)) ?? schema.tables[0];
  if (!table) return "";
  const cols = table.columns.filter((c) => !c.isExcluded && !c.autoIncrement);
  const pk = table.primaryKey[0] ?? "id";
  const placeholders = cols.map((_, i) => paramPlaceholder(schema.dialect, i + 1));
  const setClause = cols.map((c, i) => `${dialect.quoteIdent(c.name)} = ${paramPlaceholder(schema.dialect, i + 1)}`).join(", ");

  return [
    `-- Parameterized templates for ${table.name} (${dialect.label})`,
    `INSERT INTO ${dialect.quoteIdent(table.name)} (${cols.map((c) => dialect.quoteIdent(c.name)).join(", ")}) VALUES (${placeholders.join(", ")});`,
    `UPDATE ${dialect.quoteIdent(table.name)} SET ${setClause} WHERE ${dialect.quoteIdent(pk)} = ${paramPlaceholder(schema.dialect, cols.length + 1)};`,
    `DELETE FROM ${dialect.quoteIdent(table.name)} WHERE ${dialect.quoteIdent(pk)} = ${paramPlaceholder(schema.dialect, 1)};`,
    `SELECT * FROM ${dialect.quoteIdent(table.name)} WHERE ${dialect.quoteIdent(pk)} = ${paramPlaceholder(schema.dialect, 1)};`,
  ].join("\n\n");
}

function paramPlaceholder(dialect: DbDialectId, index: number): string {
  if (dialect === "postgres") return `$${index}`;
  if (dialect === "mssql") return `@p${index}`;
  return "?";
}

function orderTables(tables: TableModel[]): TableModel[] {
  const byName = new Map(tables.map((t) => [t.name, t]));
  const visiting = new Set<string>();
  const done = new Set<string>();
  const result: TableModel[] = [];

  function visit(name: string) {
    if (done.has(name) || !byName.has(name)) return;
    if (visiting.has(name)) return;
    visiting.add(name);
    const table = byName.get(name)!;
    for (const fk of table.foreignKeys) visit(fk.refTable);
    visiting.delete(name);
    done.add(name);
    result.push(table);
  }

  for (const table of tables) visit(table.name);
  return result;
}

export function generateFullSqlBundle(schema: SchemaModel, data: JsonObject[]): string {
  const dialect = getDialect(schema.dialect);
  const root = schema.tables.find((t) => t.name === schema.rootTableName) ?? schema.tables[0];
  const parts = [
    `-- Generated by json-to-sql (${dialect.label})`,
    `-- WARNING: Review before executing. This tool never runs SQL automatically.`,
    generateDropSchema(schema),
    generateCreateSchema(schema),
  ];

  if (root && data.length) {
    parts.push(
      generateDml({
        data,
        tableName: root.name,
        primaryKey: root.primaryKey[0],
        operation: "INSERT",
        batchInsert: true,
        dbType: schema.dialect,
        excludePrimaryKeyOnInsert: Boolean(root.columns.find((c) => c.isPrimaryKey)?.autoIncrement),
      })
    );
    parts.push(generateSelectWithJoins(schema));
    parts.push(generateParameterizedCrud(schema));
  }

  return parts.filter(Boolean).join("\n\n");
}
