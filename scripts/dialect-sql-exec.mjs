#!/usr/bin/env node
/**
 * Execute generated DDL+INSERT against a live database.
 * Env: DIALECT=postgres|mysql|mssql  DATABASE_URL=...
 * For local CI service containers.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dialect = process.env.DIALECT || "postgres";
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL required");
  process.exit(1);
}

const { parseJsonInput, inferSchema, generateCreateSchema, generateRelationalInserts } = await import(
  "../packages/core/dist/index.js"
);

const fixture = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../tests/fixtures/nested.json"), "utf8");
const { rows } = parseJsonInput(fixture);
const schema = inferSchema(rows, { dialect, rootTableName: "people" });
const ddl = generateCreateSchema(schema);
const dml = generateRelationalInserts(schema, rows);
const sql = `${ddl}\n${dml}`;

async function runPostgres() {
  const { default: pg } = await import("pg");
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query("DROP TABLE IF EXISTS people_orders, people_profile, people CASCADE");
    for (const stmt of sql.split(";").map((s) => s.trim()).filter(Boolean)) {
      await client.query(stmt);
    }
    const res = await client.query("SELECT name FROM people");
    if (res.rows[0]?.name !== "Ada") throw new Error("unexpected row");
    console.log("dialect-postgres ok");
  } finally {
    await client.end();
  }
}

async function runMysql() {
  const mysql = await import("mysql2/promise");
  const conn = await mysql.createConnection(url);
  try {
    await conn.query("SET FOREIGN_KEY_CHECKS=0");
    await conn.query("DROP TABLE IF EXISTS people_orders, people_profile, people");
    await conn.query("SET FOREIGN_KEY_CHECKS=1");
    for (const stmt of sql.split(";").map((s) => s.trim()).filter(Boolean)) {
      await conn.query(stmt);
    }
    const [rowsOut] = await conn.query("SELECT name FROM people");
    if (rowsOut[0]?.name !== "Ada") throw new Error("unexpected row");
    console.log("dialect-mysql ok");
  } finally {
    await conn.end();
  }
}

async function runMssql() {
  const sqlPkg = await import("mssql");
  const pool = await sqlPkg.default.connect(url);
  try {
    for (const stmt of sql.split(";").map((s) => s.trim()).filter(Boolean)) {
      await pool.request().batch(stmt);
    }
    const result = await pool.request().query("SELECT name FROM people");
    if (result.recordset[0]?.name !== "Ada") throw new Error("unexpected row");
    console.log("dialect-mssql ok");
  } finally {
    await pool.close();
  }
}

if (dialect === "postgres") await runPostgres();
else if (dialect === "mysql") await runMysql();
else if (dialect === "mssql") await runMssql();
else {
  console.error("Unknown DIALECT", dialect);
  process.exit(1);
}
