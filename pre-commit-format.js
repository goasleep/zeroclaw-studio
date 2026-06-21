import { spawnSync } from "node:child_process";

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    ...options,
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }

  return result.stdout ?? "";
}

function splitNullTerminated(output) {
  return output.split("\0").filter(Boolean);
}

function matchesPrettierTarget(file) {
  return /^src\/.+\.(?:ts|tsx|css)$/.test(file) || /^[^/]+\.(?:html|json|js|ts)$/.test(file);
}

const stagedFiles = splitNullTerminated(
  run("git", ["diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"]),
);
const prettierTargets = stagedFiles.filter(matchesPrettierTarget);

if (prettierTargets.length === 0) {
  process.exit(0);
}

const unstagedFiles = new Set(
  splitNullTerminated(run("git", ["diff", "--name-only", "--diff-filter=ACMR", "-z"])).filter(
    matchesPrettierTarget,
  ),
);
const filesWithUnstagedChanges = prettierTargets.filter((file) => unstagedFiles.has(file));

if (filesWithUnstagedChanges.length > 0) {
  console.error("pre-commit: staged files also have unstaged changes:");
  for (const file of filesWithUnstagedChanges) {
    console.error(`  ${file}`);
  }
  console.error("Stage or stash those changes before committing so formatting does not mix hunks.");
  process.exit(1);
}

const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

console.log("pre-commit: formatting staged files with Prettier...");
run(pnpmCommand, ["exec", "prettier", "--write", "--", ...prettierTargets], {
  stdio: "inherit",
});
run("git", ["add", "--", ...prettierTargets], {
  stdio: "inherit",
});
