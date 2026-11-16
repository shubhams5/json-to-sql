import { describe, expect, it } from "vitest";
import { inferSchema, renameColumn, renameTable, validateSchema } from "./infer.js";

describe("rename + validate", () => {
  it("renameColumn updates PK and FK references", () => {
    const schema = inferSchema([{ id: 1, profile: { city: "Berlin" } }], {
      dialect: "postgres",
      rootTableName: "people",
    });
    const next = renameColumn(schema, "people", "id", "person_id");
    expect(next.tables[0].primaryKey).toContain("person_id");
    for (const table of next.tables) {
      for (const fk of table.foreignKeys) {
        if (fk.refTable === "people") {
          expect(fk.refColumns).toContain("person_id");
        }
      }
    }
  });

  it("renameTable updates FK refTable", () => {
    const schema = inferSchema([{ id: 1, profile: { city: "Berlin" } }], {
      dialect: "postgres",
      rootTableName: "people",
    });
    const next = renameTable(schema, "people", "humans");
    expect(next.rootTableName).toBe("humans");
    expect(next.tables.some((t) => t.foreignKeys.some((fk) => fk.refTable === "humans"))).toBe(true);
  });

  it("validateSchema flags duplicate columns", () => {
    const schema = inferSchema([{ id: 1, name: "a" }], { dialect: "sqlite", rootTableName: "t" });
    schema.tables[0].columns.push({ ...schema.tables[0].columns[1], name: "name" });
    const issues = validateSchema(schema);
    expect(issues.some((i) => i.message.includes("Duplicate column"))).toBe(true);
  });
});
