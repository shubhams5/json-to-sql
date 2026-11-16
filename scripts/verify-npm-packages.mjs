#!/usr/bin/env node
/**
 * Pre-publish / post-pack verification for @json-to-sql/core and @json-to-sql/cli.
 * Does not publish. Does not print credentials.
 */
import { createRequire } from "node:module";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const requireJson = createRequire(import.meta.url);

const corePkg = requireJson("../packages/core/package.json");
const cliPkg = requireJson("../packages/cli/package.json");
const rootPkg = requireJson("../package.json");

let failed = false;
function fail(msg) {
  console.error(`FAIL ${msg}`);
  failed = true;
}
function ok(msg) {
  console.log(`ok ${msg}`);
}

function run(cmd, args, cwd, timeout = 120000) {
  return spawnSync(cmd, args, {
    cwd,
    encoding: "utf8",
    shell: process.platform === "win32",
    timeout,
    env: { ...process.env },
  });
}

// --- metadata ---
if (corePkg.name !== "@json-to-sql/core") fail(`core name=${corePkg.name}`);
else ok(`core name ${corePkg.name}`);
if (cliPkg.name !== "@json-to-sql/cli") fail(`cli name=${cliPkg.name}`);
else ok(`cli name ${cliPkg.name}`);

if (corePkg.version !== cliPkg.version) fail(`version mismatch core=${corePkg.version} cli=${cliPkg.version}`);
else ok(`package versions ${corePkg.version}`);

if (rootPkg.version !== corePkg.version) fail(`root version ${rootPkg.version} != ${corePkg.version}`);
else ok(`root version matches ${rootPkg.version}`);

if (cliPkg.dependencies?.["@json-to-sql/core"] !== corePkg.version) {
  fail(`cli depends on ${cliPkg.dependencies?.["@json-to-sql/core"]} expected ${corePkg.version}`);
} else {
  ok(`cli → core dependency ${corePkg.version}`);
}

for (const [label, pkg] of [
  ["core", corePkg],
  ["cli", cliPkg],
]) {
  if (pkg.license !== "MIT") fail(`${label} license`);
  if (pkg.publishConfig?.access !== "public") fail(`${label} publishConfig.access`);
  if (!pkg.repository?.url?.includes("github.com/shubhams5/json-to-sql")) fail(`${label} repository.url`);
  if (!pkg.homepage) fail(`${label} homepage missing`);
  if (!pkg.bugs?.url) fail(`${label} bugs.url missing`);
  if (!pkg.engines?.node) fail(`${label} engines.node missing`);
  if (!Array.isArray(pkg.files) || !pkg.files.includes("dist")) fail(`${label} files must include dist`);
}
ok("metadata license/publishConfig/repository/homepage/bugs/engines/files");

if (!cliPkg.bin?.json2sql) fail("cli bin.json2sql missing");
else ok(`cli bin ${cliPkg.bin.json2sql}`);

// --- registry reachability (no auth) ---
{
  const ping = run("npm", ["ping", "--registry", "https://registry.npmjs.org"], root, 60000);
  if (ping.status !== 0) fail(`npm registry ping: ${(ping.stderr || ping.stdout || "").slice(0, 200)}`);
  else ok("npm registry reachable");
}

// --- published? (informational) ---
function registryVersion(name) {
  const r = run("npm", ["view", name, "version", "--registry", "https://registry.npmjs.org"], root, 60000);
  if (r.status !== 0) return null;
  return String(r.stdout || "").trim() || null;
}
const coreRemote = registryVersion("@json-to-sql/core");
const cliRemote = registryVersion("@json-to-sql/cli");
if (!coreRemote) ok("@json-to-sql/core not on registry yet (expected until first publish)");
else ok(`@json-to-sql/core latest on registry: ${coreRemote}`);
if (!cliRemote) ok("@json-to-sql/cli not on registry yet (expected until first publish)");
else ok(`@json-to-sql/cli latest on registry: ${cliRemote}`);

if (coreRemote === corePkg.version) {
  console.warn(`WARN @json-to-sql/core@${corePkg.version} already published — do not republish same version`);
}
if (cliRemote === cliPkg.version) {
  console.warn(`WARN @json-to-sql/cli@${cliPkg.version} already published — do not republish same version`);
}

// --- pack + tarball inspection ---
const packDir = mkdtempSync(join(tmpdir(), "j2s-pack-"));
try {
  for (const ws of ["@json-to-sql/core", "@json-to-sql/cli"]) {
    const dry = run("npm", ["pack", "-w", ws, "--dry-run"], root, 180000);
    const dryText = `${dry.stdout || ""}\n${dry.stderr || ""}`;
    if (dry.status !== 0) {
      fail(`${ws} npm pack --dry-run: ${dryText.slice(-400)}`);
      continue;
    }
    const hasDist = /dist\//.test(dryText);
    const hasPkg = /package\.json/.test(dryText);
    if (!hasDist) fail(`${ws} pack listing missing dist/`);
    if (!hasPkg) fail(`${ws} pack listing missing package.json`);
    if (/npm notice\s+src\//.test(dryText)) fail(`${ws} pack unexpectedly includes src/`);
    if (ws.endsWith("/cli") && !/dist\/cli\.js/.test(dryText)) fail(`${ws} pack missing dist/cli.js`);
    ok(`${ws} pack dry-run lists dist + package.json`);

    const pack = run("npm", ["pack", "-w", ws, "--pack-destination", packDir], root, 180000);
    if (pack.status !== 0) {
      fail(`${ws} npm pack: ${(pack.stderr || pack.stdout || "").slice(-400)}`);
      continue;
    }
    const lines = String(pack.stdout || "")
      .trim()
      .split(/\r?\n/)
      .filter(Boolean);
    const tgz = lines[lines.length - 1];
    const tgzPath = join(packDir, tgz);
    if (!existsSync(tgzPath)) fail(`${ws} missing tarball ${tgz}`);
    else ok(`${ws} tarball written ${tgz}`);
  }
} finally {
  try {
    rmSync(packDir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

// --- built exports exist ---
const coreIndex = join(root, "packages/core/dist/index.js");
const coreDts = join(root, "packages/core/dist/index.d.ts");
const cliJs = join(root, "packages/cli/dist/cli.js");
if (!existsSync(coreIndex)) fail("packages/core/dist/index.js missing — run npm run build:packages");
else ok("core dist/index.js");
if (!existsSync(coreDts)) fail("packages/core/dist/index.d.ts missing");
else ok("core dist/index.d.ts");
if (!existsSync(cliJs)) fail("packages/cli/dist/cli.js missing — run npm run build:packages");
else ok("cli dist/cli.js");

if (existsSync(coreIndex)) {
  try {
    const mod = await import(pathToFileURL(coreIndex).href);
    for (const key of ["inferSchema", "generateCrud", "parseJsonInput", "generateFullSqlBundle"]) {
      if (typeof mod[key] !== "function") fail(`core export missing: ${key}`);
    }
    ok("core exports resolvable");
  } catch (err) {
    fail(`core import failed: ${err instanceof Error ? err.message : err}`);
  }
}

if (failed) {
  console.error("verify-npm-packages failed");
  process.exit(1);
}
console.log("verify-npm-packages passed");
