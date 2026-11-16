import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  FLASH_TTS_MODEL,
  NOT_CONFIGURED_MESSAGE,
  TTS_MAX_ATTEMPTS,
  authHeaders,
  buildGenerateContentBody,
  decodeBase64,
  modelEndpoint,
  parseDelayMs,
  parseGenerateContentAudio,
  readApiKey,
  retryDelayMs,
  sha256Hex,
  ttsFailureMessage,
} from "../content/tts/pipeline.ts";
import {
  FFMPEG_MISSING_MESSAGE,
  VOICE_KEYS,
  applyProcessedResult,
  applyRawResult,
  emptyVoiceFile,
  ffmpegAtempoArgs,
  ffmpegFailureReason,
  isVoiceKey,
  rawRelativePath,
  selectGenerationJobs,
  voiceFileId,
  type VoiceFileRecord,
  type VoiceKey,
} from "../content/tts/voices.ts";

const appRoot = fileURLToPath(new URL("..", import.meta.url));
const manifestPath = fileURLToPath(new URL("../content/tts/j-ch-jj-draft-manifest.json", import.meta.url));

type ManifestUnit = {
  id: string;
  text: string;
  stage?: string;
  voices?: Record<VoiceKey, VoiceFileRecord>;
  core60Approved?: boolean;
  reviewStatus?: string;
};

type Manifest = { units: ManifestUnit[] };

function argValue(flag: string): string | null {
  const index = process.argv.indexOf(flag);
  if (index < 0) return null;
  return process.argv[index + 1] ?? null;
}

function fail(message: string, code = 1): never {
  console.error(message);
  process.exit(code);
}

function selectedVoices(): VoiceKey[] {
  if (process.argv.includes("--all-voices")) return [...VOICE_KEYS];
  const voice = argValue("--voice");
  if (!isVoiceKey(voice)) fail("Use --voice male, --voice female, or --all-voices.");
  return [voice];
}

function plainId(): string {
  const id = argValue("--id");
  if (!id || id.includes("/") || id.includes("\\") || id.includes("..")) fail("A plain --id is required.");
  return id;
}

function requestDelayMs(): number {
  const delay = parseDelayMs(argValue("--delay-ms"));
  if (delay === null) fail("--delay-ms expects a whole number of milliseconds up to 600000.");
  return delay;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function ffmpegOnPath(): boolean {
  const result = spawnSync("ffmpeg", ["-version"], { shell: false, stdio: "ignore" });
  return result.status === 0;
}

async function generateOne(text: string, voice: VoiceKey, unitId: string, apiKey: string): Promise<VoiceFileRecord> {
  const endpoint = modelEndpoint();
  const presetName = emptyVoiceFile(unitId, voice).prebuiltVoice;
  let response: Response | null = null;
  try {
    for (let attempt = 0; attempt < TTS_MAX_ATTEMPTS; attempt += 1) {
      response = await fetch(endpoint, {
        method: "POST",
        headers: authHeaders(apiKey),
        body: JSON.stringify(buildGenerateContentBody(text, presetName)),
      });
      if (response.status !== 429) break;
      if (attempt === TTS_MAX_ATTEMPTS - 1) break;
      const delay = retryDelayMs(attempt, response.headers.get("retry-after"));
      console.error(`${ttsFailureMessage(response.status)} Waiting ${delay} ms.`);
      await sleep(delay);
    }
  } catch {
    fail(ttsFailureMessage(null));
  }
  if (!response || !response.ok) fail(ttsFailureMessage(response?.status ?? null));
  const parsed = parseGenerateContentAudio(await response.json());
  if (!parsed) fail("TTS response did not include audio.");
  const bytes = decodeBase64(parsed.base64);
  const digest = await sha256Hex(bytes);
  const relative = rawRelativePath(unitId, voice);
  const wavPath = join(appRoot, relative);
  await mkdir(join(appRoot, "audio", "raw"), { recursive: true });
  await writeFile(wavPath, bytes);
  const meta = applyRawResult(emptyVoiceFile(unitId, voice), bytes, parsed.mime, digest);
  await writeFile(join(appRoot, "audio", "raw", `${voiceFileId(unitId, voice)}.meta.json`), sidecar(meta));
  console.log(`raw audio written: ${relative}`);
  console.log("review status remains draft. distribution file was not written.");
  return meta;
}

async function patchManifest(unitId: string, voice: VoiceKey, file: VoiceFileRecord): Promise<void> {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as Manifest;
  const unit = manifest.units.find((item) => item.id === unitId);
  if (!unit) return;
  unit.voices = unit.voices ?? { male: emptyVoiceFile(unitId, "male"), female: emptyVoiceFile(unitId, "female") };
  unit.voices[voice] = file;
  unit.reviewStatus = "draft";
  unit.core60Approved = false;
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

function sidecar(file: VoiceFileRecord): string {
  return `${JSON.stringify({ ...file, model: FLASH_TTS_MODEL, listeningApproved: false, core60Approved: false }, null, 2)}\n`;
}

async function loadVoiceFile(unitId: string, voice: VoiceKey): Promise<VoiceFileRecord> {
  try {
    const saved = JSON.parse(
      await readFile(join(appRoot, "audio", "raw", `${voiceFileId(unitId, voice)}.meta.json`), "utf8"),
    ) as VoiceFileRecord;
    if (saved.voiceKey === voice) {
      return { ...emptyVoiceFile(unitId, voice), ...saved, reviewStatus: "draft", listeningApproved: false };
    }
  } catch {
    return emptyVoiceFile(unitId, voice);
  }
  return emptyVoiceFile(unitId, voice);
}

async function processOne(unitId: string, voice: VoiceKey): Promise<void> {
  const relative = rawRelativePath(unitId, voice);
  const inputPath = join(appRoot, relative);
  let raw: Buffer;
  try {
    raw = await readFile(inputPath);
  } catch {
    fail(`raw audio is missing: ${relative}`);
  }
  const outputRelative = relative.replace(/^audio\/raw\//, "audio/dist/");
  const outputPath = join(appRoot, outputRelative);
  const partialPath = `${outputPath}.partial`;
  await mkdir(join(appRoot, "audio", "dist"), { recursive: true });
  const result = spawnSync("ffmpeg", ffmpegAtempoArgs(inputPath, partialPath, voice), {
    shell: false,
    encoding: "utf8",
    stdio: ["ignore", "ignore", "pipe"],
  });
  if (result.error && (result.error as NodeJS.ErrnoException).code === "ENOENT") fail(FFMPEG_MISSING_MESSAGE);
  if (result.status !== 0) {
    await rm(partialPath, { force: true });
    fail(ffmpegFailureReason(typeof result.stderr === "string" ? result.stderr : ""));
  }
  const processed = new Uint8Array(await readFile(partialPath));
  await rename(partialPath, outputPath);
  const unchanged = Buffer.from(await readFile(inputPath)).equals(raw);
  if (!unchanged) fail("raw audio changed during processing.");
  const digest = await sha256Hex(processed);
  const meta = applyProcessedResult(await loadVoiceFile(unitId, voice), processed, digest);
  await writeFile(join(appRoot, "audio", "dist", `${voiceFileId(unitId, voice)}.meta.json`), sidecar(meta));
  await patchManifest(unitId, voice, meta);
  console.log(`distribution audio written: ${outputRelative}`);
  console.log("listening approval remains draft. raw audio was not changed.");
}

async function main() {
  const command = process.argv[2];
  if (command !== "audition" && command !== "generate" && command !== "process") {
    fail("Use audition, generate, or process.");
  }
  if (command === "audition" || command === "generate") {
    const apiKey = readApiKey(process.env);
    if (!apiKey) fail(NOT_CONFIGURED_MESSAGE, 2);
    const voices = selectedVoices();
    const delayMs = requestDelayMs();
    if (command === "audition") {
      const text = argValue("--text") ?? "아자. 아침에 기차를 타요.";
      for (let index = 0; index < voices.length; index += 1) {
        const voice = voices[index];
        if (!voice) continue;
        if (index > 0 && delayMs > 0) {
          console.error(`waiting ${delayMs} ms before the next TTS request`);
          await sleep(delayMs);
        }
        await generateOne(text, voice, "audition", apiKey);
      }
      return;
    }
    const id = argValue("--id");
    const stage = argValue("--stage");
    if (Boolean(id) === Boolean(stage)) fail("generate requires either --id or --stage.");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as Manifest;
    if (id && (id.includes("/") || id.includes("\\") || id.includes(".."))) fail("A plain --id is required.");
    if (id && !manifest.units.some((unit) => unit.id === id)) fail("manifest id was not found.");
    const jobs = selectGenerationJobs(manifest.units, { stage, id, voices }, (unitId, voice) =>
      existsSync(join(appRoot, rawRelativePath(unitId, voice))),
    );
    if (jobs.length === 0) fail("no manifest units matched that stage.");
    let sent = 0;
    for (const job of jobs) {
      if (job.skip) {
        console.log(`raw audio exists, skipped: ${rawRelativePath(job.id, job.voice)}`);
        continue;
      }
      if (sent > 0 && delayMs > 0) {
        console.error(`waiting ${delayMs} ms before the next TTS request`);
        await sleep(delayMs);
      }
      const file = await generateOne(job.text, job.voice, job.id, apiKey);
      await patchManifest(job.id, job.voice, file);
      sent += 1;
    }
    return;
  }
  const voices = selectedVoices();
  if (!ffmpegOnPath()) fail(FFMPEG_MISSING_MESSAGE);
  const id = plainId();
  for (const voice of voices) await processOne(id, voice);
}

void main();
