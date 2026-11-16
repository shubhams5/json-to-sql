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

export interface ColumnModel {
  name: string;
  originalName: string;
  inferredType: InferredPrimitiveType;
  sqlType: string;
  nullable: boolean;
  isPrimaryKey: boolean;
  isUnique: boolean;
  isExcluded: boolean;
  defaultValue?: string;
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
}

export interface ParseLimits {
  maxBytes: number;
  maxDepth: number;
  maxNodes: number;
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
}

export interface CrudTarget {
  runtime: "nodejs";
  framework: "express" | "nestjs";
  language: "javascript" | "typescript";
}

export interface ExportArtifact {
  path: string;
  content: string;
  language?: string;
}
