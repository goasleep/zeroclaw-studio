import { spawnSync } from "node:child_process";

const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log("Installing project dependencies...");
run(pnpmCommand, ["install"]);

console.log("Configuring Git hooks...");
run(pnpmCommand, ["run", "prepare"]);

console.log("Development environment is ready.");
