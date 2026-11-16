import { describe, expect, it } from "vitest";
import { applyColumnOverride, inferSchema } from "../schema/infer.js";
import { generateCrud, parseCrudTargetFlag } from "./generate.js";
import { renderPrismaSchema } from "./prismaSchema.js";

describe("Prisma schema generation", () => {
  it("emits Decimal with precision for DECIMAL columns", () => {
    let schema = inferSchema([{ id: 1, amount: "12.50" }], { dialect: "postgres", rootTableName: "payments" });
    schema = applyColumnOverride(schema, "payments", "amount", {
      sqlType: "DECIMAL(12,2)",
      inferredType: "string",
    });
    const prisma = renderPrismaSchema(schema);
    expect(prisma).toMatch(/amount\s+Decimal/);
    expect(prisma).toContain("@db.Decimal(12, 2)");
  });

  it("emits named relations and respects onDelete", () => {
    const schema = inferSchema([{ id: 1, profile: { city: "X" } }], {
      dialect: "postgres",
      rootTableName: "people",
    });
    const child = schema.tables.find((t) => t.name.includes("profile"))!;
    child.foreignKeys[0].onDelete = "RESTRICT";
    child.foreignKeys[0].onUpdate = "CASCADE";
    const prisma = renderPrismaSchema(schema);
    expect(prisma).toContain("onDelete: Restrict");
    expect(prisma).toContain("onUpdate: Cascade");
    expect(prisma).toMatch(/@relation\("/);
  });

  it("supports two FKs to the same model with distinct relation names", () => {
    const schema = inferSchema([{ id: 1, name: "a" }], { dialect: "sqlite", rootTableName: "users" });
    // Manually add second table with two FKs to users
    schema.tables.push({
      name: "edges",
      originalName: "edges",
      sourcePath: "$.edges",
      primaryKey: ["id"],
      indexes: [],
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
          name: "from_id",
          originalName: "from_id",
          inferredType: "integer",
          sqlType: "INTEGER",
          nullable: false,
          isPrimaryKey: false,
          isUnique: false,
          isExcluded: false,
        },
        {
          name: "to_id",
          originalName: "to_id",
          inferredType: "integer",
          sqlType: "INTEGER",
          nullable: false,
          isPrimaryKey: false,
          isUnique: false,
          isExcluded: false,
        },
      ],
      foreignKeys: [
        {
          id: "fk_from",
          name: "fk_from",
          columns: ["from_id"],
          refTable: "users",
          refColumns: ["id"],
          onDelete: "CASCADE",
          onUpdate: "NO ACTION",
        },
        {
          id: "fk_to",
          name: "fk_to",
          columns: ["to_id"],
          refTable: "users",
          refColumns: ["id"],
          onDelete: "CASCADE",
          onUpdate: "NO ACTION",
        },
      ],
    });
    const prisma = renderPrismaSchema(schema);
    expect(prisma).toContain('@relation("fk_from"');
    expect(prisma).toContain('@relation("fk_to"');
  });

  it("express prisma routes use strict zod and sanitizeFilter", () => {
    const schema = inferSchema([{ id: 1, name: "Ada" }], { dialect: "sqlite", rootTableName: "users" });
    const files = generateCrud(schema, parseCrudTargetFlag("express-prisma"));
    const route = files.find((f) => f.path.includes("routes/"))!.content;
    expect(route).toContain(".strict()");
    expect(route).not.toContain("passthrough");
    expect(route).toContain("sanitizeFilter");
    expect(route).toContain("updateSchema.safeParse");
  });

  it("nestjs service implements search and orderBy", () => {
    const schema = inferSchema([{ id: 1, name: "Ada" }], { dialect: "sqlite", rootTableName: "users" });
    const files = generateCrud(schema, parseCrudTargetFlag("nestjs-prisma"));
    const service = files.find((f) => f.path.endsWith(".service.ts") && f.path.includes("users"))!.content;
    expect(service).toContain("contains: search");
    expect(service).toContain("orderBy");
    expect(service).not.toContain("void search");
    const dto = files.find((f) => f.path.endsWith(".dto.ts"))!.content;
    expect(dto).toContain("PartialType");
  });
});
