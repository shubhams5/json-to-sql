import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { inferSchema } from "../schema/infer.js";
import { parseJsonInput } from "../json/parse.js";
import {
  generateFullSqlBundle,
  generateRelationalInserts,
  nestedKeyFromPath,
  planRelationalInserts,
} from "./generate.js";

const fixturePath = join(dirname(fileURLToPath(import.meta.url)), "../../../../tests/fixtures/nested.json");

describe("relational inserts", () => {
  const raw = readFileSync(fixturePath, "utf8");
  const { rows } = parseJsonInput(raw);

  it("nestedKeyFromPath resolves direct children", () => {
    expect(nestedKeyFromPath("$", "$.profile")).toBe("profile");
    expect(nestedKeyFromPath("$", "$.orders[]")).toBe("orders");
    expect(nestedKeyFromPath("$.profile", "$.profile.city")).toBe("city");
    expect(nestedKeyFromPath("$", "$.a.b")).toBe(null);
  });

  it("plans root and child rows with FK values", () => {
    const schema = inferSchema(rows, { dialect: "sqlite", rootTableName: "people" });
    const planned = planRelationalInserts(schema, rows);
    expect(planned.get("people")?.length).toBe(1);
    expect(planned.get("people")?.[0]).toMatchObject({ id: 1, name: "Ada" });

    const profileTable = schema.tables.find((t) => t.name.includes("profile"));
    const ordersTable = schema.tables.find((t) => t.name.includes("orders"));
    expect(profileTable).toBeTruthy();
    expect(ordersTable).toBeTruthy();

    const profiles = planned.get(profileTable!.name)!;
    expect(profiles.length).toBe(1);
    expect(profiles[0].city).toBe("London");
    const fk = profileTable!.foreignKeys[0].columns[0];
    expect(profiles[0][fk]).toBe(1);

    const orders = planned.get(ordersTable!.name)!;
    expect(orders.length).toBe(2);
    expect(orders.map((o) => o.sku)).toEqual(["BOOK-1", "BOOK-2"]);
    expect(orders.every((o) => o[ordersTable!.foreignKeys[0].columns[0]] === 1)).toBe(true);
  });

  it("bundle CREATE has child tables and INSERT does not put nested keys on root", () => {
    const schema = inferSchema(rows, { dialect: "postgres", rootTableName: "people" });
    const sql = generateFullSqlBundle(schema, rows);
    expect(sql).toContain('CREATE TABLE "people"');
    expect(sql).toMatch(/CREATE TABLE "people_profile"/);
    expect(sql).toMatch(/CREATE TABLE "people_orders"/);
    expect(sql).not.toMatch(/INSERT INTO "people"[^;]*"profile"/);
    expect(sql).toContain('INSERT INTO "people_profile"');
    expect(sql).toContain('INSERT INTO "people_orders"');
    expect(sql).toContain("'Ada'");
    expect(sql).toContain("'BOOK-1'");
  });

  it("generateRelationalInserts emits dependency order (parent before child)", () => {
    const schema = inferSchema(rows, { dialect: "sqlite", rootTableName: "people" });
    const sql = generateRelationalInserts(schema, rows);
    const rootAt = sql.indexOf('INSERT INTO "people"');
    const childAt = sql.indexOf("INSERT INTO \"people_");
    expect(rootAt).toBeGreaterThanOrEqual(0);
    expect(childAt).toBeGreaterThan(rootAt);
  });

  it("FK refColumns follow parent primary key", () => {
    const schema = inferSchema(rows, { dialect: "postgres", rootTableName: "people" });
    for (const table of schema.tables) {
      for (const fk of table.foreignKeys) {
        const parent = schema.tables.find((t) => t.name === fk.refTable)!;
        expect(fk.refColumns).toEqual(parent.primaryKey);
      }
    }
  });
});
