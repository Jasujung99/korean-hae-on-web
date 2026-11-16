import * as esbuild from "esbuild";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

await esbuild.build({
  absWorkingDir: root,
  entryPoints: ["server/index.ts"],
  outfile: "dist/server/index.js",
  bundle: true,
  platform: "node",
  format: "esm",
  packages: "external",
  target: "node22",
});
