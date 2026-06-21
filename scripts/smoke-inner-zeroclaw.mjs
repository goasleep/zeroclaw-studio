#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { access, chmod, mkdir, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const manifestPath = join(__dirname, "zeroclaw-sidecars.json");
const outDir = join(repoRoot, "src-tauri", "binaries");
const DEFAULT_TIMEOUT_MS = 15_000;
const POLL_INTERVAL_MS = 300;
const LOG_LIMIT = 80;

function parseArgs(argv) {
  const out = {
    target: null,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    keepTemp: false,
    features: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--") {
      continue;
    } else if (arg === "--target") {
      out.target = argv[++i];
    } else if (arg === "--timeout-ms") {
      out.timeoutMs = Number(argv[++i]);
      if (!Number.isFinite(out.timeoutMs) || out.timeoutMs <= 0) {
        throw new Error("--timeout-ms must be a positive number");
      }
    } else if (arg === "--keep-temp") {
      out.keepTemp = true;
    } else if (arg === "--features") {
      out.features = true;
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

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function binaryPathForTarget(target) {
  return join(outDir, `zeroclaw-${target}${target.endsWith("windows-msvc") ? ".exe" : ""}`);
}

async function validateBinary(binaryPath, version) {
  if (!(await exists(binaryPath))) {
    throw new Error(`missing sidecar binary: ${binaryPath}`);
  }
  const info = await stat(binaryPath);
  if (!info.isFile() || info.size === 0) {
    throw new Error(`invalid sidecar binary: ${binaryPath}`);
  }
  if (process.platform !== "win32") {
    await chmod(binaryPath, 0o755);
  }

  const { stdout, stderr } = await run(binaryPath, ["--version"], { timeoutMs: 5_000 });
  const expected = version.replace(/^v/, "");
  if (!stdout.includes(expected) && !stderr.includes(expected)) {
    throw new Error(`sidecar version did not include ${version}: ${stdout || stderr}`);
  }
}

function run(command, args, { timeoutMs }) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`${command} ${args.join(" ")} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout?.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolveRun({ stdout, stderr });
      } else {
        reject(new Error(`${command} ${args.join(" ")} exited ${code}: ${stderr || stdout}`));
      }
    });
  });
}

function pickPort() {
  return new Promise((resolvePick, reject) => {
    const server = createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : null;
      server.close((err) => {
        if (err) reject(err);
        else if (!port || port === 42617) resolvePick(pickPort());
        else resolvePick(port);
      });
    });
  });
}

function createLogBuffer() {
  const lines = [];
  return {
    push(source, chunk) {
      const text = chunk.toString("utf8");
      for (const line of text.split(/\r?\n/)) {
        if (!line.trim()) continue;
        lines.push(`[${source}] ${line}`);
      }
      while (lines.length > LOG_LIMIT) lines.shift();
    },
    text() {
      return lines.join("\n");
    },
  };
}

function startGateway(binaryPath, configDir, port) {
  const args = ["--config-dir", configDir, "gateway", "start", "-p", String(port)];
  const logs = createLogBuffer();
  const child = spawn(binaryPath, args, {
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
    env: {
      ...process.env,
      ZEROCLAW_CONFIG_DIR: configDir,
      ZEROCLAW_HOME: configDir,
    },
  });
  const state = { exited: false, code: null, signal: null };
  child.stdout?.on("data", (chunk) => logs.push("stdout", chunk));
  child.stderr?.on("data", (chunk) => logs.push("stderr", chunk));
  child.on("exit", (code, signal) => {
    state.exited = true;
    state.code = code;
    state.signal = signal;
  });
  return { child, logs, state };
}

async function stopGateway(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill();
  await new Promise((resolveStop) => {
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolveStop();
    }, 2_000);
    child.once("exit", () => {
      clearTimeout(timer);
      resolveStop();
    });
  });
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 5_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJson(baseUrl, path, options = {}) {
  const resp = await fetchWithTimeout(`${baseUrl}${path}`, options, 5_000);
  const text = await resp.text();
  if (!resp.ok) {
    throw new Error(`${path} returned ${resp.status}: ${text}`);
  }
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`${path} did not return JSON: ${text}`);
  }
}

async function waitForHealth(baseUrl, gateway, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    if (gateway.state.exited) {
      throw new Error(
        `gateway exited before health was ready code=${gateway.state.code} signal=${gateway.state.signal}\n${gateway.logs.text()}`,
      );
    }
    try {
      const health = await fetchJson(baseUrl, "/health");
      return health;
    } catch (err) {
      lastError = err;
      await sleep(POLL_INTERVAL_MS);
    }
  }
  throw new Error(
    `gateway did not become healthy within ${timeoutMs}ms: ${lastError?.message ?? "unknown"}\n${gateway.logs.text()}`,
  );
}

async function ensureToken(baseUrl, health) {
  if (health?.require_pairing !== true) {
    return null;
  }
  const paircode = await fetchJson(baseUrl, "/admin/paircode/new", { method: "POST" });
  const code = paircode.pairing_code;
  if (typeof code !== "string" || !code) {
    throw new Error("/admin/paircode/new did not return pairing_code");
  }
  const paired = await fetchJson(baseUrl, "/pair", {
    method: "POST",
    headers: [["X-Pairing-Code", code]],
  });
  if (typeof paired.token !== "string" || !paired.token) {
    throw new Error("/pair did not return token");
  }
  return paired.token;
}

async function checkApi(baseUrl, token) {
  const headers = token ? [["Authorization", `Bearer ${token}`]] : [];
  await fetchJson(baseUrl, "/api/health", { headers });
  const status = await fetchJson(baseUrl, "/api/status", { headers });
  if (!status || typeof status !== "object" || Array.isArray(status)) {
    throw new Error("/api/status did not return an object");
  }
  await checkSse(baseUrl, headers);
}

function assertObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} did not return an object`);
  }
}

function assertArrayProp(value, prop, label) {
  assertObject(value, label);
  if (!Array.isArray(value[prop])) {
    throw new Error(`${label} did not return array property ${prop}`);
  }
}

async function checkFeatureApis(baseUrl, token) {
  const headers = token ? [["Authorization", `Bearer ${token}`]] : [];
  const checks = [
    {
      label: "config sections",
      path: "/api/config/sections",
      validate: (body) => assertArrayProp(body, "sections", "/api/config/sections"),
    },
    {
      label: "config list",
      path: "/api/config/list",
      validate: (body) => assertArrayProp(body, "entries", "/api/config/list"),
    },
    {
      label: "config status",
      path: "/api/config/status",
      validate: (body) => assertObject(body, "/api/config/status"),
    },
    {
      label: "config agent options",
      path: "/api/config/agent-options",
      validate: (body) => assertObject(body, "/api/config/agent-options"),
    },
    {
      label: "config reload status",
      path: "/api/config/reload-status",
      validate: (body) => assertObject(body, "/api/config/reload-status"),
    },
    {
      label: "config drift",
      path: "/api/config/drift",
      validate: (body) => assertArrayProp(body, "drifted", "/api/config/drift"),
    },
    {
      label: "sessions",
      path: "/api/sessions",
      validate: (body) => assertArrayProp(body, "sessions", "/api/sessions"),
    },
    {
      label: "running sessions",
      path: "/api/sessions/running",
      validate: (body) => assertArrayProp(body, "sessions", "/api/sessions/running"),
    },
    {
      label: "logs",
      path: "/api/logs",
      validate: (body) => assertArrayProp(body, "events", "/api/logs"),
    },
    {
      label: "tools",
      path: "/api/tools",
      validate: (body) => assertArrayProp(body, "tools", "/api/tools"),
    },
    {
      label: "cli tools",
      path: "/api/cli-tools",
      validate: (body) => assertArrayProp(body, "cli_tools", "/api/cli-tools"),
    },
    {
      label: "tuis",
      path: "/api/tuis",
      validate: (body) => assertArrayProp(body, "tuis", "/api/tuis"),
    },
    {
      label: "memory",
      path: "/api/memory",
      validate: (body) => assertArrayProp(body, "entries", "/api/memory"),
    },
    {
      label: "channels",
      path: "/api/channels",
      validate: (body) => assertArrayProp(body, "channels", "/api/channels"),
    },
    {
      label: "cron",
      path: "/api/cron",
      validate: (body) => assertArrayProp(body, "jobs", "/api/cron"),
    },
    {
      label: "integrations",
      path: "/api/integrations",
      validate: (body) => assertArrayProp(body, "integrations", "/api/integrations"),
    },
    {
      label: "doctor",
      path: "/api/doctor",
      validate: (body) => assertArrayProp(body, "results", "/api/doctor"),
    },
    {
      label: "devices",
      path: "/api/devices",
      validate: (body) => assertArrayProp(body, "devices", "/api/devices"),
    },
    {
      label: "skills bundles",
      path: "/api/skills/bundles",
      validate: (body) => assertArrayProp(body, "bundles", "/api/skills/bundles"),
    },
    {
      label: "quickstart state",
      path: "/api/quickstart/state",
      validate: (body) => assertObject(body, "/api/quickstart/state"),
    },
    {
      label: "personality templates",
      path: "/api/personality/templates",
      validate: (body) => assertArrayProp(body, "files", "/api/personality/templates"),
    },
  ];

  for (const check of checks) {
    const body = await fetchJson(baseUrl, check.path, { headers });
    check.validate(body);
    console.log(`feature ok: ${check.label}`);
  }
}

async function checkSse(baseUrl, headers) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2_000);
  try {
    const resp = await fetch(`${baseUrl}/api/events`, { headers, signal: controller.signal });
    if (!resp.ok) {
      throw new Error(`/api/events returned ${resp.status}`);
    }
    const contentType = resp.headers.get("content-type") ?? "";
    if (!contentType.includes("text/event-stream")) {
      throw new Error(`/api/events content-type was ${contentType || "<missing>"}`);
    }
    await resp.body?.cancel();
  } finally {
    clearTimeout(timer);
  }
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const target = args.target ?? currentTarget();
  if (!manifest.targets[target]) {
    throw new Error(
      `unsupported target ${target}; supported: ${Object.keys(manifest.targets).join(", ")}`,
    );
  }

  const binaryPath = binaryPathForTarget(target);
  await validateBinary(binaryPath, manifest.version);

  const rootTemp = await mkdtemp(join(tmpdir(), "zeroclaw-inner-smoke-"));
  const configDir = join(rootTemp, "inner-zeroclaw");
  await mkdir(configDir, { recursive: true });
  const port = await pickPort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const gateway = startGateway(binaryPath, configDir, port);

  let passed = false;
  try {
    console.log(`inner zeroclaw smoke: ${manifest.version} ${target}`);
    console.log(`starting ${baseUrl}`);
    const health = await waitForHealth(baseUrl, gateway, args.timeoutMs);
    const token = await ensureToken(baseUrl, health);
    await checkApi(baseUrl, token);
    if (args.features) {
      await checkFeatureApis(baseUrl, token);
    }
    passed = true;
    console.log("inner zeroclaw smoke passed");
  } finally {
    await stopGateway(gateway.child);
    if (!passed) {
      const logs = gateway.logs.text();
      if (logs) console.error(`recent gateway logs:\n${logs}`);
    }
    if (args.keepTemp) {
      console.log(`kept temp dir: ${rootTemp}`);
    } else {
      await rm(rootTemp, { recursive: true, force: true });
    }
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
