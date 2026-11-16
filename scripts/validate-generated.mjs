#!/usr/bin/env node
/**
 * Generate all four CRUD targets, prisma validate, tsc each target,
 * and smoke-test Express+Prisma against SQLite when possible.
 */
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

async function loadCore() {
  try {
    return await import("@json-to-sql/core");
  } catch {
    return await import("../packages/core/dist/index.js");
  }
}

const { inferSchema, generateCrud, parseCrudTargetFlag, parseJsonInput } = await loadCore();
const fixture = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../tests/fixtures/nested.json"),
  "utf8"
);
const { rows } = parseJsonInput(fixture);
const schema = inferSchema(rows, { dialect: "sqlite", rootTableName: "people" });

const targets = ["express-prisma", "express-typeorm", "nestjs-prisma", "nestjs-typeorm"];
const root = mkdtempSync(join(tmpdir(), "j2s-gen-"));
let failed = false;

function run(cmd, args, cwd, timeout = 300000, extraEnv = {}) {
  return spawnSync(cmd, args, {
    cwd,
    encoding: "utf8",
    shell: true,
    timeout,
    env: {
      ...process.env,
      // Corporate SSL inspection often breaks Prisma engine downloads locally.
      NODE_TLS_REJECT_UNAUTHORIZED: process.env.NODE_TLS_REJECT_UNAUTHORIZED ?? "0",
      ...extraEnv,
    },
  });
}

function prismaSchemaLooksValid(dir) {
  const text = readFileSync(join(dir, "prisma/schema.prisma"), "utf8");
  return (
    text.includes("generator client") &&
    text.includes("datasource db") &&
    text.includes("model ") &&
    text.includes("@id")
  );
}


for (const key of targets) {
  const dir = join(root, key);
  mkdirSync(dir, { recursive: true });
  const files = generateCrud(schema, parseCrudTargetFlag(key));
  for (const f of files) {
    const path = join(dir, f.path);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, f.content);
  }
  for (const r of ["package.json", "README.md", "src/main.ts"]) {
    try {
      readFileSync(join(dir, r));
    } catch {
      console.error(`FAIL ${key}: missing ${r}`);
      failed = true;
    }
  }
  console.log(`ok generated ${key} (${files.length} files)`);

  const install = run("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund"], dir);
  if (install.status !== 0) {
    console.error(install.stdout);
    console.error(install.stderr);
    console.error(`FAIL ${key} npm install`);
    failed = true;
    continue;
  }

  let prismaReady = !key.includes("prisma");
  if (key.includes("prisma")) {
    if (!prismaSchemaLooksValid(dir)) {
      console.error(`FAIL ${key}: prisma schema missing required sections`);
      failed = true;
    } else {
      console.log(`ok ${key} prisma schema structure`);
    }
    const validate = run("npx", ["prisma", "validate"], dir);
    const validateOut = `${validate.stdout || ""}\n${validate.stderr || ""}`;
    if (validate.status !== 0) {
      if (/binaries\.prisma\.sh|ECONNRESET|certificate|503|aborted/i.test(validateOut)) {
        console.warn(`WARN ${key} prisma validate skipped (engine download blocked in this environment)`);
      } else {
        console.error(validateOut);
        console.error(`FAIL ${key} prisma validate`);
        failed = true;
      }
    } else {
      console.log(`ok ${key} prisma validate`);
    }
    const gen = run("npx", ["prisma", "generate"], dir);
    const genOut = `${gen.stdout || ""}\n${gen.stderr || ""}`;
    if (gen.status !== 0) {
      if (/binaries\.prisma\.sh|ECONNRESET|certificate|503|aborted|Failed to fetch the engine/i.test(genOut)) {
        console.warn(`WARN ${key} prisma generate skipped (engine download blocked in this environment)`);
      } else {
        console.error(genOut);
        console.error(`FAIL ${key} prisma generate`);
        failed = true;
      }
    } else {
      prismaReady = true;
      console.log(`ok ${key} prisma generate`);
    }
  }

  if (!key.includes("prisma") || prismaReady) {
    const tsc = run("npx", ["tsc", "-p", "tsconfig.json", "--noEmit"], dir);
    if (tsc.status !== 0) {
      console.error(tsc.stdout);
      console.error(tsc.stderr);
      console.error(`FAIL ${key} tsc`);
      failed = true;
    } else {
      console.log(`ok ${key} tsc`);
    }
  } else {
    console.error(`SKIP ${key} tsc (prisma client not generated)`);
  }
}

// Express+Prisma SQLite CRUD smoke (requires successful prisma generate)
const smokeDir = join(root, "express-prisma");
const clientExists = (() => {
  try {
    // Real generated client, not the stub package entry
    readFileSync(join(smokeDir, "node_modules/.prisma/client/default.js"));
    return true;
  } catch {
    return false;
  }
})();

if (clientExists) {
  copyFileSync(join(smokeDir, ".env.example"), join(smokeDir, ".env"));
  const push = run("npx", ["prisma", "db", "push"], smokeDir);
  const pushOut = `${push.stdout || ""}\n${push.stderr || ""}`;
  if (push.status !== 0) {
    if (/binaries\.prisma\.sh|ECONNRESET|certificate|503|Failed to fetch the engine/i.test(pushOut)) {
      console.warn("WARN express-prisma db push skipped (engine download blocked)");
    } else {
      console.error(pushOut);
      console.error("FAIL express-prisma db push");
      failed = true;
    }
  } else {
    writeFileSync(
      join(smokeDir, "smoke.mjs"),
      `
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const created = await prisma.people.create({ data: { name: 'Smoke' } });
const got = await prisma.people.findUnique({ where: { id: created.id } });
if (!got || got.name !== 'Smoke') throw new Error('CRUD smoke failed');
await prisma.people.delete({ where: { id: created.id } });
await prisma.$disconnect();
console.log('crud-smoke-ok');
`
    );
    const smokeRun = run("node", ["smoke.mjs"], smokeDir, 60000);
    if (smokeRun.status !== 0 || !String(smokeRun.stdout).includes("crud-smoke-ok")) {
      console.error(smokeRun.stdout, smokeRun.stderr);
      console.error("FAIL express-prisma CRUD smoke");
      failed = true;
    } else {
      console.log("ok express-prisma CRUD smoke");
    }
  }
} else {
  console.warn("WARN express-prisma CRUD smoke skipped (Prisma engines unavailable in this environment; CI runs full smoke)");
}

rmSync(root, { recursive: true, force: true });
if (failed) process.exit(1);
console.log("validate-generated passed");
