import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { inferSchema } from "../schema/infer.js";
import { parseJsonInput } from "../json/parse.js";
import { generateCreateSchema, generateRelationalInserts } from "./generate.js";

const fixturePath = join(dirname(fileURLToPath(import.meta.url)), "../../../../tests/fixtures/nested.json");

describe("sqlite execution", () => {
  it("runs CREATE + relational INSERT for nested fixture", () => {
    const raw = readFileSync(fixturePath, "utf8");
    const { rows } = parseJsonInput(raw);
    const schema = inferSchema(rows, { dialect: "sqlite", rootTableName: "people" });
    const ddl = generateCreateSchema(schema);
    const dml = generateRelationalInserts(schema, rows);

    const db = new DatabaseSync(":memory:");
    // SQLite executes one statement at a time
    for (const stmt of `${ddl}\n${dml}`.split(";").map((s) => s.trim()).filter(Boolean)) {
      db.exec(stmt);
    }

    const people = db.prepare("SELECT id, name FROM people").all() as Array<{ id: number; name: string }>;
    expect(people).toEqual([{ id: 1, name: "Ada" }]);

    const profileTable = schema.tables.find((t) => t.name.includes("profile"))!.name;
    const ordersTable = schema.tables.find((t) => t.name.includes("orders"))!.name;

    const profiles = db.prepare(`SELECT city FROM ${profileTable}`).all() as Array<{ city: string }>;
    expect(profiles[0].city).toBe("London");

    const orders = db.prepare(`SELECT sku, qty FROM ${ordersTable} ORDER BY sku`).all() as Array<{
      sku: string;
      qty: number;
    }>;
    expect(orders).toEqual([
      { sku: "BOOK-1", qty: 2 },
      { sku: "BOOK-2", qty: 1 },
    ]);
  });
});
