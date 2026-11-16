import type {
  ColumnModel,
  ForeignKeyModel,
  IndexModel,
  InferredPrimitiveType,
  JsonValue,
  ReferentialAction,
  TableModel,
} from "../types.js";
import type { Dialect } from "./types.js";

export abstract class BaseDialect implements Dialect {
  abstract id: Dialect["id"];
  abstract label: string;
  abstract mapType(inferred: InferredPrimitiveType): string;
  abstract autoIncrementClause(column: ColumnModel): string;
  abstract quoteIdent(name: string): string;

  quoteLiteral(value: JsonValue): string {
    if (value === null) return "NULL";
    if (typeof value === "number") return Number.isFinite(value) ? String(value) : "NULL";
    if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
    if (typeof value === "object") {
      return this.quoteLiteral(JSON.stringify(value));
    }
    return `'${String(value).replace(/'/g, "''")}'`;
  }

  referentialAction(action: ReferentialAction): string {
    return action;
  }

  foreignKeyClause(fk: ForeignKeyModel): string {
    const cols = fk.columns.map((c) => this.quoteIdent(c)).join(", ");
    const refs = fk.refColumns.map((c) => this.quoteIdent(c)).join(", ");
    return `CONSTRAINT ${this.quoteIdent(fk.name)} FOREIGN KEY (${cols}) REFERENCES ${this.quoteIdent(fk.refTable)} (${refs}) ON DELETE ${this.referentialAction(fk.onDelete)} ON UPDATE ${this.referentialAction(fk.onUpdate)}`;
  }

  protected columnDefinition(column: ColumnModel): string {
    const parts = [this.quoteIdent(column.name), column.sqlType || this.mapType(column.inferredType)];
    if (column.autoIncrement) {
      const clause = this.autoIncrementClause(column);
      if (clause) parts.push(clause);
    }
    if (!column.nullable) parts.push("NOT NULL");
    if (column.isUnique && !column.isPrimaryKey) parts.push("UNIQUE");
    if (column.defaultValue !== undefined) parts.push(`DEFAULT ${column.defaultValue}`);
    return parts.join(" ");
  }

  createTable(table: TableModel): string {
    const cols = table.columns.filter((c) => !c.isExcluded);
    const lines = cols.map((c) => this.columnDefinition(c));
    const pk = table.primaryKey.length
      ? table.primaryKey
      : cols.filter((c) => c.isPrimaryKey).map((c) => c.name);
    if (pk.length) {
      lines.push(`PRIMARY KEY (${pk.map((c) => this.quoteIdent(c)).join(", ")})`);
    }
    for (const fk of table.foreignKeys) {
      lines.push(this.foreignKeyClause(fk));
    }
    return `CREATE TABLE ${this.quoteIdent(table.name)} (\n  ${lines.join(",\n  ")}\n);`;
  }

  dropTable(table: TableModel, ifExists = true): string {
    return `DROP TABLE ${ifExists ? "IF EXISTS " : ""}${this.quoteIdent(table.name)};`;
  }

  alterTableAddColumn(table: TableModel, column: ColumnModel): string {
    return `ALTER TABLE ${this.quoteIdent(table.name)} ADD COLUMN ${this.columnDefinition(column)};`;
  }

  createIndex(table: TableModel, index: IndexModel): string {
    const unique = index.unique ? "UNIQUE " : "";
    const cols = index.columns.map((c) => this.quoteIdent(c)).join(", ");
    return `CREATE ${unique}INDEX ${this.quoteIdent(index.name)} ON ${this.quoteIdent(table.name)} (${cols});`;
  }
}
