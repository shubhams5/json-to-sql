import { describe, expect, it } from "vitest";
import { generateDml } from "./generate.js";

const sample = [
  { id: 78, tenantId: 8, questionMasterId: 1, answers: "hello" },
  { id: 79, tenantId: 8, questionMasterId: 2, answers: "world" },
];

describe("generateDml legacy behavior", () => {
  it("generates batch insert for postgres excluding primary key", () => {
    const sql = generateDml({
      data: sample,
      tableName: "my_table",
      primaryKey: "id",
      operation: "INSERT",
      batchInsert: true,
      dbType: "postgres",
    });
    expect(sql).toContain('INSERT INTO "my_table"');
    expect(sql).toContain('"tenantId"');
    expect(sql).not.toContain('"id"');
    expect(sql).toContain("VALUES");
  });

  it("generates update with primary key", () => {
    const sql = generateDml({
      data: sample,
      tableName: "my_table",
      primaryKey: "id",
      operation: "UPDATE",
      dbType: "postgres",
      conditionColumns: ["tenantId"],
    });
    expect(sql).toContain('UPDATE "my_table" SET');
    expect(sql).toContain('WHERE "id" = 78');
    expect(sql).toContain('AND "tenantId" = 8');
  });

  it("generates batch delete", () => {
    const sql = generateDml({
      data: sample,
      tableName: "my_table",
      primaryKey: "id",
      operation: "DELETE",
      batchInsert: true,
      dbType: "mysql",
    });
    expect(sql).toContain("DELETE FROM `my_table` WHERE `id` IN (78, 79);");
  });
});
