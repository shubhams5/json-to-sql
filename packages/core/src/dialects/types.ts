import type {
  ColumnModel,
  DbDialectId,
  ForeignKeyModel,
  IndexModel,
  InferredPrimitiveType,
  JsonValue,
  ReferentialAction,
  TableModel,
} from "../types.js";

export interface Dialect {
  id: DbDialectId;
  label: string;
  quoteIdent(name: string): string;
  quoteLiteral(value: JsonValue): string;
  mapType(inferred: InferredPrimitiveType): string;
  autoIncrementClause(column: ColumnModel): string;
  createTable(table: TableModel, options?: { includeForeignKeys?: boolean }): string;
  dropTable(table: TableModel, ifExists?: boolean): string;
  alterTableAddColumn(table: TableModel, column: ColumnModel): string;
  alterTableAddForeignKey(table: TableModel, fk: ForeignKeyModel, options?: { deferrable?: boolean }): string;
  createIndex(table: TableModel, index: IndexModel): string;
  foreignKeyClause(fk: ForeignKeyModel, options?: { deferrable?: boolean }): string;
  referentialAction(action: ReferentialAction): string;
}
