// Cloudflare Pages 배포본을 만든다. 먼저 npm run build(화면 dist/client)가 끝나 있어야 한다.
//   npm run build:cloud            (음원: LEARN_AUDIO_DIR 또는 audio/raw)
// 하는 일
// 1. 학습 화면이 쓰는 음원(previewAudioIds) 가운데 있는 wav를 m4a로 압축한다(Windows 내장 인코더, audio/packed/에 캐시).
// 2. 압축 파일을 내용 해시 이름으로 dist/client/_a/에 둔다. 어떤 id가 어느 파일인지는 서버 묶음 안의 목록에만 있다.
// 3. 워커(server/cloud/worker.ts)를 dist/client/_worker.js로 묶고, _routes.json·_headers를 쓴다.
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";
import { createRawAudio } from "../server/preview/audio.ts";
import { previewAudioIds } from "../server/preview/audio-ids.ts";
import type { PackedAudioManifest } from "../server/cloud/packed-audio.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const clientDir = join(root, "dist", "client");
const rawDir = process.env.LEARN_AUDIO_DIR?.trim() || join(root, "audio", "raw");
const cacheDir = join(root, "audio", "packed");
const assetDir = join(clientDir, "_a");
const manifestPath = join(root, "dist", "cloud", "audio-manifest.json");
const BITRATE = 96000;

if (!existsSync(join(clientDir, "index.html"))) {
  console.error("dist/client/index.html is missing. Run npm run build first.");
  process.exit(1);
}

const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

// ── 1. 압축 ─────────────────────────────────────────────
const ids = previewAudioIds();
const raw = createRawAudio(rawDir, ids, "build");
const present = ids.filter((id) => existsSync(join(rawDir, `${id}.wav`)));
mkdirSync(cacheDir, { recursive: true });

const sourceHash = new Map<string, string>();
const pending: string[] = [];
for (const id of present) {
  const hash = sha256(readFileSync(join(rawDir, `${id}.wav`)));
  sourceHash.set(id, hash);
  const cached = join(cacheDir, `${hash}-${BITRATE}.m4a`);
  if (!existsSync(cached)) pending.push(`${join(rawDir, `${id}.wav`)}\t${cached}`);
}
console.log(`audio: ${present.length} of ${ids.length} known ids found in ${rawDir}; ${pending.length} to encode`);

if (pending.length > 0) {
  if (process.platform !== "win32") {
    console.error("m4a encoding uses the Windows built-in encoder. Run this on Windows.");
    process.exit(1);
  }
  const listPath = join(cacheDir, ".encode-list.txt");
  writeFileSync(listPath, pending.join("\n"), "utf8");
  const run = spawnSync(
    "powershell",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", join(root, "scripts", "encode-m4a.ps1"), "-List", listPath, "-Bitrate", String(BITRATE)],
    { stdio: "inherit" },
  );
  rmSync(listPath, { force: true });
  if (run.status !== 0) {
    console.error("m4a encoding failed");
    process.exit(1);
  }
}

// ── 2. 정적 자산과 목록 ─────────────────────────────────
rmSync(assetDir, { recursive: true, force: true });
mkdirSync(assetDir, { recursive: true });
const manifest: PackedAudioManifest = { version: 1, builtAt: new Date().toISOString(), files: {} };
let packedBytes = 0;
let rawBytes = 0;
for (const id of present) {
  const cached = join(cacheDir, `${sourceHash.get(id)}-${BITRATE}.m4a`);
  const bytes = readFileSync(cached);
  if (bytes.length === 0) throw new Error(`empty m4a for ${id}`);
  const name = `${sha256(bytes).slice(0, 32)}.m4a`;
  copyFileSync(cached, join(assetDir, name));
  const info = raw.info(id);
  manifest.files[id] = {
    file: `/_a/${name}`,
    bytes: bytes.length,
    durationMs: info?.durationMs ?? null,
    type: "audio/mp4",
    meta: raw.meta(id),
  };
  packedBytes += bytes.length;
  rawBytes += info?.bytes ?? 0;
}
mkdirSync(dirname(manifestPath), { recursive: true });
writeFileSync(manifestPath, JSON.stringify(manifest), "utf8");
const mb = (n: number) => (n / 1024 / 1024).toFixed(1);
console.log(`audio: ${present.length} files, wav ${mb(rawBytes)} MB → m4a ${mb(packedBytes)} MB`);

// ── 3. 워커와 Pages 설정 ────────────────────────────────
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
  plugins: [
    {
      name: "packed-audio-manifest",
      setup(build) {
        build.onResolve({ filter: /^virtual:packed-audio-manifest$/ }, () => ({ path: manifestPath }));
      },
    },
  ],
});

writeFileSync(
  join(clientDir, "_routes.json"),
  JSON.stringify({ version: 1, include: ["/api/*", "/robots.txt", "/_a/*"], exclude: [] }, null, 2),
);
writeFileSync(
  join(clientDir, "_headers"),
  ["/*", "  X-Robots-Tag: noindex, nofollow", "  X-Frame-Options: DENY", "  X-Content-Type-Options: nosniff", ""].join("\n"),
);

const worker = readFileSync(join(clientDir, "_worker.js"), "utf8");
const nodeModules = [...new Set(worker.match(/node:[a-z_/]+/g) ?? [])];
console.log(`worker: ${mb(worker.length)} MB, node modules: ${nodeModules.join(", ") || "none"}`);
if (nodeModules.some((name) => name !== "node:crypto")) {
  console.error("the worker must only use node:crypto (Cloudflare nodejs_compat)");
  process.exit(1);
}
