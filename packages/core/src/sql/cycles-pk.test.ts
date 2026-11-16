import { describe, expect, it } from "vitest";
import { validateSchema } from "../schema/infer.js";
import type { SchemaModel, TableModel } from "../types.js";
import {
  detectFkCycles,
  generateCreateSchema,
  planRelationalInserts,
} from "./generate.js";

function table(partial: Partial<TableModel> & { name: string }): TableModel {
  return {
    originalName: partial.name,
    columns: partial.columns ?? [
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
    ],
    primaryKey: partial.primaryKey ?? ["id"],
    foreignKeys: partial.foreignKeys ?? [],
    indexes: [],
    sourcePath: partial.sourcePath ?? "$",
    ...partial,
  };
}

describe("FK cycles", () => {
  it("detects A↔B cycle and emits ALTER constraints", () => {
    const a = table({
      name: "a",
      foreignKeys: [
        {
          id: "fk_a_b",
          name: "fk_a_b",
          columns: ["b_id"],
          refTable: "b",
          refColumns: ["id"],
          onDelete: "NO ACTION",
          onUpdate: "NO ACTION",
        },
      ],
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
          name: "b_id",
          originalName: "b_id",
          inferredType: "integer",
          sqlType: "INTEGER",
          nullable: true,
          isPrimaryKey: false,
          isUnique: false,
          isExcluded: false,
        },
      ],
    });
    const b = table({
      name: "b",
      foreignKeys: [
        {
          id: "fk_b_a",
          name: "fk_b_a",
          columns: ["a_id"],
          refTable: "a",
          refColumns: ["id"],
          onDelete: "NO ACTION",
          onUpdate: "NO ACTION",
        },
      ],
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
          name: "a_id",
          originalName: "a_id",
          inferredType: "integer",
          sqlType: "INTEGER",
          nullable: true,
          isPrimaryKey: false,
          isUnique: false,
          isExcluded: false,
        },
      ],
    });
    const schema: SchemaModel = {
      tables: [a, b],
      dialect: "postgres",
      rootTableName: "a",
      nestedStrategy: "child_tables",
    };
    expect(detectFkCycles(schema.tables).length).toBeGreaterThan(0);
    const issues = validateSchema(schema);
    expect(issues.some((i) => i.message.includes("cycle"))).toBe(true);
    const ddl = generateCreateSchema(schema);
    expect(ddl).toMatch(/ALTER TABLE/);
    expect(ddl).toMatch(/DEFERRABLE INITIALLY DEFERRED/);
    // CREATE should not inline both cyclic FKs in a broken order without ALTER
    expect(ddl.indexOf("CREATE TABLE")).toBeGreaterThanOrEqual(0);
  });
});

describe("relational PK typing", () => {
  it("assigns UUID for uuid PK when missing", () => {
    const schema: SchemaModel = {
      dialect: "postgres",
      rootTableName: "t",
      nestedStrategy: "json_column",
      tables: [
        table({
          name: "t",
          primaryKey: ["id"],
          columns: [
            {
              name: "id",
              originalName: "id",
              inferredType: "string",
              sqlType: "UUID",
              nullable: false,
              isPrimaryKey: true,
              isUnique: true,
              isExcluded: false,
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
        }),
      ],
    };
    const planned = planRelationalInserts(schema, [{ name: "Ada" }]);
    const id = planned.get("t")![0].id;
    expect(typeof id).toBe("string");
    expect(String(id)).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
  });

  it("errors on missing non-uuid string PK", () => {
    const schema: SchemaModel = {
      dialect: "postgres",
      rootTableName: "t",
      nestedStrategy: "json_column",
      tables: [
        table({
          name: "t",
          primaryKey: ["code"],
          columns: [
            {
              name: "code",
              originalName: "code",
              inferredType: "string",
              sqlType: "TEXT",
              nullable: false,
              isPrimaryKey: true,
              isUnique: true,
              isExcluded: false,
            },
          ],
        }),
      ],
    };
    expect(() => planRelationalInserts(schema, [{}])).toThrow(/Unsupported missing primary key/);
  });

  it("integer sequence skips existing ids", () => {
    const schema: SchemaModel = {
      dialect: "sqlite",
      rootTableName: "t",
      nestedStrategy: "json_column",
      tables: [
        table({
          name: "t",
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
        }),
      ],
    };
    const planned = planRelationalInserts(schema, [{ id: 1, name: "a" }, { name: "b" }]);
    const ids = planned.get("t")!.map((r) => r.id);
    expect(ids).toEqual([1, 2]);
  });
});
