#!/usr/bin/env node
/** Pack @json-to-sql/core and import it from an independent temp project. */
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const isWin = process.platform === "win32";
const npmBin = isWin ? "npm.cmd" : "npm";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
let dir;
let tgz;

try {
  const pack = spawnSync(npmBin, ["pack", "-w", "@json-to-sql/core", "--pack-destination", root], {
    cwd: root,
    encoding: "utf8",
    shell: isWin,
  });
  if (pack.status !== 0) {
    console.error(pack.stdout, pack.stderr);
    process.exit(1);
  }
  const tgzLine = (pack.stdout || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .pop();
  tgz = join(root, tgzLine);
  dir = mkdtempSync(join(tmpdir(), "j2s-consumer-"));
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify({ name: "consumer", type: "module", private: true }, null, 2)
  );
  writeFileSync(
    join(dir, "index.mjs"),
    `import { inferSchema, parseJsonInput } from '@json-to-sql/core';
const { rows } = parseJsonInput('[{"id":1,"name":"Ada"}]');
const schema = inferSchema(rows, { dialect: 'sqlite', rootTableName: 't' });
if (!schema.tables.length) throw new Error('no tables');
console.log('consumer-ok', schema.rootTableName);
`
  );
  const install = spawnSync(npmBin, ["install", tgz, "--no-audit", "--no-fund"], {
    cwd: dir,
    encoding: "utf8",
    shell: isWin,
    timeout: 180000,
  });
  if (install.status !== 0) {
    console.error(install.stdout, install.stderr);
    process.exit(1);
  }
  const run = spawnSync(process.execPath, ["index.mjs"], { cwd: dir, encoding: "utf8", shell: false });
  if (run.status !== 0 || !String(run.stdout).includes("consumer-ok")) {
    console.error(run.stdout, run.stderr);
    process.exit(1);
  }
  console.log("consumer-import passed");
} finally {
  if (dir) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
  if (tgz) {
    try {
      rmSync(tgz, { force: true });
    } catch {
      /* ignore */
    }
  }
}
