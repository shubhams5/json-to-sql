import { describe, expect, it } from "vitest";
import { inferSchema } from "../schema/infer.js";
import { generateCrud, parseCrudTargetFlag } from "./generate.js";

describe("CRUD generators", () => {
  const schema = inferSchema([{ id: 1, name: "Ada" }], { dialect: "sqlite", rootTableName: "users" });

  it("express-prisma emits package.json, prisma schema, and routes", () => {
    const files = generateCrud(schema, parseCrudTargetFlag("express-prisma"));
    const paths = files.map((f) => f.path);
    expect(paths).toContain("package.json");
    expect(paths).toContain("prisma/schema.prisma");
    expect(paths.some((p) => p.startsWith("src/routes/"))).toBe(true);
    expect(files.find((f) => f.path === "README.md")?.content).toMatch(/npm install/);
  });

  it("nestjs-typeorm emits nest module and entities", () => {
    const files = generateCrud(schema, parseCrudTargetFlag("nestjs-typeorm"));
    expect(files.some((f) => f.path.includes(".entity.ts"))).toBe(true);
    expect(files.some((f) => f.path === "src/app.module.ts")).toBe(true);
  });

  it("escapes hostile column names in experimental scaffold", () => {
    const hostile = inferSchema([{ id: 1, "a'); bad": "x" }], { dialect: "sqlite", rootTableName: "t" });
    // column kept as original for schema; generator must not inject raw into strings unsafely
    const col = hostile.tables[0].columns.find((c) => c.originalName.includes("bad") || c.name.includes("bad") || c.originalName.includes("a"));
    expect(col).toBeTruthy();
    const files = generateCrud(hostile, parseCrudTargetFlag("nestjs"));
    const joined = files.map((f) => f.content).join("\n");
    expect(joined).not.toMatch(/a'\); bad/);
  });

  it("rejects unknown crud flags", () => {
    expect(() => parseCrudTargetFlag("nope")).toThrow(/Unknown/);
  });
});
