import { describe, expect, it } from "vitest";
import { inferSchema } from "../schema/infer.js";
import { buildExportBundle, exportCsv, exportJsonSchema, exportTypeScriptInterfaces } from "./index.js";
import { generateCrud } from "../crud/generate.js";

describe("export + crud", () => {
  const rows = [
    { id: 1, name: "Ada" },
    { id: 2, name: "Grace" },
  ];
  const schema = inferSchema(rows, { dialect: "postgres", rootTableName: "users" });

  it("exports typescript interfaces", () => {
    const file = exportTypeScriptInterfaces(schema);
    expect(file.content).toContain("export interface Users");
    expect(file.content).toContain("name");
  });

  it("exports json schema", () => {
    const file = exportJsonSchema(schema);
    const parsed = JSON.parse(file.content);
    expect(parsed.definitions.users).toBeTruthy();
  });

  it("exports csv", () => {
    const file = exportCsv(schema.tables[0], rows);
    expect(file.content.split("\n")[0]).toContain("id");
    expect(file.content).toContain("Ada");
  });

  it("builds bundle with crud", () => {
    const artifacts = buildExportBundle(schema, rows, {
      runtime: "nodejs",
      framework: "express",
      language: "typescript",
    });
    expect(artifacts.some((a) => a.path.endsWith(".sql"))).toBe(true);
    expect(artifacts.some((a) => a.path.includes("crud/"))).toBe(true);
  });

  it("generates nestjs modules", () => {
    const files = generateCrud(schema, { runtime: "nodejs", framework: "nestjs", language: "typescript" });
    expect(files.some((f) => f.path.includes(".module.ts"))).toBe(true);
  });
});
