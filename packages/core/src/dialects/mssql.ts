import type { ColumnModel, InferredPrimitiveType, TableModel } from "../types.js";
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

  autoIncrementClause(_column: ColumnModel): string {
    return "IDENTITY(1,1)";
  }

  dropTable(table: TableModel, ifExists = true): string {
    if (ifExists) {
      return `IF OBJECT_ID(N'${table.name.replace(/'/g, "''")}', N'U') IS NOT NULL DROP TABLE ${this.quoteIdent(table.name)};`;
    }
    return `DROP TABLE ${this.quoteIdent(table.name)};`;
  }
}
