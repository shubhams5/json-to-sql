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
  SchemaValidationIssue,
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

/** Order-independent merge; json absorbs object/array/mixed. */
export function mergeTypes(a: InferredPrimitiveType, b: InferredPrimitiveType): InferredPrimitiveType {
  if (a === b) return a;
  if (a === "null") return b;
  if (b === "null") return a;
  if (a === "json" || b === "json") return "json";
  if ((a === "integer" && b === "number") || (a === "number" && b === "integer")) return "number";
  if (a === "object" || b === "object" || a === "array" || b === "array") return "json";
  if (a === "unknown") return b;
  if (b === "unknown") return a;
  return "string";
}

function collectFieldStats(rows: JsonObject[], key: string): FieldStats {
  const types: Record<string, number> = {};
  let present = 0;
  let nullCount = 0;
  const sampleValues: JsonValue[] = [];

  for (const row of rows) {
    if (!Object.prototype.hasOwnProperty.call(row, key)) continue;
    present += 1;
    const value = row[key];
    if (value === null) {
      nullCount += 1;
      types.null = (types.null ?? 0) + 1;
    } else {
      const t = detectPrimitive(value);
      types[t] = (types[t] ?? 0) + 1;
      if (sampleValues.length < 5) {
        // Avoid storing large nested objects in stats
        sampleValues.push(typeof value === "object" ? detectPrimitive(value) : value);
      }
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

export function slugify(name: string): string {
  const cleaned = name
    .replace(/[^a-zA-Z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
  if (!cleaned) return "table";
  if (/^[0-9]/.test(cleaned)) return `t_${cleaned}`;
  return cleaned.slice(0, 63);
}

function uniqueName(base: string, used: Set<string>): string {
  let candidate = slugify(base).slice(0, 63);
  if (!used.has(candidate)) {
    used.add(candidate);
    return candidate;
  }
  let i = 2;
  while (i < 10000) {
    const suffix = `_${i}`;
    const truncated = slugify(base).slice(0, Math.max(1, 63 - suffix.length)) + suffix;
    if (!used.has(truncated)) {
      used.add(truncated);
      return truncated;
    }
    i += 1;
  }
  throw new Error(`Unable to allocate unique name for ${base}`);
}

function makeFkId(from: string, to: string): string {
  return slugify(`fk_${from}_${to}`).slice(0, 63);
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
  const usedTableNames = new Set<string>();
  const rootTableName = uniqueName(options.rootTableName ?? "my_table", usedTableNames);
  const tables: TableModel[] = [];
  const warnings: string[] = [];
  const tableByName = new Map<string, TableModel>();

  function parentPkInfo(parentName: string): { columns: string[]; sqlType: string; inferredType: InferredPrimitiveType } {
    const parent = tableByName.get(parentName);
    if (!parent || !parent.primaryKey.length) {
      return { columns: ["id"], sqlType: dialect.mapType("integer"), inferredType: "integer" };
    }
    const pkCol = parent.columns.find((c) => c.name === parent.primaryKey[0]);
    return {
      columns: [...parent.primaryKey],
      sqlType: pkCol?.sqlType ?? dialect.mapType("integer"),
      inferredType: pkCol?.inferredType ?? "integer",
    };
  }

  function buildTable(
    name: string,
    sourcePath: string,
    tableRows: JsonObject[],
    parent?: { table: string; fkColumn: string },
    isRoot = false
  ): TableModel {
    const keys = getColumns(tableRows);
    const columns: ColumnModel[] = [];
    const usedColNames = new Set<string>();

    if (parent) {
      const pk = parentPkInfo(parent.table);
      const fkName = uniqueName(parent.fkColumn, usedColNames);
      columns.push({
        name: fkName,
        originalName: parent.fkColumn,
        inferredType: pk.inferredType,
        sqlType: pk.sqlType,
        nullable: false,
        isPrimaryKey: false,
        isUnique: false,
        isExcluded: false,
      });
      // keep parent.fkColumn in sync if renamed for uniqueness
      parent.fkColumn = fkName;
    }

    for (const key of keys) {
      if (parent && key === parent.fkColumn) continue;

      const stats = collectFieldStats(tableRows, key);
      let inferredType = inferColumnType(stats);
      const nullable = stats.nullCount > 0 || stats.present < tableRows.length;

      const nonNullTypes = Object.keys(stats.types).filter((t) => t !== "null");
      if (nonNullTypes.length > 1 && inferredType === "string") {
        warnings.push(`Mixed types on ${sourcePath}.${key} (${nonNullTypes.join(", ")}); stored as string/TEXT`);
      }
      if (inferredType === "json" && nonNullTypes.length > 1) {
        warnings.push(`Ambiguous nested/mixed type on ${sourcePath}.${key}; using JSON column`);
      }

      if (nestedStrategy === "json_column" && (inferredType === "object" || inferredType === "array")) {
        inferredType = "json";
      }

      if (nestedStrategy === "child_tables" && inferredType === "object") {
        const childRows = tableRows
          .map((row) => row[key])
          .filter((v): v is JsonObject => v !== null && typeof v === "object" && !Array.isArray(v));
        if (childRows.length === 0) {
          warnings.push(`Empty or missing nested object at ${sourcePath}.${key}; skipped child table`);
          continue;
        }
        const childName = uniqueName(`${name}_${key}`, usedTableNames);
        const parentRef = { table: name, fkColumn: `${name}_id` };
        const child = buildTable(childName, `${sourcePath}.${key}`, childRows, parentRef);
        const pk = parentPkInfo(name);
        const fkColName =
          child.columns.find((c) => c.name === parentRef.fkColumn || c.originalName === `${name}_id`)?.name ??
          parentRef.fkColumn;
        child.foreignKeys.push({
          id: makeFkId(childName, name),
          name: makeFkId(childName, name),
          columns: [fkColName],
          refTable: name,
          refColumns: pk.columns,
          onDelete: "CASCADE",
          onUpdate: "NO ACTION",
        });
        tables.push(child);
        tableByName.set(childName, child);
        continue;
      }

      if (nestedStrategy === "child_tables" && inferredType === "array") {
        const arrayValues = tableRows.flatMap((row) => {
          const v = row[key];
          return Array.isArray(v) ? v : [];
        });
        if (arrayValues.length === 0) {
          warnings.push(`Empty arrays at ${sourcePath}.${key}; column omitted (no child rows)`);
          continue;
        }
        if (arrayValues.every((v) => v !== null && typeof v === "object" && !Array.isArray(v))) {
          const childName = uniqueName(`${name}_${key}`, usedTableNames);
          const parentRef = { table: name, fkColumn: `${name}_id` };
          const child = buildTable(childName, `${sourcePath}.${key}[]`, arrayValues as JsonObject[], parentRef);
          const pk = parentPkInfo(name);
          const fkColName =
            child.columns.find((c) => c.name === parentRef.fkColumn || c.originalName === `${name}_id`)?.name ??
            parentRef.fkColumn;
          child.foreignKeys.push({
            id: makeFkId(childName, name),
            name: makeFkId(childName, name),
            columns: [fkColName],
            refTable: name,
            refColumns: pk.columns,
            onDelete: "CASCADE",
            onUpdate: "NO ACTION",
          } satisfies ForeignKeyModel);
          tables.push(child);
          tableByName.set(childName, child);
          continue;
        }
        inferredType = "json";
      }

      const colName = uniqueName(key || "column", usedColNames);
      if (colName !== key) {
        warnings.push(`Column "${key}" normalized to "${colName}" on table ${name}`);
      }

      // PK hint only on root table
      const isPkHint =
        isRoot && (options.primaryKeyHint === key || (key === "id" && !options.primaryKeyHint));

      if (isPkHint && (stats.nullCount > 0 || stats.present < tableRows.length)) {
        warnings.push(`Primary key candidate ${key} has nulls/missing values; forcing NOT NULL`);
      }

      columns.push({
        name: colName,
        originalName: key,
        inferredType,
        sqlType: dialect.mapType(inferredType),
        nullable: isPkHint ? false : nullable,
        isPrimaryKey: Boolean(isPkHint),
        isUnique: Boolean(isPkHint),
        isExcluded: false,
        autoIncrement: Boolean(isPkHint && inferredType === "integer"),
        stats,
      });
    }

    if (!columns.some((c) => c.isPrimaryKey)) {
      if (usedColNames.has("id")) {
        // Existing non-PK id column — use surrogate pk
        const pkName = uniqueName("pk_id", usedColNames);
        columns.unshift({
          name: pkName,
          originalName: pkName,
          inferredType: "integer",
          sqlType: dialect.mapType("integer"),
          nullable: false,
          isPrimaryKey: true,
          isUnique: true,
          isExcluded: false,
          autoIncrement: true,
        });
        warnings.push(`Table ${name}: added surrogate PK "${pkName}" because "id" already exists as data column`);
      } else {
        usedColNames.add("id");
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
    }

    const table: TableModel = {
      name,
      originalName: name,
      columns,
      primaryKey: columns.filter((c) => c.isPrimaryKey).map((c) => c.name),
      foreignKeys: [],
      indexes: [],
      sourcePath,
    };
    tableByName.set(name, table);
    return table;
  }

  // Two-phase: build root first so parentPkInfo works for children
  // Children call buildTable recursively; parent must be registered before child FK refColumns finalize.
  // We build columns for root without children first... Actually children are built inside and parent
  // isn't registered until return. Fix: register placeholder early.

  const rootPlaceholder: TableModel = {
    name: rootTableName,
    originalName: rootTableName,
    columns: [],
    primaryKey: ["id"],
    foreignKeys: [],
    indexes: [],
    sourcePath: "$",
  };
  tableByName.set(rootTableName, rootPlaceholder);

  const root = buildTable(rootTableName, "$", rows, undefined, true);
  // Update placeholder with real root; children already pushed
  tableByName.set(rootTableName, root);
  tables.unshift(root);

  // Patch child FK refColumns/types to actual parent PK after all tables exist
  for (const table of tables) {
    for (const fk of table.foreignKeys) {
      const parent = tableByName.get(fk.refTable);
      if (!parent?.primaryKey.length) continue;
      fk.refColumns = [...parent.primaryKey];
      const pkCol = parent.columns.find((c) => c.name === parent.primaryKey[0]);
      const fkCol = table.columns.find((c) => c.name === fk.columns[0]);
      if (fkCol && pkCol) {
        fkCol.sqlType = pkCol.sqlType;
        fkCol.inferredType = pkCol.inferredType;
      }
    }
  }

  return {
    tables,
    dialect: options.dialect,
    rootTableName,
    nestedStrategy,
    warnings,
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
        if (patch.inferredType && patch.inferredType !== "integer") {
          next.autoIncrement = false;
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
  if (schema.tables.some((t) => t.name === name && t.name !== oldName)) {
    throw new Error(`Table name already exists: ${name}`);
  }
  return {
    ...schema,
    rootTableName: schema.rootTableName === oldName ? name : schema.rootTableName,
    tables: schema.tables.map((table) => {
      const renamed =
        table.name === oldName
          ? {
              ...table,
              name,
              foreignKeys: table.foreignKeys.map((fk) => ({
                ...fk,
                id: makeFkId(name, fk.refTable === oldName ? name : fk.refTable),
                name: makeFkId(name, fk.refTable === oldName ? name : fk.refTable),
                refTable: fk.refTable === oldName ? name : fk.refTable,
              })),
            }
          : table;
      return {
        ...renamed,
        foreignKeys: renamed.foreignKeys.map((fk) => ({
          ...fk,
          refTable: fk.refTable === oldName ? name : fk.refTable,
          id: fk.refTable === oldName || table.name === oldName ? makeFkId(renamed.name, fk.refTable === oldName ? name : fk.refTable) : fk.id,
          name: fk.refTable === oldName || table.name === oldName ? makeFkId(renamed.name, fk.refTable === oldName ? name : fk.refTable) : fk.name,
        })),
      };
    }),
  };
}

export function renameColumn(
  schema: SchemaModel,
  tableName: string,
  oldName: string,
  newName: string
): SchemaModel {
  const nextName = slugify(newName) || oldName;
  const table = schema.tables.find((t) => t.name === tableName);
  if (!table) throw new Error(`Unknown table: ${tableName}`);
  if (table.columns.some((c) => c.name === nextName && c.name !== oldName)) {
    throw new Error(`Column name already exists on ${tableName}: ${nextName}`);
  }

  return {
    ...schema,
    tables: schema.tables.map((t) => {
      if (t.name === tableName) {
        const columns = t.columns.map((c) => (c.name === oldName ? { ...c, name: nextName } : c));
        return {
          ...t,
          columns,
          primaryKey: t.primaryKey.map((c) => (c === oldName ? nextName : c)),
          foreignKeys: t.foreignKeys.map((fk) => ({
            ...fk,
            columns: fk.columns.map((c) => (c === oldName ? nextName : c)),
          })),
          indexes: t.indexes.map((idx) => ({
            ...idx,
            columns: idx.columns.map((c) => (c === oldName ? nextName : c)),
          })),
        };
      }
      return {
        ...t,
        foreignKeys: t.foreignKeys.map((fk) => {
          if (fk.refTable !== tableName) return fk;
          return {
            ...fk,
            refColumns: fk.refColumns.map((c) => (c === oldName ? nextName : c)),
          };
        }),
      };
    }),
  };
}

export function validateSchema(schema: SchemaModel): SchemaValidationIssue[] {
  const issues: SchemaValidationIssue[] = [];
  const tableNames = new Set<string>();
  const fkNames = new Set<string>();

  for (const table of schema.tables) {
    if (tableNames.has(table.name)) {
      issues.push({ level: "error", message: `Duplicate table name: ${table.name}`, table: table.name });
    }
    tableNames.add(table.name);

    if (!table.name) {
      issues.push({ level: "error", message: "Empty table name", table: table.name });
    }

    const colNames = new Set<string>();
    for (const col of table.columns) {
      if (colNames.has(col.name)) {
        issues.push({ level: "error", message: `Duplicate column: ${col.name}`, table: table.name, column: col.name });
      }
      colNames.add(col.name);
      if (!col.name) {
        issues.push({ level: "error", message: "Empty column name", table: table.name });
      }
      if (col.sqlType && !/^[A-Za-z][A-Za-z0-9_\s(),.]*$/.test(col.sqlType)) {
        issues.push({ level: "error", message: `Invalid SQL type: ${col.sqlType}`, table: table.name, column: col.name });
      }
      if (col.isExcluded && col.isPrimaryKey) {
        issues.push({ level: "error", message: `Primary key column is excluded`, table: table.name, column: col.name });
      }
    }

    if (!table.primaryKey.length) {
      issues.push({ level: "warning", message: `Table has no primary key`, table: table.name });
    }

    for (const fk of table.foreignKeys) {
      if (fkNames.has(fk.name)) {
        issues.push({ level: "error", message: `Duplicate FK name: ${fk.name}`, table: table.name });
      }
      fkNames.add(fk.name);

      if (fk.columns.length !== fk.refColumns.length) {
        issues.push({
          level: "error",
          message: `FK ${fk.name} column count mismatch (${fk.columns.length} vs ${fk.refColumns.length})`,
          table: table.name,
        });
      }

      const ref = schema.tables.find((t) => t.name === fk.refTable);
      if (!ref) {
        issues.push({ level: "error", message: `FK references missing table ${fk.refTable}`, table: table.name });
        continue;
      }
      for (const c of fk.columns) {
        const col = table.columns.find((x) => x.name === c && !x.isExcluded);
        if (!col) {
          issues.push({ level: "error", message: `FK column missing: ${c}`, table: table.name, column: c });
        } else if (fk.onDelete === "SET NULL" && !col.nullable) {
          issues.push({
            level: "error",
            message: `FK ${fk.name} ON DELETE SET NULL but column ${c} is NOT NULL`,
            table: table.name,
            column: c,
          });
        }
      }
      for (const c of fk.refColumns) {
        if (!ref.columns.some((col) => col.name === c && !col.isExcluded)) {
          issues.push({ level: "error", message: `FK ref column missing: ${c} on ${fk.refTable}`, table: table.name });
        }
      }
    }
  }

  // Cycle detection (lazy import avoided — inline DFS)
  const visiting = new Set<string>();
  const done = new Set<string>();
  const stack: string[] = [];
  const byName = new Map(schema.tables.map((t) => [t.name, t]));

  function visit(name: string) {
    if (done.has(name) || !byName.has(name)) return;
    if (visiting.has(name)) {
      const idx = stack.indexOf(name);
      const path = idx >= 0 ? stack.slice(idx).concat(name).join(" -> ") : name;
      issues.push({ level: "warning", message: `Foreign-key cycle detected: ${path}`, table: name });
      return;
    }
    visiting.add(name);
    stack.push(name);
    for (const fk of byName.get(name)!.foreignKeys) visit(fk.refTable);
    stack.pop();
    visiting.delete(name);
    done.add(name);
  }

  for (const table of schema.tables) visit(table.name);

  return issues;
}
