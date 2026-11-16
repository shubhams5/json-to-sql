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
    if (column.isPrimaryKey) return "AUTOINCREMENT";
    return "";
  }

  quoteLiteral(value: JsonValue): string {
    if (typeof value === "boolean") return value ? "1" : "0";
    return super.quoteLiteral(value);
  }
}
