// 음원을 R2(haeon-sori-audio)에 올린다. 앱을 다시 배포하지 않아도 1분 안에 반영된다.
//   npm run audio:upload                 (음원: LEARN_AUDIO_DIR 또는 audio/raw)
//   npm run audio:upload -- --dry-run    (올리지 않고 무엇이 바뀌는지만 보기)
// 하는 일
// 1. 학습 화면이 쓰는 음원(previewAudioIds) 가운데 있는 wav를 m4a로 압축한다(Windows 내장 인코더, audio/packed/에 캐시).
// 2. R2에 아직 없는 파일만 한 번에 올린다(wrangler r2 bulk put)(이름은 내용 해시 a/<hash>.m4a).
// 3. 목록(manifest.json)을 마지막에 바꿔 올린다. 목록이 바뀌기 전에는 학습자에게 새 음원이 보이지 않는다.
// 지난 목록에는 있었지만 이번에 폴더에 없는 음원은 목록에서 빠지지 않게 그대로 둔다(--prune 이면 뺀다).
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRawAudio } from "../server/preview/audio.ts";
import { previewAudioIds } from "../server/preview/audio-ids.ts";
import { MANIFEST_KEY, type PackedAudioManifest } from "../server/cloud/packed-audio.ts";

const BUCKET = "haeon-sori-audio";
const BITRATE = 96000;
const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const prune = args.has("--prune");

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rawDir = process.env.LEARN_AUDIO_DIR?.trim() || join(root, "audio", "raw");
const cacheDir = join(root, "audio", "packed");
mkdirSync(cacheDir, { recursive: true });

const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const mb = (n: number) => (n / 1024 / 1024).toFixed(1);

function wrangler(params: string[], quiet = true) {
  const run = spawnSync(process.platform === "win32" ? "npx.cmd" : "npx", ["wrangler", ...params], {
    cwd: root,
    encoding: "utf8",
    shell: process.platform === "win32",
  });
  if (run.status !== 0 && !quiet) process.stderr.write(run.stderr ?? "");
  return run;
}

// ── 0. 지금 R2에 있는 목록 ─────────────────────────────
const previousPath = join(cacheDir, ".previous-manifest.json");
rmSync(previousPath, { force: true });
let previous: PackedAudioManifest = { version: 1, builtAt: "", files: {} };
const got = wrangler(["r2", "object", "get", `${BUCKET}/${MANIFEST_KEY}`, "--file", previousPath, "--remote"]);
if (got.status === 0 && existsSync(previousPath)) {
  previous = JSON.parse(readFileSync(previousPath, "utf8")) as PackedAudioManifest;
}
const uploaded = new Set(Object.values(previous.files).map((entry) => entry.file));
console.log(`R2: ${Object.keys(previous.files).length} ids in the current manifest`);

// ── 1. 압축 ─────────────────────────────────────────────
const ids = previewAudioIds();
const raw = createRawAudio(rawDir, ids, "upload");
const present = ids.filter((id) => existsSync(join(rawDir, `${id}.wav`)));
const sourceHash = new Map<string, string>();
const pending: string[] = [];
for (const id of present) {
  const hash = sha256(readFileSync(join(rawDir, `${id}.wav`)));
  sourceHash.set(id, hash);
  const cached = join(cacheDir, `${hash}-${BITRATE}.m4a`);
  if (!existsSync(cached)) pending.push(`${join(rawDir, `${id}.wav`)}\t${cached}`);
}
console.log(`audio: ${present.length} of ${ids.length} known ids in ${rawDir}; ${pending.length} to encode`);
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

// ── 2. 새 목록과 올릴 파일 ─────────────────────────────
const manifest: PackedAudioManifest = { version: 1, builtAt: new Date().toISOString(), files: {} };
if (!prune) Object.assign(manifest.files, previous.files);
const toUpload = new Map<string, string>();
for (const id of present) {
  const cached = join(cacheDir, `${sourceHash.get(id)}-${BITRATE}.m4a`);
  const bytes = readFileSync(cached);
  if (bytes.length === 0) throw new Error(`empty m4a for ${id}`);
  const key = `a/${sha256(bytes).slice(0, 32)}.m4a`;
  if (!uploaded.has(key)) toUpload.set(key, cached);
  const info = raw.info(id);
  manifest.files[id] = { file: key, bytes: bytes.length, durationMs: info?.durationMs ?? null, type: "audio/mp4", meta: raw.meta(id) };
}
const changed = Object.keys(manifest.files).filter((id) => previous.files[id]?.file !== manifest.files[id]?.file);
const removed = Object.keys(previous.files).filter((id) => !manifest.files[id]);
const total = Object.values(manifest.files).reduce((sum, entry) => sum + entry.bytes, 0);
console.log(`manifest: ${Object.keys(manifest.files).length} ids (${mb(total)} MB), ${changed.length} new or changed, ${removed.length} removed`);
console.log(`upload: ${toUpload.size} new files`);
if (dryRun) {
  console.log("dry run: nothing uploaded");
  process.exit(0);
}

// ── 3. 올리기: 파일 먼저, 목록은 마지막 ────────────────
if (toUpload.size > 0) {
  const listPath = join(cacheDir, ".bulk-list.json");
  writeFileSync(listPath, JSON.stringify([...toUpload].map(([key, file]) => ({ key, file }))), "utf8");
  const bulk = wrangler(["r2", "bulk", "put", BUCKET, "--filename", listPath, "--content-type", "audio/mp4", "--remote", "--force"], false);
  rmSync(listPath, { force: true });
  if (bulk.status !== 0) {
    console.error("file upload failed. The manifest was not changed; run again to continue.");
    process.exit(1);
  }
  console.log(`  uploaded ${toUpload.size} files`);
}
const manifestPath = join(cacheDir, ".next-manifest.json");
writeFileSync(manifestPath, JSON.stringify(manifest), "utf8");
const put = wrangler(["r2", "object", "put", `${BUCKET}/${MANIFEST_KEY}`, "--file", manifestPath, "--content-type", "application/json", "--remote"], false);
rmSync(manifestPath, { force: true });
if (put.status !== 0) {
  console.error("manifest upload failed; files are uploaded, run again to publish the manifest.");
  process.exit(1);
}
console.log("manifest published. The app picks it up within a minute.");
