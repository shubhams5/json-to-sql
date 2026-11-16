#!/usr/bin/env node
/**
 * Generate all four CRUD targets, prisma validate, tsc each target,
 * Prisma + TypeORM SQLite smokes when possible.
 * When CI=true, Prisma engine-download skips are failures.
 * TLS: never sets NODE_TLS_REJECT_UNAUTHORIZED; use NODE_EXTRA_CA_CERTS for corporate CAs.
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
const isWin = process.platform === "win32";

function npmCmd() {
  return isWin ? "npm.cmd" : "npm";
}
function npxCmd() {
  return isWin ? "npx.cmd" : "npx";
}

function run(cmd, args, cwd, timeout = 300000, extraEnv = {}) {
  // Unix: shell off. Windows: .cmd shims (npm/npx) require shell.
  return spawnSync(cmd, args, {
    cwd,
    encoding: "utf8",
    shell: isWin,
    timeout,
    env: { ...process.env, ...extraEnv },
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

function failOrWarnNative(label, detail) {
  if (ciStrict) {
    console.error(detail);
    console.error(`FAIL ${label} (native module unavailable in CI)`);
    failed = true;
  } else {
    console.warn(`WARN ${label} skipped (${detail})`);
  }
}

/** Try to materialize better-sqlite3 binary; return true if require works. */
function ensureBetterSqlite3(dir, label) {
  run(npmCmd(), ["rebuild", "better-sqlite3"], dir, 180000);
  const probe = run(
    "node",
    ["-e", "require('better-sqlite3'); console.log('better-sqlite3-ok')"],
    dir,
    30000
  );
  if (probe.status === 0 && String(probe.stdout).includes("better-sqlite3-ok")) return true;
  const detail = (probe.stderr || probe.stdout || "better-sqlite3 load failed").toString().trim().slice(-400);
  failOrWarnNative(`${label} better-sqlite3`, detail || "no prebuild / native compile failed");
  return false;
}

function writeArtifacts(dir, files) {
  for (const f of files) {
    const path = join(dir, f.path);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, f.content);
  }
}

try {
  for (const key of targets) {
    const dir = join(root, key);
    mkdirSync(dir, { recursive: true });
    const files = generateCrud(schema, parseCrudTargetFlag(key));
    writeArtifacts(dir, files);
    for (const r of ["package.json", "README.md", "src/main.ts"]) {
      try {
        readFileSync(join(dir, r));
      } catch {
        console.error(`FAIL ${key}: missing ${r}`);
        failed = true;
      }
    }
    console.log(`ok generated ${key} (${files.length} files)`);

    // Always ignore scripts so install succeeds without native toolchains.
    // TypeORM SQLite smoke separately probes better-sqlite3 (CI must have prebuilds).
    const install = run(npmCmd(), ["install", "--ignore-scripts", "--no-audit", "--no-fund"], dir);
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
      const validate = run(npxCmd(), ["prisma", "validate"], dir);
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
      const gen = run(npxCmd(), ["prisma", "generate"], dir);
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
      const tsc = run(npxCmd(), ["tsc", "-p", "tsconfig.json", "--noEmit"], dir);
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

  // Express+Prisma SQLite CRUD + HTTP smoke
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
    const push = run(npxCmd(), ["prisma", "db", "push"], smokeDir);
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
      const httpSmoke = run(npxCmd(), ["tsx", "http-smoke.mjs"], smokeDir, 60000);
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

  // Express TypeORM SQLite HTTP smoke (TYPEORM_SYNC opt-in for throwaway DB only)
  {
    const dir = join(root, "express-typeorm");
    if (!ensureBetterSqlite3(dir, "express-typeorm")) {
      /* warned or failed above */
    } else {
      writeFileSync(
        join(dir, "typeorm-http-smoke.mjs"),
        `
process.env.NODE_ENV = 'test';
process.env.TYPEORM_SYNC = 'true';
process.env.DB_TYPE = 'better-sqlite3';
process.env.DB_NAME = 'express-smoke.db';
const { createApp } = await import('./src/main.ts');
const { AppDataSource } = await import('./src/data-source.ts');
const app = await createApp();
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
if (bad.status !== 400) throw new Error('express-typeorm expected 400 unexpected, got ' + bad.status);

const created = await req('POST', '/people', { name: 'Ada' });
if (created.status !== 201) throw new Error('express-typeorm create failed: ' + created.status);
const id = created.json.id;

const got = await req('GET', '/people/' + id);
if (got.status !== 200 || got.json.name !== 'Ada') throw new Error('express-typeorm get failed');

const upd = await req('PUT', '/people/' + id, { name: 'Ada Lovelace' });
if (upd.status !== 200 || upd.json.name !== 'Ada Lovelace') throw new Error('express-typeorm put failed');

const child = await req('POST', '/people_profile', { people_id: id, city: 'London', tags: 'math' });
if (child.status !== 201) throw new Error('express-typeorm FK child create failed: ' + child.status + ' ' + JSON.stringify(child.json));

const del = await req('DELETE', '/people_profile/' + child.json.id);
if (del.status !== 204) throw new Error('express-typeorm child delete failed');

const delP = await req('DELETE', '/people/' + id);
if (delP.status !== 204) throw new Error('express-typeorm parent delete failed');

server.close();
await AppDataSource.destroy();
console.log('express-typeorm-http-smoke-ok');
`
      );
      const smoke = run(npxCmd(), ["tsx", "typeorm-http-smoke.mjs"], dir, 120000);
      if (smoke.status !== 0 || !String(smoke.stdout).includes("express-typeorm-http-smoke-ok")) {
        console.error(smoke.stdout, smoke.stderr);
        console.error("FAIL express-typeorm HTTP smoke");
        failed = true;
      } else {
        console.log("ok express-typeorm HTTP smoke");
      }
    }
  }

  // NestJS TypeORM SQLite HTTP smoke
  {
    const dir = join(root, "nestjs-typeorm");
    if (!ensureBetterSqlite3(dir, "nestjs-typeorm")) {
      /* warned or failed above */
    } else {
      writeFileSync(
        join(dir, "typeorm-http-smoke.mjs"),
        `
process.env.NODE_ENV = 'test';
process.env.TYPEORM_SYNC = 'true';
process.env.DB_TYPE = 'better-sqlite3';
process.env.DB_NAME = 'nest-smoke.db';
const { createApp } = await import('./src/main.ts');
const app = await createApp();
await app.listen(0);
const server = app.getHttpServer();
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
if (bad.status !== 400) throw new Error('nestjs-typeorm expected 400 unexpected, got ' + bad.status);

const created = await req('POST', '/people', { name: 'Ada' });
if (created.status !== 201 && created.status !== 200) throw new Error('nestjs-typeorm create failed: ' + created.status);
const id = created.json.id;

const got = await req('GET', '/people/' + id);
if (got.status !== 200 || got.json.name !== 'Ada') throw new Error('nestjs-typeorm get failed');

const upd = await req('PUT', '/people/' + id, { name: 'Ada Lovelace' });
if (upd.status !== 200 || upd.json.name !== 'Ada Lovelace') throw new Error('nestjs-typeorm put failed');

const child = await req('POST', '/people_profile', { people_id: id, city: 'London', tags: 'math' });
if (child.status !== 201 && child.status !== 200) throw new Error('nestjs-typeorm FK child failed: ' + child.status);

const delC = await req('DELETE', '/people_profile/' + child.json.id);
if (delC.status !== 200 && delC.status !== 204) throw new Error('nestjs-typeorm child delete failed');

const delP = await req('DELETE', '/people/' + id);
if (delP.status !== 200 && delP.status !== 204) throw new Error('nestjs-typeorm parent delete failed');

await app.close();
console.log('nestjs-typeorm-http-smoke-ok');
`
      );
      const smoke = run(npxCmd(), ["tsx", "typeorm-http-smoke.mjs"], dir, 180000);
      if (smoke.status !== 0 || !String(smoke.stdout).includes("nestjs-typeorm-http-smoke-ok")) {
        console.error(smoke.stdout, smoke.stderr);
        console.error("FAIL nestjs-typeorm HTTP smoke");
        failed = true;
      } else {
        console.log("ok nestjs-typeorm HTTP smoke");
      }
    }
  }

  // Custom string PK smoke (Express TypeORM)
  {
    const customSchema = inferSchema([{ code: "A1", name: "Widget" }], {
      dialect: "sqlite",
      rootTableName: "products",
    });
    const table = customSchema.tables[0];
    table.columns = table.columns.filter((c) => c.name !== "id");
    for (const c of table.columns) {
      c.isPrimaryKey = c.name === "code";
      c.autoIncrement = false;
    }
    table.primaryKey = ["code"];

    const dir = join(root, "express-typeorm-custom-pk");
    mkdirSync(dir, { recursive: true });
    writeArtifacts(dir, generateCrud(customSchema, parseCrudTargetFlag("express-typeorm")));
    const install = run(npmCmd(), ["install", "--ignore-scripts", "--no-audit", "--no-fund"], dir);
    if (install.status !== 0) {
      console.error(install.stdout, install.stderr);
      console.error("FAIL express-typeorm-custom-pk npm install");
      failed = true;
    } else if (!ensureBetterSqlite3(dir, "express-typeorm-custom-pk")) {
      /* warned or failed above */
    } else {
      writeFileSync(
        join(dir, "custom-pk-smoke.mjs"),
        `
process.env.NODE_ENV = 'test';
process.env.TYPEORM_SYNC = 'true';
process.env.DB_TYPE = 'better-sqlite3';
process.env.DB_NAME = 'custom-pk.db';
const { createApp } = await import('./src/main.ts');
const { AppDataSource } = await import('./src/data-source.ts');
const app = await createApp();
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

const created = await req('POST', '/products', { code: 'A1', name: 'Widget' });
if (created.status !== 201) throw new Error('custom pk create failed: ' + created.status);
const got = await req('GET', '/products/A1');
if (got.status !== 200 || got.json.code !== 'A1') throw new Error('custom pk get failed');
const badPk = await req('PUT', '/products/A1', { code: 'HACK', name: 'Nope' });
if (badPk.status !== 400) throw new Error('custom pk update should reject pk field, got ' + badPk.status);
const upd = await req('PUT', '/products/A1', { name: 'Gadget' });
if (upd.status !== 200 || upd.json.name !== 'Gadget' || upd.json.code !== 'A1') throw new Error('custom pk put failed');
const del = await req('DELETE', '/products/A1');
if (del.status !== 204) throw new Error('custom pk delete failed');
server.close();
await AppDataSource.destroy();
console.log('custom-pk-smoke-ok');
`
      );
      const smoke = run(npxCmd(), ["tsx", "custom-pk-smoke.mjs"], dir, 120000);
      if (smoke.status !== 0 || !String(smoke.stdout).includes("custom-pk-smoke-ok")) {
        console.error(smoke.stdout, smoke.stderr);
        console.error("FAIL express-typeorm custom PK smoke");
        failed = true;
      } else {
        console.log("ok express-typeorm custom PK smoke");
      }
    }
  }
} finally {
  try {
    rmSync(root, { recursive: true, force: true });
  } catch (err) {
    console.warn("WARN temp cleanup failed:", err instanceof Error ? err.message : err);
  }
}

if (failed) process.exit(1);
console.log("validate-generated passed");
