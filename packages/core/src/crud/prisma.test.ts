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

  it("sqlite Decimal omits @db.Decimal native attr", () => {
    let schema = inferSchema([{ id: 1, amount: "12.50" }], { dialect: "sqlite", rootTableName: "payments" });
    schema = applyColumnOverride(schema, "payments", "amount", {
      sqlType: "DECIMAL(12,2)",
      inferredType: "string",
    });
    const prisma = renderPrismaSchema(schema);
    expect(prisma).toMatch(/amount\s+Decimal/);
    expect(prisma).not.toContain("@db.Decimal");
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

  it("nestjs prisma uses sanitizeFilter and rejects relation ops", () => {
    const schema = inferSchema([{ id: 1, name: "Ada" }], { dialect: "sqlite", rootTableName: "users" });
    const files = generateCrud(schema, parseCrudTargetFlag("nestjs-prisma"));
    const util = files.find((f) => f.path.endsWith("query.util.ts"))!.content;
    const controller = files.find((f) => f.path.endsWith(".controller.ts") && f.path.includes("users"))!.content;
    expect(util).toContain("sanitizeFilter");
    expect(util).toContain("relation filters are not allowed");
    expect(controller).toContain("sanitizeFilter");
    expect(controller).toContain("asQueryString");
    expect(files.find((f) => f.path.endsWith(".service.ts") && f.path.includes("users"))!.content).toContain(
      "ConflictException"
    );
  });

  it("express prisma uses Number.isInteger for numeric ids", () => {
    const schema = inferSchema([{ id: 1, name: "Ada" }], { dialect: "sqlite", rootTableName: "users" });
    const files = generateCrud(schema, parseCrudTargetFlag("express-prisma"));
    const route = files.find((f) => f.path.includes("routes/"))!.content;
    expect(route).toContain("Number.isInteger(id)");
    expect(route).not.toContain("Number.isNaN(id)");
  });

  it("rejects composite PK for route generators", () => {
    const schema = inferSchema([{ id: 1, name: "Ada" }], { dialect: "sqlite", rootTableName: "users" });
    schema.tables[0].primaryKey = ["id", "name"];
    schema.tables[0].columns.forEach((c) => {
      c.isPrimaryKey = schema.tables[0].primaryKey.includes(c.name);
    });
    expect(() => generateCrud(schema, parseCrudTargetFlag("express-prisma"))).toThrow(/composite|Single-column PK/i);
    expect(() => generateCrud(schema, parseCrudTargetFlag("nestjs-prisma"))).toThrow(/composite|Single-column PK/i);
    expect(() => generateCrud(schema, parseCrudTargetFlag("express-typeorm"))).toThrow(/composite|Single-column PK/i);
    expect(() => generateCrud(schema, parseCrudTargetFlag("nestjs-typeorm"))).toThrow(/composite|Single-column PK/i);
  });

  it("typeorm gates synchronize and blocks mass-assignment", () => {
    const schema = inferSchema([{ id: 1, name: "Ada" }], { dialect: "sqlite", rootTableName: "users" });
    const expressFiles = generateCrud(schema, parseCrudTargetFlag("express-typeorm"));
    const ds = expressFiles.find((f) => f.path.endsWith("data-source.ts"))!.content;
    expect(ds).toContain("process.env.TYPEORM_SYNC === 'true'");
    expect(ds).toMatch(/synchronize:\s*process\.env\.TYPEORM_SYNC/);
    expect(ds).not.toMatch(/synchronize:\s*true\b/);
    expect(ds).toContain("migrations:");
    const route = expressFiles.find((f) => f.path.includes("routes/"))!.content;
    expect(route).toContain("createSchema.safeParse");
    expect(route).toContain(".strict()");
    expect(route).not.toMatch(/repo\(\)\.create\(req\.body\)/);
    expect(route).not.toMatch(/"id":\s*z\./);
    expect(expressFiles.find((f) => f.path === ".env.example")!.content).toContain("DB_TYPE=better-sqlite3");
    expect(expressFiles.some((f) => f.path === "src/migrations/.gitkeep")).toBe(true);
    const pkg = JSON.parse(expressFiles.find((f) => f.path === "package.json")!.content);
    expect(pkg.scripts["migration:run"]).toBeTruthy();
    const expressMain = expressFiles.find((f) => f.path.endsWith("main.ts"))!.content;
    expect(expressMain).toContain("export async function createApp");
    expect(expressMain).toContain("NODE_ENV !== 'test'");

    const nestFiles = generateCrud(schema, parseCrudTargetFlag("nestjs-typeorm"));
    const appMod = nestFiles.find((f) => f.path.endsWith("app.module.ts"))!.content;
    expect(appMod).toContain("TYPEORM_SYNC");
    expect(appMod).not.toMatch(/synchronize:\s*true/);
    const service = nestFiles.find((f) => f.path.endsWith(".service.ts") && f.path.includes("users"))!.content;
    expect(service).toContain("const patch = { ...data }");
    expect(service).not.toMatch(/delete \(existing as any\)/);
    const main = nestFiles.find((f) => f.path.endsWith("main.ts"))!.content;
    expect(main).toContain("forbidNonWhitelisted: true");
    expect(main).toContain("export async function createApp");
    const dto = nestFiles.find((f) => f.path.endsWith(".dto.ts"))!.content;
    expect(dto).toContain("CreateUsersDto");
    expect(dto).not.toMatch(/^\s*id[!?]:/m);
    expect(nestFiles.find((f) => f.path.endsWith("data-source.ts"))!.content).toContain("synchronize: false");
    expect(nestFiles.find((f) => f.path === "README.md")!.content).toContain("migration:run");
  });

  it("typeorm express zod schema excludes pk and rejects unexpected props via strict", () => {
    const schema = inferSchema([{ id: 1, name: "Ada", age: 30 }], { dialect: "sqlite", rootTableName: "users" });
    const files = generateCrud(schema, parseCrudTargetFlag("express-typeorm"));
    const route = files.find((f) => f.path.includes("routes/users"))!.content;
    expect(route).toContain(".strict()");
    expect(route).toContain('"name"');
    expect(route).toContain('"age"');
    expect(route).not.toMatch(/createSchema = z\.object\(\{[^}]*"id"/s);
    expect(route).toContain("safeParse(req.body)");
  });

  it("typeorm nest uses IsInt for integer columns and strips pk on update", () => {
    const schema = inferSchema([{ id: 1, name: "Ada", qty: 2 }], { dialect: "sqlite", rootTableName: "items" });
    const files = generateCrud(schema, parseCrudTargetFlag("nestjs-typeorm"));
    const dto = files.find((f) => f.path.endsWith(".dto.ts"))!.content;
    expect(dto).toContain("@IsInt()");
    expect(dto).toContain("IsInt");
    const service = files.find((f) => f.path.endsWith(".service.ts") && f.path.includes("items"))!.content;
    expect(service).toContain('delete patch["id"]');
  });

  it("typeorm supports custom string primary keys", () => {
    const schema = inferSchema([{ code: "A1", name: "Ada" }], { dialect: "sqlite", rootTableName: "products" });
    const table = schema.tables[0];
    table.columns = table.columns.filter((c) => c.name !== "id");
    for (const c of table.columns) {
      c.isPrimaryKey = c.name === "code";
      c.autoIncrement = false;
    }
    table.primaryKey = ["code"];
    const files = generateCrud(schema, parseCrudTargetFlag("express-typeorm"));
    const entity = files.find((f) => f.path.includes(".entity.ts"))!.content;
    expect(entity).toContain('@PrimaryColumn({ type: "varchar" })');
    expect(entity).toContain("code");
    const route = files.find((f) => f.path.includes("routes/"))!.content;
    expect(route).toContain('"name"');
    // Client-supplied PK allowed on create only
    expect(route).toMatch(/createSchema[\s\S]*"code":\s*z\.string/);
    expect(route).toMatch(/updateSchema[\s\S]*\.strict\(\)/);
    expect(route).not.toMatch(/updateSchema = z\.object\(\{[^}]*"code"/s);
  });
});
