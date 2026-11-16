import type { ColumnModel, InferredPrimitiveType, JsonValue } from "../types.js";
import { BaseDialect } from "./base.js";

export class SqliteDialect extends BaseDialect {
  id = "sqlite" as const;
  label = "SQLite";

  quoteIdent(name: string): string {
    return `"${name.replace(/"/g, '""')}"`;
  }

  mapType(inferred: InferredPrimitiveType): string {
    switch (inferred) {
      case "integer":
        return "INTEGER";
      case "number":
        return "REAL";
      case "boolean":
        return "INTEGER";
      case "json":
      case "object":
      case "array":
        return "TEXT";
      case "null":
      case "string":
      case "unknown":
      default:
        return "TEXT";
    }
  }

  autoIncrementClause(column: ColumnModel): string {
    // Must be emitted as INTEGER PRIMARY KEY AUTOINCREMENT inline (see createTable)
    if (column.isPrimaryKey && (column.inferredType === "integer" || column.sqlType.toUpperCase().includes("INT"))) {
      return "PRIMARY KEY AUTOINCREMENT";
    }
    return "";
  }

  quoteLiteral(value: JsonValue): string {
    if (value === null || value === undefined) return "NULL";
    if (typeof value === "boolean") return value ? "1" : "0";
    if (typeof value === "number") {
      if (!Number.isFinite(value)) {
        throw new Error(`Non-finite numeric value cannot be emitted as SQL literal: ${value}`);
      }
      return String(value);
    }
    if (typeof value === "object") {
      return this.quoteLiteral(JSON.stringify(value));
    }
    return `'${String(value).replace(/'/g, "''")}'`;
  }
}
