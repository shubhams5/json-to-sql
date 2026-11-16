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

  autoIncrementClause(_column: ColumnModel): string {
    return "AUTO_INCREMENT";
  }

  quoteLiteral(value: JsonValue): string {
    if (typeof value === "boolean") return value ? "1" : "0";
    return super.quoteLiteral(value);
  }
}
