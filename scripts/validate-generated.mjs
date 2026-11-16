#!/usr/bin/env node
/**
 * Generate CRUD projects into a temp dir and typecheck what we can without
 * full Nest/Prisma installs. Verifies required files + runs tsc on Express+TypeORM
 * with skipLibCheck after a minimal install.
 */
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";


async function loadCore() {
  try {
    return await import("@json-to-sql/core");
  } catch {
    // Workspace may need built dist
    return await import("../packages/core/dist/index.js");
  }
}

const { inferSchema, generateCrud, parseCrudTargetFlag } = await loadCore();

const rows = [{ id: 1, name: "Ada", active: true }];
const schema = inferSchema(rows, { dialect: "sqlite", rootTableName: "users" });

const targets = ["express-prisma", "express-typeorm", "nestjs-prisma", "nestjs-typeorm"];
const root = mkdtempSync(join(tmpdir(), "j2s-gen-"));

let failed = false;
for (const key of targets) {
  const dir = join(root, key);
  mkdirSync(dir, { recursive: true });
  const files = generateCrud(schema, parseCrudTargetFlag(key));
  for (const f of files) {
    const path = join(dir, f.path);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, f.content);
  }
  const required = ["package.json", "README.md", "src/main.ts"];
  for (const r of required) {
    try {
      readFileSync(join(dir, r));
    } catch {
      console.error(`FAIL ${key}: missing ${r}`);
      failed = true;
    }
  }
  if (key.includes("prisma")) {
    try {
      readFileSync(join(dir, "prisma/schema.prisma"));
    } catch {
      console.error(`FAIL ${key}: missing prisma/schema.prisma`);
      failed = true;
    }
  }
  console.log(`ok generated ${key} (${files.length} files)`);
}

// Typecheck express-typeorm with installed deps (lighter than Nest)
const typeormDir = join(root, "express-typeorm");
const install = spawnSync("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund"], {
  cwd: typeormDir,
  encoding: "utf8",
  shell: true,
  timeout: 300000,
});
if (install.status !== 0) {
  console.error(install.stdout);
  console.error(install.stderr);
  console.error("FAIL express-typeorm npm install");
  failed = true;
} else {
  const tsc = spawnSync("npx", ["tsc", "-p", "tsconfig.json", "--noEmit"], {
    cwd: typeormDir,
    encoding: "utf8",
    shell: true,
    timeout: 120000,
  });
  if (tsc.status !== 0) {
    console.error(tsc.stdout);
    console.error(tsc.stderr);
    console.error("FAIL express-typeorm tsc");
    failed = true;
  } else {
    console.log("ok express-typeorm tsc");
  }
}

rmSync(root, { recursive: true, force: true });
if (failed) process.exit(1);
console.log("validate-generated passed");
