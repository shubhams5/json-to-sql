#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  buildExportBundle,
  inferSchema,
  parseJsonInput,
  type CrudTarget,
  type DbDialectId,
} from "@json-to-sql/core";

function usage(): never {
  console.log(`json2sql — generate SQL / CRUD from JSON

Usage:
  json2sql <input.json> [options]

Options:
  --dialect <postgres|mysql|mssql|sqlite>  Database dialect (default: postgres)
  --table <name>                           Root table name (default: my_table)
  --out <dir>                              Output directory (default: ./out)
  --nested <json_column|child_tables>      Nested strategy (default: child_tables)
  --crud <express-js|express-ts|nestjs>    Also emit CRUD project files
  --help                                   Show help
`);
  process.exit(0);
}

function parseArgs(argv: string[]) {
  const args = {
    input: "" as string,
    dialect: "postgres" as DbDialectId,
    table: "my_table",
    out: "./out",
    nested: "child_tables" as "json_column" | "child_tables",
    crud: undefined as CrudTarget | undefined,
  };

  const rest = [...argv];
  while (rest.length) {
    const token = rest.shift()!;
    if (token === "--help" || token === "-h") usage();
    if (token === "--dialect") {
      args.dialect = rest.shift() as DbDialectId;
      continue;
    }
    if (token === "--table") {
      args.table = rest.shift()!;
      continue;
    }
    if (token === "--out") {
      args.out = rest.shift()!;
      continue;
    }
    if (token === "--nested") {
      args.nested = rest.shift() as "json_column" | "child_tables";
      continue;
    }
    if (token === "--crud") {
      const value = rest.shift()!;
      if (value === "express-js") args.crud = { runtime: "nodejs", framework: "express", language: "javascript" };
      else if (value === "express-ts") args.crud = { runtime: "nodejs", framework: "express", language: "typescript" };
      else if (value === "nestjs") args.crud = { runtime: "nodejs", framework: "nestjs", language: "typescript" };
      else throw new Error(`Unknown --crud value: ${value}`);
      continue;
    }
    if (token.startsWith("-")) throw new Error(`Unknown option: ${token}`);
    args.input = token;
  }

  if (!args.input) usage();
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const raw = readFileSync(resolve(args.input), "utf8");
  const parsed = parseJsonInput(raw);
  const schema = inferSchema(parsed.rows, {
    dialect: args.dialect,
    rootTableName: args.table,
    nestedStrategy: args.nested,
  });
  const artifacts = buildExportBundle(schema, parsed.rows, args.crud);
  const outDir = resolve(args.out);
  for (const artifact of artifacts) {
    const target = resolve(outDir, artifact.path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, artifact.content, "utf8");
    console.log(`wrote ${artifact.path}`);
  }
}

try {
  main();
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
