#!/usr/bin/env node

import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { access, chmod, copyFile, mkdir, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const manifestPath = join(__dirname, "zeroclaw-sidecars.json");
const outDir = join(repoRoot, "src-tauri", "binaries");

function parseArgs(argv) {
  const out = { target: null, offline: false, force: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--") {
      continue;
    } else if (arg === "--target") {
      out.target = argv[++i];
    } else if (arg === "--offline") {
      out.offline = true;
    } else if (arg === "--force") {
      out.force = true;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  return out;
}

function currentTarget() {
  const platform = process.platform;
  const arch = process.arch;
  if (platform === "darwin" && arch === "arm64") return "aarch64-apple-darwin";
  if (platform === "linux" && arch === "x64") return "x86_64-unknown-linux-gnu";
  if (platform === "win32" && arch === "x64") return "x86_64-pc-windows-msvc";
  throw new Error(`unsupported local target: ${platform}/${arch}`);
}

function run(command, args, options = {}) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      ...options,
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolveRun({ stdout, stderr });
      } else {
        reject(new Error(`${command} ${args.join(" ")} exited ${code}: ${stderr || stdout}`));
      }
    });
  });
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function sha256(path) {
  const hash = createHash("sha256");
  const data = await readFile(path);
  hash.update(data);
  return hash.digest("hex");
}

async function validateExisting(binaryPath, version) {
  if (!(await exists(binaryPath))) return false;
  const info = await stat(binaryPath);
  if (!info.isFile() || info.size === 0) return false;
  if (process.platform !== "win32") {
    await chmod(binaryPath, 0o755);
  }
  try {
    const { stdout } = await run(binaryPath, ["--version"]);
    return stdout.includes(version.replace(/^v/, ""));
  } catch {
    return false;
  }
}

async function download(url, destination) {
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`download failed ${response.status}: ${url}`);
  }
  await mkdir(dirname(destination), { recursive: true });
  await new Promise((resolveDownload, reject) => {
    const file = createWriteStream(destination);
    response.body
      .pipeTo(
        new WritableStream({
          write(chunk) {
            file.write(Buffer.from(chunk));
          },
          close() {
            file.end(resolveDownload);
          },
          abort(err) {
            file.destroy(err);
            reject(err);
          },
        }),
      )
      .catch(reject);
  });
}

async function extract(assetPath, target, destination) {
  const tmp = await mkdtemp(join(tmpdir(), "zeroclaw-sidecar-"));
  try {
    if (assetPath.endsWith(".tar.gz")) {
      await run("tar", ["-xzf", assetPath, "-C", tmp]);
    } else if (assetPath.endsWith(".zip")) {
      if (process.platform === "win32") {
        await run("powershell", [
          "-NoProfile",
          "-Command",
          `Expand-Archive -LiteralPath '${assetPath.replaceAll("'", "''")}' -DestinationPath '${tmp.replaceAll("'", "''")}' -Force`,
        ]);
      } else {
        await run("unzip", ["-q", assetPath, "-d", tmp]);
      }
    } else {
      throw new Error(`unsupported asset format for ${assetPath}`);
    }

    const binaryName = target.endsWith("windows-msvc") ? "zeroclaw.exe" : "zeroclaw";
    const candidates = [
      join(tmp, binaryName),
      join(tmp, `zeroclaw-${target}`, binaryName),
      join(tmp, "dist", binaryName),
    ];
    const source = await findFirst(candidates);
    if (!source) {
      throw new Error(`could not find ${binaryName} inside ${assetPath}`);
    }
    await mkdir(dirname(destination), { recursive: true });
    await copyFile(source, destination);
    if (!target.endsWith("windows-msvc")) {
      await chmod(destination, 0o755);
    }
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

async function findFirst(paths) {
  for (const path of paths) {
    if (await exists(path)) return path;
  }
  return null;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const target = args.target ?? currentTarget();
  const spec = manifest.targets[target];
  if (!spec) {
    throw new Error(
      `unsupported target ${target}; supported: ${Object.keys(manifest.targets).join(", ")}`,
    );
  }

  const binaryName = `zeroclaw-${target}${target.endsWith("windows-msvc") ? ".exe" : ""}`;
  const binaryPath = join(outDir, binaryName);
  if (!args.force && (await validateExisting(binaryPath, manifest.version))) {
    console.log(`zeroclaw sidecar ready: ${binaryPath}`);
    return;
  }
  if (args.offline) {
    throw new Error(`offline mode: missing or invalid sidecar ${binaryPath}`);
  }

  const url = `${manifest.baseUrl}/${spec.asset}`;
  const assetPath = join(outDir, spec.asset);
  console.log(`downloading ${url}`);
  await download(url, assetPath);
  const digest = await sha256(assetPath);
  if (digest !== spec.sha256) {
    throw new Error(`checksum mismatch for ${spec.asset}: expected ${spec.sha256}, got ${digest}`);
  }
  await extract(assetPath, target, binaryPath);
  await rm(assetPath, { force: true });

  if (!(await validateExisting(binaryPath, manifest.version))) {
    throw new Error(`downloaded sidecar did not report ${manifest.version}: ${binaryPath}`);
  }
  console.log(`zeroclaw sidecar ready: ${binaryPath}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
