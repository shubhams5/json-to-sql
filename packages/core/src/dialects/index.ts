import type { DbDialectId } from "../types.js";
import { MssqlDialect } from "./mssql.js";
import { MysqlDialect } from "./mysql.js";
import { PostgresDialect } from "./postgres.js";
import { SqliteDialect } from "./sqlite.js";
import type { Dialect } from "./types.js";

const dialects: Record<DbDialectId, Dialect> = {
  postgres: new PostgresDialect(),
  mysql: new MysqlDialect(),
  mssql: new MssqlDialect(),
  sqlite: new SqliteDialect(),
};

export function getDialect(id: DbDialectId): Dialect {
  const dialect = dialects[id];
  if (!dialect) throw new Error(`Unknown dialect: ${id}`);
  return dialect;
}

export function listDialects(): Array<{ value: DbDialectId; label: string }> {
  return Object.values(dialects).map((d) => ({ value: d.id, label: d.label }));
}

export type { Dialect };
export { PostgresDialect, MysqlDialect, MssqlDialect, SqliteDialect };
