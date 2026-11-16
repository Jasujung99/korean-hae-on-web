import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  FLASH_TTS_MODEL,
  NOT_CONFIGURED_MESSAGE,
  VOICE_CANDIDATE,
  applyRawResult,
  authHeaders,
  buildGenerateContentBody,
  decodeBase64,
  modelEndpoint,
  parseGenerateContentAudio,
  readApiKey,
  retryDelayMs,
  sha256Hex,
  type TtsUnit,
} from "../content/tts/pipeline.ts";

const appRoot = fileURLToPath(new URL("..", import.meta.url));
const manifestPath = fileURLToPath(new URL("../content/tts/j-ch-jj-draft-manifest.json", import.meta.url));

type Manifest = { units: TtsUnit[] };

function argValue(flag: string): string | null {
  const index = process.argv.indexOf(flag);
  if (index < 0) return null;
  return process.argv[index + 1] ?? null;
}

function fail(message: string, code = 1): never {
  console.error(message);
  process.exit(code);
}

async function generateOne(text: string, voice: string, id: string, apiKey: string): Promise<void> {
  const endpoint = modelEndpoint();
  let response: Response | null = null;
  try {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      response = await fetch(endpoint, {
        method: "POST",
        headers: authHeaders(apiKey),
        body: JSON.stringify(buildGenerateContentBody(text, voice)),
      });
      if (response.status !== 429) break;
      const delay = retryDelayMs(attempt, response.headers.get("retry-after"));
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  } catch {
    fail("TTS request failed.");
  }
  if (!response || !response.ok) fail("TTS request failed.");
  const parsed = parseGenerateContentAudio(await response.json());
  if (!parsed) fail("TTS response did not include audio.");
  const bytes = decodeBase64(parsed.base64);
  const digest = await sha256Hex(bytes);
  const rawDir = join(appRoot, "audio", "raw");
  await mkdir(rawDir, { recursive: true });
  const wavPath = join(rawDir, `${id}.wav`);
  await writeFile(wavPath, bytes);
  const meta = applyRawResult(
    {
      id,
      kind: "pseudoword",
      text,
      reviewStatus: "draft",
      audioStatus: "missing",
      sourceMime: "",
      sha256: "",
      byteLength: 0,
      rawRelativePath: `audio/raw/${id}.wav`,
      distributionRelativePath: "",
      voiceCandidate: voice,
      voiceFixed: false,
      core60Approved: false,
    },
    bytes,
    parsed.mime,
    digest,
  );
  await writeFile(join(rawDir, `${id}.meta.json`), `${JSON.stringify({ ...meta, model: FLASH_TTS_MODEL }, null, 2)}\n`);
  console.log(`raw audio written: audio/raw/${id}.wav`);
  console.log("review status remains draft. voice is not fixed. distribution file was not written.");
}

async function main() {
  const command = process.argv[2];
  if (command !== "audition" && command !== "generate") {
    fail("Use audition or generate.");
  }
  const apiKey = readApiKey(process.env);
  if (!apiKey) fail(NOT_CONFIGURED_MESSAGE, 2);
  const voice = argValue("--voice") ?? VOICE_CANDIDATE;
  if (command === "audition") {
    const text = argValue("--text") ?? "아자";
    await generateOne(text, voice, `audition-${voice.toLowerCase()}`, apiKey);
    return;
  }
  const id = argValue("--id");
  if (!id || id.includes("/") || id.includes("\\") || id.includes("..")) fail("generate requires a plain --id.");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as Manifest;
  const unit = manifest.units.find((item) => item.id === id);
  if (!unit) fail("manifest id was not found.");
  await generateOne(unit.text, voice, unit.id, apiKey);
}

void main();
