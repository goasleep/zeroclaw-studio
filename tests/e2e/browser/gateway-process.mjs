import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { chmod, mkdtemp, mkdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const repoRoot = resolve(new URL("../../..", import.meta.url).pathname);
const binariesDir = join(repoRoot, "src-tauri", "binaries");
const pollIntervalMs = 300;

function currentTarget() {
  if (process.platform === "darwin" && process.arch === "arm64") return "aarch64-apple-darwin";
  if (process.platform === "linux" && process.arch === "x64") return "x86_64-unknown-linux-gnu";
  if (process.platform === "win32" && process.arch === "x64") return "x86_64-pc-windows-msvc";
  throw new Error(`unsupported local target: ${process.platform}/${process.arch}`);
}

function binaryPathForTarget(target = currentTarget()) {
  return join(binariesDir, `zeroclaw-${target}${target.endsWith("windows-msvc") ? ".exe" : ""}`);
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
      for (const line of chunk.toString("utf8").split(/\r?\n/)) {
        if (line.trim()) lines.push(`[${source}] ${line}`);
      }
      while (lines.length > 80) lines.shift();
    },
    text() {
      return lines.join("\n");
    },
  };
}

async function waitForHealth(baseUrl, gateway, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    if (gateway.state.exited) {
      throw new Error(
        `gateway exited before health code=${gateway.state.code} signal=${gateway.state.signal}\n${gateway.logs.text()}`,
      );
    }
    try {
      const resp = await fetch(`${baseUrl}/health`);
      if (resp.ok) return;
      lastError = new Error(`/health returned ${resp.status}`);
    } catch (err) {
      lastError = err;
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, pollIntervalMs));
  }
  throw new Error(
    `gateway did not become healthy: ${lastError?.message ?? "unknown"}\n${gateway.logs.text()}`,
  );
}

export async function startGateway() {
  const binaryPath = binaryPathForTarget();
  const info = await stat(binaryPath);
  if (!info.isFile() || info.size === 0) {
    throw new Error(`invalid sidecar binary: ${binaryPath}`);
  }
  if (process.platform !== "win32") await chmod(binaryPath, 0o755);

  const rootTemp = await mkdtemp(join(tmpdir(), "zeroclaw-studio-e2e-"));
  const configDir = join(rootTemp, "inner-zeroclaw");
  await mkdir(configDir, { recursive: true });
  const port = await pickPort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const logs = createLogBuffer();
  const state = { exited: false, code: null, signal: null };
  const child = spawn(
    binaryPath,
    ["--config-dir", configDir, "gateway", "start", "-p", String(port)],
    {
      env: {
        ...process.env,
        ZEROCLAW_CONFIG_DIR: configDir,
        ZEROCLAW_HOME: configDir,
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    },
  );
  child.stdout?.on("data", (chunk) => logs.push("gateway:out", chunk));
  child.stderr?.on("data", (chunk) => logs.push("gateway:err", chunk));
  child.on("exit", (code, signal) => {
    state.exited = true;
    state.code = code;
    state.signal = signal;
  });

  const gateway = { baseUrl, child, configDir, logs, rootTemp, state };
  try {
    await waitForHealth(baseUrl, gateway);
    return gateway;
  } catch (err) {
    await stopGateway(gateway);
    throw err;
  }
}

export async function stopGateway(gateway) {
  if (gateway.child.exitCode === null && gateway.child.signalCode === null) {
    gateway.child.kill();
    await new Promise((resolveStop) => {
      const timer = setTimeout(() => {
        gateway.child.kill("SIGKILL");
        resolveStop();
      }, 2_000);
      gateway.child.once("exit", () => {
        clearTimeout(timer);
        resolveStop();
      });
    });
  }
  await rm(gateway.rootTemp, { recursive: true, force: true });
}
