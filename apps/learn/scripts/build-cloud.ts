// Cloudflare Pages 배포본을 만든다. 먼저 npm run build(화면 dist/client)가 끝나 있어야 한다.
//   npm run build:cloud
// 워커(server/cloud/worker.ts)를 dist/client/_worker.js로 묶고, _routes.json·_headers를 쓴다.
// 음원은 여기 넣지 않는다. R2에 따로 올린다(npm run audio:upload).
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const clientDir = join(root, "dist", "client");

if (!existsSync(join(clientDir, "index.html"))) {
  console.error("dist/client/index.html is missing. Run npm run build first.");
  process.exit(1);
}
rmSync(join(clientDir, "_a"), { recursive: true, force: true });

await esbuild.build({
  absWorkingDir: root,
  entryPoints: ["server/cloud/worker.ts"],
  outfile: join(clientDir, "_worker.js"),
  bundle: true,
  platform: "neutral",
  format: "esm",
  target: "es2022",
  mainFields: ["module", "main"],
  conditions: ["workerd", "worker", "import"],
  external: ["node:*"],
  tsconfig: "tsconfig.json",
  minify: true,
});

writeFileSync(
  join(clientDir, "_routes.json"),
  JSON.stringify({ version: 1, include: ["/api/*", "/robots.txt"], exclude: [] }, null, 2),
);
writeFileSync(
  join(clientDir, "_headers"),
  ["/*", "  X-Robots-Tag: noindex, nofollow", "  X-Frame-Options: DENY", "  X-Content-Type-Options: nosniff", ""].join("\n"),
);

const worker = readFileSync(join(clientDir, "_worker.js"), "utf8");
const nodeModules = [...new Set(worker.match(/node:[a-z_/]+/g) ?? [])];
console.log(`worker: ${(worker.length / 1024 / 1024).toFixed(2)} MB, node modules: ${nodeModules.join(", ") || "none"}`);
if (nodeModules.some((name) => name !== "node:crypto")) {
  console.error("the worker must only use node:crypto (Cloudflare nodejs_compat)");
  process.exit(1);
}
