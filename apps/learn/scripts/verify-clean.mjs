import { spawn } from "node:child_process";
import { cp, mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, sep } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
const sourceApp = join(repoRoot, "apps", "learn");

function npmCliPath() {
  if (process.env.npm_execpath) return process.env.npm_execpath;
  const nextToNode = join(dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
  const unixLib = join(dirname(process.execPath), "..", "lib", "node_modules", "npm", "bin", "npm-cli.js");
  if (existsSync(nextToNode)) return nextToNode;
  if (existsSync(unixLib)) return unixLib;
  throw new Error("npm CLI was not found next to node");
}

function skipCopiedPath(source) {
  const parts = source.split(sep);
  return !parts.includes("node_modules") && !parts.includes("dist") && !parts.includes(".git");
}

function run(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, shell: false, stdio: "inherit", env: process.env });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${args.join(" ")} exited with ${code}`));
    });
  });
}

async function main() {
  const tempRoot = join(tmpdir(), `haeon-learn-clean-${process.pid}`);
  const tempApp = join(tempRoot, "apps", "learn");
  await rm(tempRoot, { recursive: true, force: true });
  await mkdir(join(tempRoot, "apps"), { recursive: true });
  await cp(sourceApp, tempApp, { recursive: true, filter: skipCopiedPath });
  await cp(join(repoRoot, "src", "design-system"), join(tempRoot, "src", "design-system"), { recursive: true });
  await cp(join(repoRoot, "package.json"), join(tempRoot, "package.json"));
  await cp(join(repoRoot, ".github"), join(tempRoot, ".github"), { recursive: true });

  const npm = npmCliPath();
  const steps = [
    ["ci"],
    ["run", "build"],
    ["test"],
    ["run", "validate:content"],
    ["run", "test:smoke"],
  ];
  try {
    for (const args of steps) {
      await run(process.execPath, [npm, ...args], tempApp);
    }
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "clean verify failed");
  process.exit(1);
});
