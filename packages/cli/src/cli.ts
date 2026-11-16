#!/usr/bin/env node
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { createInterface } from "node:readline";
import {
  buildExportBundle,
  inferSchema,
  parseCrudTargetFlag,
  parseJsonInput,
  type CrudTarget,
  type DbDialectId,
} from "@json-to-sql/core";

const DIALECTS = new Set<DbDialectId>(["postgres", "mysql", "mssql", "sqlite"]);
const NESTED = new Set(["json_column", "child_tables"]);

function printUsage(): void {
  console.log(`json2sql — generate SQL / CRUD from JSON

Usage:
  json2sql <input.json|-> [options]
  cat data.json | json2sql - --out ./out

Options:
  --dialect <postgres|mysql|mssql|sqlite>   Database dialect (default: postgres)
  --table <name>                            Root table name (default: my_table)
  --out <dir>                               Output directory (default: ./out)
  --nested <json_column|child_tables>       Nested strategy (default: child_tables)
  --crud <express-prisma|express-typeorm|nestjs-prisma|nestjs-typeorm|
           express-js|express-ts|nestjs>    Emit CRUD project (last three experimental)
  --format <sql|all>                        Output formats (default: all)
  --overwrite                               Allow overwriting existing files
  --version                                 Print version
  --help                                    Show help
`);
}

function fail(message: string, code = 1): never {
  console.error(message);
  process.exit(code);
}

function readStdin(): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    if (process.stdin.isTTY) {
      reject(new Error("No stdin data (terminal is a TTY). Pass a file path or pipe JSON."));
      return;
    }
    const chunks: string[] = [];
    const rl = createInterface({ input: process.stdin });
    rl.on("line", (line) => chunks.push(line));
    rl.on("close", () => resolvePromise(chunks.join("\n")));
    rl.on("error", reject);
  });
}

function parseArgs(argv: string[]) {
  const args = {
    input: "" as string,
    dialect: "postgres" as DbDialectId,
    table: "my_table",
    out: "./out",
    nested: "child_tables" as "json_column" | "child_tables",
    crud: undefined as CrudTarget | undefined,
    format: "all" as "sql" | "all",
    overwrite: false,
  };

  const rest = [...argv];
  while (rest.length) {
    const token = rest.shift()!;
    const eq = token.indexOf("=");
    let flag = token;
    let inline: string | undefined;
    if (token.startsWith("--") && eq > 1) {
      flag = token.slice(0, eq);
      inline = token.slice(eq + 1);
    }

    const takeValue = (): string => {
      const v = inline ?? rest.shift();
      if (v === undefined || v.startsWith("-")) fail(`Missing value for ${flag}`);
      return v;
    };

    if (flag === "--help" || flag === "-h") {
      printUsage();
      process.exit(0);
    }
    if (flag === "--version" || flag === "-v") {
      console.log("0.2.0");
      process.exit(0);
    }
    if (flag === "--overwrite") {
      args.overwrite = true;
      continue;
    }
    if (flag === "--dialect") {
      const v = takeValue() as DbDialectId;
      if (!DIALECTS.has(v)) fail(`Unknown dialect: ${v}`);
      args.dialect = v;
      continue;
    }
    if (flag === "--table") {
      args.table = takeValue();
      continue;
    }
    if (flag === "--out") {
      args.out = takeValue();
      continue;
    }
    if (flag === "--nested") {
      const v = takeValue();
      if (!NESTED.has(v)) fail(`Unknown --nested value: ${v}`);
      args.nested = v as "json_column" | "child_tables";
      continue;
    }
    if (flag === "--crud") {
      try {
        args.crud = parseCrudTargetFlag(takeValue());
      } catch (err) {
        fail(err instanceof Error ? err.message : String(err));
      }
      continue;
    }
    if (flag === "--format") {
      const v = takeValue();
      if (v !== "sql" && v !== "all") fail(`Unknown --format: ${v}`);
      args.format = v;
      continue;
    }
    if (flag.startsWith("-") && flag !== "-") fail(`Unknown option: ${flag}`);
    if (args.input) fail("Multiple input files not supported; pass one file or '-' for stdin");
    args.input = flag === "-" ? "-" : token;
  }

  if (!args.input) {
    printUsage();
    process.exit(1);
  }
  return args;
}

function assertSafeOutDir(outDir: string): string {
  const resolved = resolve(outDir);
  const cwd = resolve(process.cwd());
  const rel = relative(cwd, resolved);
  if (isAbsolute(rel) || rel.startsWith("..")) {
    fail(`Refusing to write outside working directory: ${outDir}`);
  }
  try {
    const st = statSync(resolved);
    if (st.isFile()) fail(`--out path is a file, not a directory: ${outDir}`);
  } catch {
    // does not exist yet — ok
  }
  return resolved;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  let raw: string;
  if (args.input === "-") {
    raw = await readStdin();
  } else {
    const inputPath = resolve(args.input);
    try {
      const st = statSync(inputPath);
      if (!st.isFile()) fail(`Input is not a file: ${args.input}`);
      if (st.size > 5 * 1024 * 1024) fail(`Input file exceeds 5MB before parse: ${args.input}`);
    } catch (err) {
      fail(err instanceof Error ? err.message : String(err));
    }
    raw = readFileSync(inputPath, "utf8");
  }

  const parsed = parseJsonInput(raw);
  for (const w of parsed.warnings) console.warn(`warn: ${w}`);

  const schema = inferSchema(parsed.rows, {
    dialect: args.dialect,
    rootTableName: args.table,
    nestedStrategy: args.nested,
  });
  for (const w of schema.warnings ?? []) console.warn(`warn: ${w}`);

  let artifacts = buildExportBundle(schema, parsed.rows, args.crud);
  if (args.format === "sql") {
    artifacts = artifacts.filter((a) => a.path.endsWith(".sql"));
  }

  const outDir = assertSafeOutDir(args.out);
  mkdirSync(outDir, { recursive: true });

  for (const artifact of artifacts) {
    if (artifact.path.includes("..") || artifact.path.startsWith("/") || artifact.path.includes("\\..")) {
      fail(`Refusing unsafe artifact path: ${artifact.path}`);
    }
    const target = resolve(outDir, artifact.path);
    const rel = relative(outDir, target);
    if (rel.startsWith("..") || isAbsolute(rel)) fail(`Path traversal blocked: ${artifact.path}`);
    mkdirSync(dirname(target), { recursive: true });
    try {
      statSync(target);
      if (!args.overwrite) fail(`Refusing to overwrite ${artifact.path} (pass --overwrite)`);
    } catch {
      // ok
    }
    writeFileSync(target, artifact.content, "utf8");
    console.log(`wrote ${artifact.path}`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
