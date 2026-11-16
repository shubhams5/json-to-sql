export type DbDialectId = "postgres" | "mysql" | "mssql" | "sqlite";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export type JsonObject = { [key: string]: JsonValue };

export type InferredPrimitiveType =
  | "string"
  | "integer"
  | "number"
  | "boolean"
  | "null"
  | "object"
  | "array"
  | "json"
  | "unknown";

export interface FieldStats {
  present: number;
  nullCount: number;
  types: Record<string, number>;
  sampleValues: JsonValue[];
}

/** Trusted SQL expression vs user literal default. Literals are quoted by dialects. */
export type ColumnDefault =
  | { kind: "literal"; value: JsonValue }
  | { kind: "expression"; sql: string };

export interface ColumnModel {
  name: string;
  originalName: string;
  inferredType: InferredPrimitiveType;
  sqlType: string;
  nullable: boolean;
  isPrimaryKey: boolean;
  isUnique: boolean;
  isExcluded: boolean;
  /** @deprecated Prefer `default`. String form treated as untrusted expression only if allowlisted. */
  defaultValue?: string;
  default?: ColumnDefault;
  autoIncrement?: boolean;
  stats?: FieldStats;
}

export interface ForeignKeyModel {
  id: string;
  name: string;
  columns: string[];
  refTable: string;
  refColumns: string[];
  onDelete: ReferentialAction;
  onUpdate: ReferentialAction;
}

export type ReferentialAction = "NO ACTION" | "RESTRICT" | "CASCADE" | "SET NULL" | "SET DEFAULT";

export interface IndexModel {
  id: string;
  name: string;
  columns: string[];
  unique: boolean;
}

export interface TableModel {
  name: string;
  originalName: string;
  columns: ColumnModel[];
  primaryKey: string[];
  foreignKeys: ForeignKeyModel[];
  indexes: IndexModel[];
  sourcePath: string;
}

export interface SchemaModel {
  tables: TableModel[];
  dialect: DbDialectId;
  rootTableName: string;
  nestedStrategy: "json_column" | "child_tables";
  warnings?: string[];
}

export interface ParseLimits {
  maxBytes: number;
  maxDepth: number;
  maxNodes: number;
  maxRows?: number;
  maxColumns?: number;
}

export interface ParseResult {
  data: JsonValue;
  rows: JsonObject[];
  warnings: string[];
}

export type SqlOperation = "INSERT" | "UPDATE" | "DELETE" | "SELECT" | "CREATE" | "DROP" | "ALTER";

export interface GenerateDmlOptions {
  data: JsonObject[];
  tableName: string;
  primaryKey?: string;
  operation: "INSERT" | "UPDATE" | "DELETE";
  batchInsert?: boolean;
  dbType: DbDialectId;
  conditionColumns?: string[];
  excludePrimaryKeyOnInsert?: boolean;
  /** When set, INSERT columns come from schema (minus excluded), not Object.keys(data[0]). */
  columns?: string[];
}

export type CrudOrm = "prisma" | "typeorm" | "none";

export interface CrudTarget {
  runtime: "nodejs";
  framework: "express" | "nestjs";
  language: "javascript" | "typescript";
  /** Persistence layer. `none` is experimental in-memory / interface-only scaffold. */
  orm?: CrudOrm;
}

export interface ExportArtifact {
  path: string;
  content: string;
  language?: string;
}

export interface SchemaValidationIssue {
  level: "error" | "warning";
  message: string;
  table?: string;
  column?: string;
}
