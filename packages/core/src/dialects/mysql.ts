import type { ColumnModel, InferredPrimitiveType, JsonValue } from "../types.js";
import { BaseDialect } from "./base.js";

export class MysqlDialect extends BaseDialect {
  id = "mysql" as const;
  label = "MySQL";

  quoteIdent(name: string): string {
    return `\`${name.replace(/`/g, "``")}\``;
  }

  mapType(inferred: InferredPrimitiveType): string {
    switch (inferred) {
      case "integer":
        return "INT";
      case "number":
        return "DOUBLE";
      case "boolean":
        return "TINYINT(1)";
      case "json":
      case "object":
      case "array":
        return "JSON";
      case "null":
      case "string":
      case "unknown":
      default:
        return "VARCHAR(255)";
    }
  }

  autoIncrementClause(column: ColumnModel): string {
    if (column.inferredType !== "integer" && !column.sqlType.toUpperCase().includes("INT")) {
      return "";
    }
    return "AUTO_INCREMENT";
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
    // Escape backslash first, then quote, NUL, and control chars for NO_BACKSLASH_ESCAPES off
    const escaped = String(value)
      .replace(/\\/g, "\\\\")
      .replace(/'/g, "''")
      .replace(/\0/g, "\\0")
      .replace(/\n/g, "\\n")
      .replace(/\r/g, "\\r")
      .replace(/\x1a/g, "\\Z");
    return `'${escaped}'`;
  }
}
