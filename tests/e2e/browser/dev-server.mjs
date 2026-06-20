import { spawn } from "node:child_process";
import { startGateway, stopGateway } from "./gateway-process.mjs";

const gateway = await startGateway();
let stopping = false;

console.log(`browser e2e gateway ready: ${gateway.baseUrl}`);

const vite = spawn("pnpm", ["exec", "vite", "--mode", "browser-e2e", "--host", "127.0.0.1"], {
  env: {
    ...process.env,
    E2E_BROWSER_MODE: "1",
    VITE_E2E_ACTIVE_CONNECTION_ID: "11111111-1111-4111-8111-111111111111",
    VITE_E2E_GATEWAY_BASE_URL: gateway.baseUrl,
  },
  stdio: "inherit",
  windowsHide: true,
});

async function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  if (vite.exitCode === null && vite.signalCode === null) vite.kill();
  await stopGateway(gateway);
  process.exit(code);
}

vite.on("exit", (code) => {
  void stop(code ?? 0);
});
vite.on("error", (err) => {
  console.error(err);
  void stop(1);
});

process.on("SIGINT", () => void stop(130));
process.on("SIGTERM", () => void stop(143));
