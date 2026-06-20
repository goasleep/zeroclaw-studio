import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const driverPort = Number(process.env.TAURI_DRIVER_PORT ?? 4444);
const defaultAppPath = resolve(
  "src-tauri",
  "target",
  "release",
  `zeroclaw-studio${process.platform === "win32" ? ".exe" : ""}`,
);
const appPath = process.env.TAURI_APP_PATH ?? defaultAppPath;
let tauriDriver = null;

export const config = {
  runner: "local",
  specs: ["./tests/e2e/tauri/*.spec.mjs"],
  maxInstances: 1,
  hostname: "127.0.0.1",
  port: driverPort,
  path: "/",
  logLevel: "info",
  waitforTimeout: 20_000,
  connectionRetryTimeout: 120_000,
  connectionRetryCount: 1,
  reporters: ["spec"],
  framework: "mocha",
  mochaOpts: {
    timeout: 60_000,
  },
  capabilities: [
    {
      browserName: "wry",
      "tauri:options": {
        application: appPath,
      },
    },
  ],
  onPrepare() {
    if (!existsSync(appPath)) {
      throw new Error(
        `ZeroClaw Studio binary not found at ${appPath}. Run pnpm desktop:build first.`,
      );
    }
    tauriDriver = spawn("tauri-driver", ["--port", String(driverPort)], {
      stdio: "inherit",
      windowsHide: true,
    });
  },
  onComplete() {
    if (tauriDriver && tauriDriver.exitCode === null && tauriDriver.signalCode === null) {
      tauriDriver.kill();
    }
  },
};
