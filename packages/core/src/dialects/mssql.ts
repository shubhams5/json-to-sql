import type { ColumnModel, InferredPrimitiveType, JsonValue, TableModel } from "../types.js";
import { BaseDialect } from "./base.js";

export class MssqlDialect extends BaseDialect {
  id = "mssql" as const;
  label = "SQL Server";

  quoteIdent(name: string): string {
    return `[${name.replace(/]/g, "]]")}]`;
  }

  mapType(inferred: InferredPrimitiveType): string {
    switch (inferred) {
      case "integer":
        return "INT";
      case "number":
        return "FLOAT";
      case "boolean":
        return "BIT";
      case "json":
      case "object":
      case "array":
        return "NVARCHAR(MAX)";
      case "null":
      case "string":
      case "unknown":
      default:
        return "NVARCHAR(255)";
    }
  }

  autoIncrementClause(column: ColumnModel): string {
    if (column.inferredType !== "integer" && !column.sqlType.toUpperCase().includes("INT")) {
      return "";
    }
    return "IDENTITY(1,1)";
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
    return `N'${String(value).replace(/'/g, "''")}'`;
  }

  dropTable(table: TableModel, ifExists = true): string {
    if (ifExists) {
      return `IF OBJECT_ID(N${this.quoteLiteral(table.name)}, N'U') IS NOT NULL DROP TABLE ${this.quoteIdent(table.name)};`;
    }
    return `DROP TABLE ${this.quoteIdent(table.name)};`;
  }
}
