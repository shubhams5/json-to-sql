import { describe, expect, it } from "vitest";
import { getDialect } from "./index.js";
import type { TableModel } from "../types.js";

describe("dialect SQL safety", () => {
  it("escapes MySQL backslashes to prevent quote breakout", () => {
    const mysql = getDialect("mysql");
    const lit = mysql.quoteLiteral("x\\'; DROP TABLE t; --");
    expect(lit).toBe("'x\\\\''; DROP TABLE t; --'");
    // After escaping, the string stays one literal (no unescaped lone quote breakout)
    expect(lit.startsWith("'")).toBe(true);
    expect(lit.endsWith("'")).toBe(true);
  });

  it("does not rewrite Postgres JSON-looking strings as ARRAY", () => {
    const pg = getDialect("postgres");
    expect(pg.quoteLiteral("[1,2]")).toBe("'[1,2]'");
    expect(pg.quoteLiteral(JSON.stringify([{ a: 1 }]))).toContain("{");
    expect(pg.quoteLiteral(JSON.stringify([{ a: 1 }]))).not.toContain("ARRAY[");
  });

  it("emits MSSQL bit and N-prefixed strings", () => {
    const mssql = getDialect("mssql");
    expect(mssql.quoteLiteral(true)).toBe("1");
    expect(mssql.quoteLiteral(false)).toBe("0");
    expect(mssql.quoteLiteral("café")).toBe("N'café'");
  });

  it("emits valid SQLite INTEGER PRIMARY KEY AUTOINCREMENT", () => {
    const sqlite = getDialect("sqlite");
    const table: TableModel = {
      name: "t",
      originalName: "t",
      columns: [
        {
          name: "id",
          originalName: "id",
          inferredType: "integer",
          sqlType: "INTEGER",
          nullable: false,
          isPrimaryKey: true,
          isUnique: true,
          isExcluded: false,
          autoIncrement: true,
        },
        {
          name: "name",
          originalName: "name",
          inferredType: "string",
          sqlType: "TEXT",
          nullable: true,
          isPrimaryKey: false,
          isUnique: false,
          isExcluded: false,
        },
      ],
      primaryKey: ["id"],
      foreignKeys: [],
      indexes: [],
      sourcePath: "$",
    };
    const ddl = sqlite.createTable(table);
    expect(ddl).toContain('"id" INTEGER PRIMARY KEY AUTOINCREMENT');
    expect(ddl).not.toMatch(/PRIMARY KEY\s*\(\s*"id"\s*\)/);
  });

  it("quotes defaultValue as literal (no injection)", () => {
    const pg = getDialect("postgres");
    const table: TableModel = {
      name: "t",
      originalName: "t",
      columns: [
        {
          name: "id",
          originalName: "id",
          inferredType: "integer",
          sqlType: "INTEGER",
          nullable: false,
          isPrimaryKey: true,
          isUnique: true,
          isExcluded: false,
        },
        {
          name: "x",
          originalName: "x",
          inferredType: "string",
          sqlType: "TEXT",
          nullable: true,
          isPrimaryKey: false,
          isUnique: false,
          isExcluded: false,
          defaultValue: "0); DROP TABLE t; --",
        },
      ],
      primaryKey: ["id"],
      foreignKeys: [],
      indexes: [],
      sourcePath: "$",
    };
    const ddl = pg.createTable(table);
    expect(ddl).toContain("DEFAULT '0); DROP TABLE t; --'");
    expect(ddl).not.toMatch(/DEFAULT 0\); DROP/);
  });

  it("throws on non-finite numbers", () => {
    const pg = getDialect("postgres");
    expect(() => pg.quoteLiteral(Number.POSITIVE_INFINITY)).toThrow(/Non-finite/);
  });
});
