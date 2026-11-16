#!/usr/bin/env node
/**
 * Publish @json-to-sql/core then @json-to-sql/cli.
 * Skips a package if that exact version already exists (idempotent recovery).
 * Does not print tokens. Fails hard on publish errors.
 *
 * Env:
 *   DRY_RUN=true — print actions only
 */
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const requireJson = createRequire(import.meta.url);
const corePkg = requireJson("../packages/core/package.json");
const version = corePkg.version;
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dryRun = process.env.DRY_RUN === "true";
const isWin = process.platform === "win32";

function run(cmd, args, extraEnv = {}) {
  return spawnSync(cmd, args, {
    cwd: root,
    encoding: "utf8",
    shell: isWin,
    timeout: 300000,
    env: { ...process.env, ...extraEnv },
  });
}

function view(name, ver) {
  const r = run("npm", ["view", `${name}@${ver}`, "version", "--registry", "https://registry.npmjs.org"]);
  if (r.status !== 0) return null;
  return String(r.stdout || "").trim() || null;
}

function publishWorkspace(name) {
  console.log(`Publishing ${name}@${version} ...`);
  if (dryRun) {
    console.log(`DRY_RUN skip real publish for ${name}`);
    return;
  }
  const r = run("npm", ["publish", "-w", name, "--access", "public", "--provenance"]);
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  if (r.status !== 0) {
    console.error(`FAIL npm publish ${name}@${version}`);
    process.exit(1);
  }
  console.log(`ok published ${name}@${version}`);
}

function sleep(ms) {
  spawnSync(process.execPath, ["-e", `Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,${ms})`], {
    stdio: "ignore",
  });
}

function waitForRegistry(name, ver, attempts = 36, delayMs = 5000) {
  for (let i = 1; i <= attempts; i += 1) {
    if (view(name, ver)) {
      console.log(`ok registry sees ${name}@${ver}`);
      return;
    }
    console.log(`waiting for ${name}@${ver} (${i}/${attempts})`);
    sleep(delayMs);
  }
  console.error(`FAIL timed out waiting for ${name}@${ver} on registry`);
  process.exit(1);
}

const packages = ["@json-to-sql/core", "@json-to-sql/cli"];

for (const name of packages) {
  if (view(name, version)) {
    console.log(`SKIP ${name}@${version} already published`);
    continue;
  }
  publishWorkspace(name);
  if (!dryRun && name === "@json-to-sql/core") {
    waitForRegistry("@json-to-sql/core", version);
  }
}

console.log("npm-publish-ordered finished");
