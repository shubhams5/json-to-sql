import { describe, expect, it } from "vitest";
import { inferSchema } from "../schema/infer.js";
import { generateCrud, parseCrudTargetFlag } from "./generate.js";
import {
  assertTypeOrmForeignKeys,
  renderTypeOrmEntity,
  typeormDriverType,
  typeormEnvExample,
} from "./typeormGen.js";

describe("TypeORM dialect config", () => {
  it("maps dialects to drivers and env examples", () => {
    expect(typeormDriverType("sqlite")).toBe("better-sqlite3");
    expect(typeormDriverType("postgres")).toBe("postgres");
    expect(typeormDriverType("mysql")).toBe("mysql");
    expect(typeormDriverType("mssql")).toBe("mssql");
    expect(typeormEnvExample("postgres")).toContain("DB_TYPE=postgres");
    expect(typeormEnvExample("postgres")).toContain("DB_PORT=5432");
    expect(typeormEnvExample("mysql")).toContain("DB_PORT=3306");
    expect(typeormEnvExample("mssql")).toContain("DB_PORT=1433");
    expect(typeormEnvExample("mssql")).toContain("DB_TRUST_SERVER_CERTIFICATE");
    expect(typeormEnvExample("sqlite")).toContain("DB_TYPE=better-sqlite3");
    expect(typeormEnvExample("sqlite")).not.toContain("DB_HOST");
  });

  it("nestjs typeorm env and forRoot follow schema dialect", () => {
    for (const dialect of ["postgres", "mysql", "mssql", "sqlite"] as const) {
      const schema = inferSchema([{ id: 1, name: "Ada" }], { dialect, rootTableName: "users" });
      const files = generateCrud(schema, parseCrudTargetFlag("nestjs-typeorm"));
      const env = files.find((f) => f.path === ".env.example")!.content;
      expect(env).toContain(`DB_TYPE=${typeormDriverType(dialect)}`);
      const app = files.find((f) => f.path.endsWith("app.module.ts"))!.content;
      expect(app).toContain(`?? "${typeormDriverType(dialect)}"`);
      expect(app).toContain("TYPEORM_SYNC");
      expect(app).not.toMatch(/synchronize:\s*true\b/);
      const ds = files.find((f) => f.path.endsWith("data-source.ts"))!.content;
      expect(ds).toContain("synchronize: false");
      expect(ds).toContain("migrations:");
      if (dialect === "mssql") {
        expect(app).toContain("trustServerCertificate");
        expect(ds).toContain("trustServerCertificate");
      }
    }
  });

  it("express typeorm env follows dialect", () => {
    const schema = inferSchema([{ id: 1, name: "Ada" }], { dialect: "mysql", rootTableName: "users" });
    const files = generateCrud(schema, parseCrudTargetFlag("express-typeorm"));
    expect(files.find((f) => f.path === ".env.example")!.content).toContain("DB_TYPE=mysql");
    expect(files.find((f) => f.path.endsWith("data-source.ts"))!.content).toContain('?? "mysql"');
  });
});

describe("TypeORM relations", () => {
  it("emits ManyToOne/OneToMany/JoinColumn for nested child tables", () => {
    const schema = inferSchema([{ id: 1, name: "Ada", profile: { city: "X" } }], {
      dialect: "sqlite",
      rootTableName: "people",
    });
    const child = schema.tables.find((t) => t.name !== "people")!;
    const parentEntity = renderTypeOrmEntity(schema, schema.tables.find((t) => t.name === "people")!, {
      importExt: "",
    });
    const childEntity = renderTypeOrmEntity(schema, child, { importExt: "" });
    expect(childEntity).toContain("@ManyToOne");
    expect(childEntity).toContain("@JoinColumn");
    expect(childEntity).toContain("onDelete:");
    expect(parentEntity).toContain("@OneToMany");
  });

  it("supports two FKs to the same parent with distinct relation props", () => {
    const schema = inferSchema([{ id: 1, name: "a" }], { dialect: "sqlite", rootTableName: "users" });
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
          onDelete: "RESTRICT",
          onUpdate: "CASCADE",
        },
      ],
    });
    const entity = renderTypeOrmEntity(schema, schema.tables.find((t) => t.name === "edges")!, { importExt: ".js" });
    expect(entity).toContain("fkFrom");
    expect(entity).toContain("fkTo");
    expect(entity).toContain('onDelete: "CASCADE"');
    expect(entity).toContain('onDelete: "RESTRICT"');
    expect(entity).toContain("from './users.entity.js'");
  });

  it("rejects composite foreign keys", () => {
    const schema = inferSchema([{ id: 1, name: "a" }], { dialect: "sqlite", rootTableName: "users" });
    schema.tables.push({
      name: "pair",
      originalName: "pair",
      sourcePath: "$.pair",
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
          name: "a",
          originalName: "a",
          inferredType: "integer",
          sqlType: "INTEGER",
          nullable: false,
          isPrimaryKey: false,
          isUnique: false,
          isExcluded: false,
        },
        {
          name: "b",
          originalName: "b",
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
          id: "fk_comp",
          name: "fk_comp",
          columns: ["a", "b"],
          refTable: "users",
          refColumns: ["id", "id"],
          onDelete: "CASCADE",
          onUpdate: "NO ACTION",
        },
      ],
    });
    expect(() => assertTypeOrmForeignKeys(schema, "express-typeorm")).toThrow(/composite foreign key/i);
    expect(() => generateCrud(schema, parseCrudTargetFlag("express-typeorm"))).toThrow(/composite foreign key/i);
  });

  it("handles self-referencing FK without self-import", () => {
    const schema = inferSchema([{ id: 1, name: "n" }], { dialect: "sqlite", rootTableName: "nodes" });
    const table = schema.tables[0];
    table.columns.push({
      name: "parent_id",
      originalName: "parent_id",
      inferredType: "integer",
      sqlType: "INTEGER",
      nullable: true,
      isPrimaryKey: false,
      isUnique: false,
      isExcluded: false,
    });
    table.foreignKeys.push({
      id: "fk_parent",
      name: "fk_parent",
      columns: ["parent_id"],
      refTable: "nodes",
      refColumns: ["id"],
      onDelete: "SET NULL",
      onUpdate: "NO ACTION",
    });
    const entity = renderTypeOrmEntity(schema, table, { importExt: "" });
    expect(entity).toContain("@ManyToOne(() => Nodes");
    expect(entity).toContain("@OneToMany(() => Nodes");
    expect(entity).not.toMatch(/from '\.\/nodes\.entity'/);
  });
});
