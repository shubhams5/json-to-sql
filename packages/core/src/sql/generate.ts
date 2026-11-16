import { getDialect } from "../dialects/index.js";
import type {
  DbDialectId,
  GenerateDmlOptions,
  JsonObject,
  JsonValue,
  SchemaModel,
  TableModel,
} from "../types.js";

function isNullish(value: unknown): value is null | undefined {
  return value === null || value === undefined;
}

function literalOrNull(
  dialect: ReturnType<typeof getDialect>,
  value: JsonValue | undefined
): string {
  if (isNullish(value)) return "NULL";
  return dialect.quoteLiteral(value);
}

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
    columns: columnOverride,
  } = options;

  if (!data.length || !tableName) return "";

  const dialect = getDialect(dbType);
  const columns = columnOverride?.length
    ? columnOverride
    : [...new Set(data.flatMap((row) => Object.keys(row)))];
  const conditionColNames = conditionColumns.filter(Boolean);
  const qTable = dialect.quoteIdent(tableName);
  const qPrimaryKey = primaryKey ? dialect.quoteIdent(primaryKey) : "";

  const valueColumns = (rowKeys: string[]) =>
    rowKeys.filter((col) => {
      if (operation === "UPDATE" && col === primaryKey) return false;
      if (excludePrimaryKeyOnInsert && operation === "INSERT" && col === primaryKey) return false;
      return true;
    });

  const insertCols = valueColumns(columns);
  const qColumns = insertCols.map((col) => dialect.quoteIdent(col));

  const extraWhere = (row: JsonObject) =>
    conditionColNames
      .map((col) => {
        const v = row[col];
        if (isNullish(v)) return ` AND ${dialect.quoteIdent(col)} IS NULL`;
        return ` AND ${dialect.quoteIdent(col)} = ${dialect.quoteLiteral(v)}`;
      })
      .join("");

  if (operation === "UPDATE") {
    if (!primaryKey) throw new Error("Primary key required for UPDATE");
    const setCols = valueColumns(columns);
    return data
      .map((row) => {
        if (!setCols.length) throw new Error(`UPDATE on ${tableName} has no columns to set`);
        const sets = setCols
          .map((col) => `${dialect.quoteIdent(col)} = ${literalOrNull(dialect, row[col])}`)
          .join(", ");
        return `UPDATE ${qTable} SET ${sets} WHERE ${qPrimaryKey} = ${literalOrNull(dialect, row[primaryKey])}${extraWhere(row)};`;
      })
      .join("\n");
  }

  if (operation === "INSERT") {
    if (!insertCols.length) {
      return data.map(() => `INSERT INTO ${qTable} DEFAULT VALUES;`).join("\n");
    }
    if (batchInsert) {
      // MSSQL max 1000 rows per INSERT
      const chunkSize = dbType === "mssql" ? 1000 : data.length;
      const chunks: string[] = [];
      for (let i = 0; i < data.length; i += chunkSize) {
        const slice = data.slice(i, i + chunkSize);
        const values = slice
          .map(
            (row) =>
              `(${insertCols.map((col) => literalOrNull(dialect, row[col])).join(", ")})`
          )
          .join(",\n");
        chunks.push(`INSERT INTO ${qTable} (${qColumns.join(", ")}) VALUES\n${values};`);
      }
      return chunks.join("\n");
    }
    return data
      .map(
        (row) =>
          `INSERT INTO ${qTable} (${qColumns.join(", ")}) VALUES (${insertCols
            .map((col) => literalOrNull(dialect, row[col]))
            .join(", ")});`
      )
      .join("\n");
  }

  if (operation === "DELETE") {
    if (!primaryKey) throw new Error("Primary key required for DELETE");
    if (batchInsert && conditionColNames.length === 0) {
      const pkValues = data.map((row) => literalOrNull(dialect, row[primaryKey])).join(", ");
      return `DELETE FROM ${qTable} WHERE ${qPrimaryKey} IN (${pkValues});`;
    }
    return data
      .map(
        (row) =>
          `DELETE FROM ${qTable} WHERE ${qPrimaryKey} = ${literalOrNull(dialect, row[primaryKey])}${extraWhere(row)};`
      )
      .join("\n");
  }

  return "";
}

/** @deprecated alias preserving older call shape */
export function generateSQL(options: GenerateDmlOptions): string {
  return generateDml(options);
}

export function orderTables(tables: TableModel[]): TableModel[] {
  const byName = new Map(tables.map((t) => [t.name, t]));
  const visiting = new Set<string>();
  const done = new Set<string>();
  const result: TableModel[] = [];
  const cycleWarnings: string[] = [];

  function visit(name: string) {
    if (done.has(name) || !byName.has(name)) return;
    if (visiting.has(name)) {
      cycleWarnings.push(name);
      return;
    }
    visiting.add(name);
    const table = byName.get(name)!;
    for (const fk of table.foreignKeys) visit(fk.refTable);
    visiting.delete(name);
    done.add(name);
    result.push(table);
  }

  for (const table of tables) visit(table.name);
  if (cycleWarnings.length) {
    // Still return partial order; callers may inspect length
  }
  return result;
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

/** Direct nested key linking parent sourcePath to child sourcePath. */
export function nestedKeyFromPath(parentPath: string, childPath: string): string | null {
  let suffix: string;
  if (parentPath === "$") {
    if (!childPath.startsWith("$.")) return null;
    suffix = childPath.slice(2);
  } else if (childPath.startsWith(parentPath + ".")) {
    suffix = childPath.slice(parentPath.length + 1);
  } else {
    return null;
  }
  const segment = suffix.split(".")[0] ?? "";
  const key = segment.replace(/\[\]$/, "");
  // Only direct children (no further path after first segment)
  const rest = suffix.slice(segment.length);
  if (rest.startsWith(".")) return null;
  return key || null;
}

/**
 * Walk original JSON using schema sourcePath and emit INSERT rows for all tables
 * in FK dependency order, preserving parent-child keys.
 */
export function planRelationalInserts(
  schema: SchemaModel,
  rootRows: JsonObject[]
): Map<string, JsonObject[]> {
  const planned = new Map<string, JsonObject[]>();
  const byName = new Map(schema.tables.map((t) => [t.name, t]));
  const seqCounters = new Map<string, number>();

  function nextSeq(tableName: string): number {
    const n = (seqCounters.get(tableName) ?? 0) + 1;
    seqCounters.set(tableName, n);
    return n;
  }

  function append(tableName: string, row: JsonObject) {
    const list = planned.get(tableName) ?? [];
    list.push(row);
    planned.set(tableName, list);
  }

  function childrenOf(parent: TableModel): TableModel[] {
    return schema.tables.filter((t) => t.foreignKeys.some((fk) => fk.refTable === parent.name));
  }

  function process(table: TableModel, rows: JsonObject[], parentFk?: { column: string; value: JsonValue }) {
    const pk = table.primaryKey[0] ?? "id";
    const pkCol = table.columns.find((c) => c.name === pk);
    const schemaCols = table.columns.filter((c) => !c.isExcluded);

    for (const row of rows) {
      const insertRow: JsonObject = {};

      for (const col of schemaCols) {
        if (parentFk && col.name === parentFk.column) {
          insertRow[col.name] = parentFk.value;
          continue;
        }
        const rawKey = col.originalName || col.name;
        if (Object.prototype.hasOwnProperty.call(row, rawKey)) {
          const v = row[rawKey];
          // Skip nested objects/arrays that became child tables
          const isNestedParent =
            (typeof v === "object" && v !== null) &&
            childrenOf(table).some((child) => nestedKeyFromPath(table.sourcePath, child.sourcePath) === rawKey);
          if (isNestedParent) continue;
          insertRow[col.name] = v as JsonValue;
        }
      }

      // Assign PK if missing
      if (!(pk in insertRow) || isNullish(insertRow[pk])) {
        if (pkCol?.autoIncrement || pkCol?.inferredType === "integer") {
          insertRow[pk] = nextSeq(table.name);
        } else {
          insertRow[pk] = nextSeq(table.name);
        }
      }

      append(table.name, insertRow);

      const pkValue = insertRow[pk];
      for (const child of childrenOf(table)) {
        const fk = child.foreignKeys.find((f) => f.refTable === table.name)!;
        const key = nestedKeyFromPath(table.sourcePath, child.sourcePath);
        if (!key) continue;
        const nested = row[key];
        if (nested !== null && typeof nested === "object" && !Array.isArray(nested)) {
          process(child, [nested as JsonObject], { column: fk.columns[0], value: pkValue });
        } else if (Array.isArray(nested)) {
          const objs = nested.filter(
            (v): v is JsonObject => v !== null && typeof v === "object" && !Array.isArray(v)
          );
          if (objs.length) {
            process(child, objs, { column: fk.columns[0], value: pkValue });
          }
        }
      }
    }
  }

  const root = byName.get(schema.rootTableName) ?? schema.tables[0];
  if (root && rootRows.length) {
    process(root, rootRows);
  }
  return planned;
}

export function generateRelationalInserts(schema: SchemaModel, rootRows: JsonObject[]): string {
  const planned = planRelationalInserts(schema, rootRows);
  const ordered = orderTables(schema.tables);
  const parts: string[] = [];

  for (const table of ordered) {
    const rows = planned.get(table.name);
    if (!rows?.length) continue;
    const cols = table.columns.filter((c) => !c.isExcluded).map((c) => c.name);
    const pkCol = table.columns.find((c) => c.isPrimaryKey);
    // Include PK values so FKs resolve; only exclude when auto-increment AND we want DB to assign —
    // relational planner always supplies ids for FK integrity.
    const excludePk = false;
    parts.push(
      generateDml({
        data: rows,
        tableName: table.name,
        primaryKey: table.primaryKey[0],
        operation: "INSERT",
        batchInsert: true,
        dbType: schema.dialect,
        excludePrimaryKeyOnInsert: excludePk,
        columns: cols.filter((c) => rows.some((r) => c in r && r[c] !== undefined)),
      })
    );
    void pkCol;
  }

  return parts.filter(Boolean).join("\n\n");
}

export function generateSelectWithJoins(schema: SchemaModel, tableName?: string): string {
  const dialect = getDialect(schema.dialect);
  const root = schema.tables.find((t) => t.name === (tableName ?? schema.rootTableName)) ?? schema.tables[0];
  if (!root) return "";

  let aliasIdx = 0;
  const aliasFor = () => `t${aliasIdx++}`;
  const rootAlias = aliasFor();

  const selectCols = root.columns
    .filter((c) => !c.isExcluded)
    .map((c) => `${rootAlias}.${dialect.quoteIdent(c.name)} AS ${dialect.quoteIdent(`${root.name}_${c.name}`)}`);

  const joins: string[] = [];
  const childSelect: string[] = [];

  for (const child of schema.tables) {
    for (const fk of child.foreignKeys) {
      if (fk.refTable !== root.name) continue;
      const childAlias = aliasFor();
      joins.push(
        `LEFT JOIN ${dialect.quoteIdent(child.name)} ${childAlias} ON ${childAlias}.${dialect.quoteIdent(fk.columns[0])} = ${rootAlias}.${dialect.quoteIdent(fk.refColumns[0])}`
      );
      for (const col of child.columns.filter((c) => !c.isExcluded)) {
        childSelect.push(
          `${childAlias}.${dialect.quoteIdent(col.name)} AS ${dialect.quoteIdent(`${child.name}_${col.name}`)}`
        );
      }
    }
  }

  const allSelect = [...selectCols, ...childSelect].filter(Boolean).join(",\n  ");
  if (!allSelect) return `-- No columns to select from ${root.name}`;
  return `SELECT\n  ${allSelect}\nFROM ${dialect.quoteIdent(root.name)} ${rootAlias}\n${joins.join("\n")};`;
}

export function generateParameterizedCrud(schema: SchemaModel, tableName?: string): string {
  const dialect = getDialect(schema.dialect);
  const table = schema.tables.find((t) => t.name === (tableName ?? schema.rootTableName)) ?? schema.tables[0];
  if (!table) return "";
  const pkSet = new Set(table.primaryKey);
  const cols = table.columns.filter((c) => !c.isExcluded && !c.autoIncrement);
  const updateCols = cols.filter((c) => !pkSet.has(c.name));
  const pk = table.primaryKey[0] ?? "id";
  const placeholders = cols.map((_, i) => paramPlaceholder(schema.dialect, i + 1));
  const setClause = updateCols
    .map((c, i) => `${dialect.quoteIdent(c.name)} = ${paramPlaceholder(schema.dialect, i + 1)}`)
    .join(", ");

  const safeName = table.name.replace(/[\r\n]/g, " ");
  return [
    `-- Parameterized templates for ${safeName} (${dialect.label})`,
    cols.length
      ? `INSERT INTO ${dialect.quoteIdent(table.name)} (${cols.map((c) => dialect.quoteIdent(c.name)).join(", ")}) VALUES (${placeholders.join(", ")});`
      : `INSERT INTO ${dialect.quoteIdent(table.name)} DEFAULT VALUES;`,
    updateCols.length
      ? `UPDATE ${dialect.quoteIdent(table.name)} SET ${setClause} WHERE ${dialect.quoteIdent(pk)} = ${paramPlaceholder(schema.dialect, updateCols.length + 1)};`
      : `-- No updatable columns for ${safeName}`,
    `DELETE FROM ${dialect.quoteIdent(table.name)} WHERE ${dialect.quoteIdent(pk)} = ${paramPlaceholder(schema.dialect, 1)};`,
    `SELECT * FROM ${dialect.quoteIdent(table.name)} WHERE ${dialect.quoteIdent(pk)} = ${paramPlaceholder(schema.dialect, 1)};`,
  ].join("\n\n");
}

function paramPlaceholder(dialect: DbDialectId, index: number): string {
  if (dialect === "postgres") return `$${index}`;
  if (dialect === "mssql") return `@p${index}`;
  return "?";
}

export function generateFullSqlBundle(schema: SchemaModel, data: JsonObject[]): string {
  const dialect = getDialect(schema.dialect);
  const parts = [
    `-- Generated by json-to-sql (${dialect.label})`,
    `-- WARNING: Review before executing. This tool never runs SQL automatically.`,
  ];
  if (schema.warnings?.length) {
    parts.push(...schema.warnings.map((w) => `-- WARN: ${w.replace(/\r?\n/g, " ")}`));
  }
  parts.push(generateDropSchema(schema), generateCreateSchema(schema));

  if (data.length) {
    const inserts = generateRelationalInserts(schema, data);
    if (inserts) parts.push(inserts);
    parts.push(generateSelectWithJoins(schema));
    parts.push(generateParameterizedCrud(schema));
  }

  return parts.filter(Boolean).join("\n\n");
}
