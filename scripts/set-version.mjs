#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const version = process.argv[2]?.trim();

if (!version) {
  fail("usage: pnpm version:set <version>");
}
if (version.startsWith("v")) {
  fail('version should not include "v"; use 0.1.1, then tag v0.1.1');
}
if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
  fail("version must be Cargo-compatible SemVer, such as 0.1.1 or 0.2.0-beta.1");
}

const packagePath = join(repoRoot, "package.json");
const cargoPath = join(repoRoot, "src-tauri", "Cargo.toml");
const tauriConfigPath = join(repoRoot, "src-tauri", "tauri.conf.json");

await updateJsonVersion(packagePath, version);
await updateCargoVersion(cargoPath, version);
await updateJsonVersion(tauriConfigPath, version);

console.log(`version set to ${version}`);
console.log(`updated ${relative(packagePath)}`);
console.log(`updated ${relative(cargoPath)}`);
console.log(`updated ${relative(tauriConfigPath)}`);

async function updateJsonVersion(path, nextVersion) {
  const source = await readFile(path, "utf8");
  const data = JSON.parse(source);
  if (typeof data.version !== "string") {
    fail(`could not find version in ${relative(path)}`);
  }
  const versionPattern = /("version"\s*:\s*)"[^"]+"/;
  if (!versionPattern.test(source)) {
    fail(`could not update version in ${relative(path)}`);
  }
  const next = source.replace(versionPattern, `$1"${nextVersion}"`);
  await writeFile(path, next);
}

async function updateCargoVersion(path, nextVersion) {
  const source = await readFile(path, "utf8");
  const versionPattern = /^version\s*=\s*"[^"]+"/m;
  if (!versionPattern.test(source)) {
    fail(`could not find package version in ${relative(path)}`);
  }
  const next = source.replace(versionPattern, `version = "${nextVersion}"`);
  await writeFile(path, next);
}

function relative(path) {
  return path.replace(`${repoRoot}/`, "");
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
