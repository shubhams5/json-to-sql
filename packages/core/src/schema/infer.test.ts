import { describe, expect, it } from "vitest";
import { applyColumnOverride, inferSchema } from "./infer.js";

describe("inferSchema", () => {
  it("infers flat table with id primary key", () => {
    const schema = inferSchema(
      [
        { id: 1, name: "Ada", active: true },
        { id: 2, name: null, active: false },
      ],
      { dialect: "postgres", rootTableName: "users" }
    );
    expect(schema.tables[0].name).toBe("users");
    const nameCol = schema.tables[0].columns.find((c) => c.name === "name");
    expect(nameCol?.nullable).toBe(true);
    expect(schema.tables[0].primaryKey).toContain("id");
  });

  it("creates child tables for nested objects", () => {
    const schema = inferSchema(
      [{ id: 1, profile: { city: "Berlin", zip: 10115 } }],
      { dialect: "mysql", rootTableName: "people", nestedStrategy: "child_tables" }
    );
    expect(schema.tables.length).toBeGreaterThan(1);
    expect(schema.tables.some((t) => t.name.includes("profile"))).toBe(true);
  });

  it("stores nested as json when strategy is json_column", () => {
    const schema = inferSchema(
      [{ id: 1, profile: { city: "Berlin" } }],
      { dialect: "postgres", nestedStrategy: "json_column" }
    );
    const profile = schema.tables[0].columns.find((c) => c.name === "profile");
    expect(profile?.inferredType).toBe("json");
    expect(profile?.sqlType).toBe("JSONB");
  });

  it("allows type overrides", () => {
    const schema = inferSchema([{ id: 1, score: "10" }], { dialect: "sqlite" });
    const next = applyColumnOverride(schema, schema.rootTableName, "score", { inferredType: "integer" });
    const score = next.tables[0].columns.find((c) => c.name === "score");
    expect(score?.sqlType).toBe("INTEGER");
  });
});
