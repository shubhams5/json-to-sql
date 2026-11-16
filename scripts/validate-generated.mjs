#!/usr/bin/env node
/**
 * Generate all four CRUD targets, prisma validate, tsc each target,
 * and smoke-test Express+Prisma against SQLite when possible.
 * When CI=true, Prisma engine-download skips are failures.
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
const ciStrict = process.env.CI === "true";

function run(cmd, args, cwd, timeout = 300000, extraEnv = {}) {
  const env = { ...process.env, ...extraEnv };
  // Do not force TLS reject off; callers may set NODE_TLS_REJECT_UNAUTHORIZED explicitly.
  return spawnSync(cmd, args, {
    cwd,
    encoding: "utf8",
    shell: true,
    timeout,
    env,
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

function failOrWarnEngine(label, out) {
  if (ciStrict) {
    console.error(out);
    console.error(`FAIL ${label} (engine download blocked in CI)`);
    failed = true;
  } else {
    console.warn(`WARN ${label} skipped (engine download blocked in this environment)`);
  }
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
        failOrWarnEngine(`${key} prisma validate`, validateOut);
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
        failOrWarnEngine(`${key} prisma generate`, genOut);
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
  } else if (ciStrict) {
    console.error(`FAIL ${key} tsc (prisma client not generated in CI)`);
    failed = true;
  } else {
    console.error(`SKIP ${key} tsc (prisma client not generated)`);
  }
}

// Express+Prisma SQLite CRUD + HTTP smoke (requires successful prisma generate)
const smokeDir = join(root, "express-prisma");
const clientExists = (() => {
  try {
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
      failOrWarnEngine("express-prisma db push", pushOut);
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

    writeFileSync(
      join(smokeDir, "http-smoke.mjs"),
      `
process.env.NODE_ENV = 'test';
const { default: app } = await import('./src/main.ts');
const server = app.listen(0);
const { port } = server.address();
const base = 'http://127.0.0.1:' + port;

async function req(method, path, body) {
  const res = await fetch(base + path, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, json };
}

const bad = await req('POST', '/people', { name: 'Ada', unexpected: true });
if (bad.status !== 400) throw new Error('expected 400 for extra key, got ' + bad.status);

const ok = await req('POST', '/people', { name: 'Ada' });
if (ok.status !== 201) throw new Error('expected 201 create, got ' + ok.status);

const filter = await req('GET', '/people?filter=' + encodeURIComponent(JSON.stringify({ hack: 1 })));
if (filter.status !== 400) throw new Error('expected 400 bad filter, got ' + filter.status);

server.close();
console.log('http-smoke-ok');
`
    );
    const httpSmoke = run("npx", ["tsx", "http-smoke.mjs"], smokeDir, 60000);
    if (httpSmoke.status !== 0 || !String(httpSmoke.stdout).includes("http-smoke-ok")) {
      console.error(httpSmoke.stdout, httpSmoke.stderr);
      console.error("FAIL express-prisma HTTP smoke");
      failed = true;
    } else {
      console.log("ok express-prisma HTTP smoke");
    }
  }
} else if (ciStrict) {
  console.error("FAIL express-prisma CRUD/HTTP smoke (Prisma engines unavailable in CI)");
  failed = true;
} else {
  console.warn("WARN express-prisma CRUD/HTTP smoke skipped (Prisma engines unavailable; CI fails this)");
}

rmSync(root, { recursive: true, force: true });
if (failed) process.exit(1);
console.log("validate-generated passed");
