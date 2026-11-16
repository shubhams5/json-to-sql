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

const ALLOWED_ACTIONS = new Set<ReferentialAction>([
  "NO ACTION",
  "RESTRICT",
  "CASCADE",
  "SET NULL",
  "SET DEFAULT",
]);

/** Allowlist-ish SQL type: letters, digits, spaces, parens, commas, underscore. */
export function isSafeSqlType(sqlType: string): boolean {
  return /^[A-Za-z][A-Za-z0-9_\s(),.]*$/.test(sqlType) && sqlType.length <= 128;
}

export abstract class BaseDialect implements Dialect {
  abstract id: Dialect["id"];
  abstract label: string;
  abstract mapType(inferred: InferredPrimitiveType): string;
  abstract autoIncrementClause(column: ColumnModel): string;
  abstract quoteIdent(name: string): string;

  quoteLiteral(value: JsonValue): string {
    if (value === null || value === undefined) return "NULL";
    if (typeof value === "number") {
      if (!Number.isFinite(value)) {
        throw new Error(`Non-finite numeric value cannot be emitted as SQL literal: ${value}`);
      }
      return String(value);
    }
    if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
    if (typeof value === "object") {
      return this.quoteLiteral(JSON.stringify(value));
    }
    return `'${String(value).replace(/'/g, "''")}'`;
  }

  referentialAction(action: ReferentialAction): string {
    if (!ALLOWED_ACTIONS.has(action)) {
      throw new Error(`Invalid referential action: ${action}`);
    }
    return action;
  }

  foreignKeyClause(fk: ForeignKeyModel): string {
    const cols = fk.columns.map((c) => this.quoteIdent(c)).join(", ");
    const refs = fk.refColumns.map((c) => this.quoteIdent(c)).join(", ");
    return `CONSTRAINT ${this.quoteIdent(fk.name)} FOREIGN KEY (${cols}) REFERENCES ${this.quoteIdent(fk.refTable)} (${refs}) ON DELETE ${this.referentialAction(fk.onDelete)} ON UPDATE ${this.referentialAction(fk.onUpdate)}`;
  }

  protected formatDefault(column: ColumnModel): string | null {
    if (column.default) {
      if (column.default.kind === "literal") {
        return `DEFAULT ${this.quoteLiteral(column.default.value)}`;
      }
      if (!isSafeSqlType(column.default.sql) && !/^[A-Za-z0-9_().\s]+$/.test(column.default.sql)) {
        throw new Error(`Unsafe DEFAULT expression on column ${column.name}`);
      }
      // Expressions must be simple identifiers / functions — no semicolons
      if (/[;'"\\]/.test(column.default.sql)) {
        throw new Error(`Unsafe DEFAULT expression on column ${column.name}`);
      }
      return `DEFAULT ${column.default.sql}`;
    }
    if (column.defaultValue !== undefined) {
      // Legacy string: treat as literal to avoid injection
      return `DEFAULT ${this.quoteLiteral(column.defaultValue)}`;
    }
    return null;
  }

  protected columnDefinition(column: ColumnModel): string {
    const sqlType = column.sqlType || this.mapType(column.inferredType);
    if (sqlType && !isSafeSqlType(sqlType)) {
      throw new Error(`Unsafe SQL type for column ${column.name}: ${sqlType}`);
    }
    const parts = [this.quoteIdent(column.name), sqlType];
    if (column.autoIncrement) {
      const clause = this.autoIncrementClause(column);
      if (clause) parts.push(clause);
    }
    if (!column.nullable) parts.push("NOT NULL");
    if (column.isUnique && !column.isPrimaryKey) parts.push("UNIQUE");
    const def = this.formatDefault(column);
    if (def) parts.push(def);
    return parts.join(" ");
  }

  createTable(table: TableModel): string {
    const cols = table.columns.filter((c) => !c.isExcluded);
    const colNames = new Set(cols.map((c) => c.name));
    const lines = cols.map((c) => this.columnDefinition(c));

    let pk = table.primaryKey.length
      ? table.primaryKey.filter((c) => colNames.has(c))
      : cols.filter((c) => c.isPrimaryKey).map((c) => c.name);

    // SQLite: single INTEGER PK with AUTOINCREMENT must be inline
    const singlePk = pk.length === 1 ? cols.find((c) => c.name === pk[0]) : undefined;
    const sqliteInline =
      this.id === "sqlite" &&
      singlePk?.autoIncrement &&
      (singlePk.inferredType === "integer" || singlePk.sqlType.toUpperCase().includes("INT"));

    if (pk.length && !sqliteInline) {
      lines.push(`PRIMARY KEY (${pk.map((c) => this.quoteIdent(c)).join(", ")})`);
    }

    for (const fk of table.foreignKeys) {
      if (fk.columns.every((c) => colNames.has(c))) {
        lines.push(this.foreignKeyClause(fk));
      }
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
