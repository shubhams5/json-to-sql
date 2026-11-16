#!/usr/bin/env node
/**
 * Release gate: tag ↔ version consistency, duplicate-version detection.
 * Env:
 *   RELEASE_TAG — e.g. v0.3.0 (defaults to GITHUB_REF_NAME or argv[2])
 *   REQUIRE_UNPUBLISHED=true — fail if version already on registry (default true for publish jobs)
 */
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const requireJson = createRequire(import.meta.url);
const corePkg = requireJson("../packages/core/package.json");
const cliPkg = requireJson("../packages/cli/package.json");
const rootPkg = requireJson("../package.json");
const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const tagRaw =
  process.env.RELEASE_TAG ||
  process.env.GITHUB_REF_NAME ||
  process.argv[2] ||
  "";
const requireUnpublished = process.env.REQUIRE_UNPUBLISHED !== "false";

function run(args) {
  return spawnSync("npm", args, {
    cwd: root,
    encoding: "utf8",
    shell: process.platform === "win32",
    timeout: 60000,
    env: { ...process.env },
  });
}

function fail(msg) {
  console.error(`FAIL ${msg}`);
  process.exit(1);
}

if (!tagRaw) fail("RELEASE_TAG / GITHUB_REF_NAME / argv missing (expected vX.Y.Z)");
if (!/^v\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(tagRaw)) {
  fail(`tag "${tagRaw}" must match vMAJOR.MINOR.PATCH`);
}
const version = tagRaw.slice(1);

if (corePkg.version !== version) fail(`core version ${corePkg.version} != tag ${tagRaw}`);
if (cliPkg.version !== version) fail(`cli version ${cliPkg.version} != tag ${tagRaw}`);
if (rootPkg.version !== version) fail(`root version ${rootPkg.version} != tag ${tagRaw}`);
if (cliPkg.dependencies?.["@json-to-sql/core"] !== version) {
  fail(`cli dependency @json-to-sql/core@${cliPkg.dependencies?.["@json-to-sql/core"]} != ${version}`);
}
if (corePkg.name !== "@json-to-sql/core" || cliPkg.name !== "@json-to-sql/cli") {
  fail("unexpected package names");
}
if (corePkg.publishConfig?.access !== "public" || cliPkg.publishConfig?.access !== "public") {
  fail("publishConfig.access must be public");
}

console.log(`ok tag ${tagRaw} matches packages ${version}`);

function viewVersion(name, ver) {
  const r = run(["view", `${name}@${ver}`, "version", "--registry", "https://registry.npmjs.org"]);
  if (r.status !== 0) return null;
  return String(r.stdout || "").trim() || null;
}

const coreOn = viewVersion("@json-to-sql/core", version);
const cliOn = viewVersion("@json-to-sql/cli", version);

if (coreOn) {
  console.log(`INFO @json-to-sql/core@${version} already on registry`);
  if (requireUnpublished) fail(`@json-to-sql/core@${version} already published — bump version or skip republish`);
}
if (cliOn) {
  console.log(`INFO @json-to-sql/cli@${version} already on registry`);
  if (requireUnpublished) fail(`@json-to-sql/cli@${version} already published — bump version or skip republish`);
}

if (!coreOn) console.log(`ok @json-to-sql/core@${version} not yet published`);
if (!cliOn) console.log(`ok @json-to-sql/cli@${version} not yet published`);

console.log("release-preflight passed");
