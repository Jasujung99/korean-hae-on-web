// 대표 목소리 표본과 초안 음원을 만드는 로컬 제작 도구.
// 키는 GEMINI_API_KEY 환경 변수에서만 읽고, 화면·로그·파일에 쓰지 않는다.
// 결과는 audio/raw/ 에만 쓴다(.gitignore). 검수 상태는 늘 draft로 남긴다.
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  FLASH_TTS_MODEL,
  NOT_CONFIGURED_MESSAGE,
  VOICE_CANDIDATE,
  authHeaders,
  FLAT_READING_STYLE,
  buildGenerateContentBody,
  buildInteractionBody,
  decodeBase64,
  interactionsEndpoint,
  parseInteractionAudio,
  styleForKind,
  modelEndpoint,
  normalizeToWav,
  parseGenerateContentAudio,
  readApiKey,
  retryDelayMs,
  sha256Hex,
  type TtsUnit,
} from "../content/tts/pipeline.ts";
import { AUDITION_TEXT, AUDITION_VOICES, auditionAudioId, flatAuditionAudioId } from "../content/voices.ts";
import { coreWords, sentenceAudioBase, stageZeroCells, syllableAudioBase, wordAudioBase } from "../content/core-table.ts";
import { PRACTICE_ITEMS } from "../content/practice.ts";
import { PRACTICE_VOICES, voicedAudioId } from "../content/practice-voices.ts";

const appRoot = fileURLToPath(new URL("..", import.meta.url));
const rawDir = join(appRoot, "audio", "raw");
const manifestPath = fileURLToPath(new URL("../content/tts/j-ch-jj-draft-manifest.json", import.meta.url));

type Manifest = { units: Array<TtsUnit & { stage?: string; word?: string }> };

type Outcome = "written" | "skipped" | "quota" | "failed";

function argValue(flag: string): string | null {
  const index = process.argv.indexOf(flag);
  if (index < 0) return null;
  return process.argv[index + 1] ?? null;
}

function fail(message: string, code = 1): never {
  console.error(message);
  process.exit(code);
}

function plainId(id: string): boolean {
  return id.length > 0 && !id.includes("/") && !id.includes("\\") && !id.includes("..");
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function generateOne(input: {
  id: string;
  kind: string;
  text: string;
  voice: string;
  style?: string | null;
  apiKey: string;
  skipExisting: boolean;
}): Promise<Outcome> {
  const { id, kind, text, voice, apiKey } = input;
  // 톤 지시가 있으면 Interactions 요청(지시를 본문과 따로 보냄), 없으면 기존 generateContent 요청.
  const style = input.style ?? null;
  const wavPath = join(rawDir, `${id}.wav`);
  if (input.skipExisting && (await exists(wavPath))) {
    console.log(`skip (already generated): ${id}`);
    return "skipped";
  }

  let response: Response | null = null;
  try {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      try {
        response = await fetch(style ? interactionsEndpoint() : modelEndpoint(), {
          method: "POST",
          headers: authHeaders(apiKey),
          body: JSON.stringify(style ? buildInteractionBody(text, voice, style) : buildGenerateContentBody(text, voice)),
        });
      } catch (error) {
        // 연결이 잠깐 끊긴 경우: 기다렸다가 다시 시도한다.
        if (attempt === 3) throw error;
        await new Promise((resolve) => setTimeout(resolve, 5000 * (attempt + 1)));
        continue;
      }
      if (response.status !== 429 && response.status < 500) break;
      const delay = Math.max(retryDelayMs(attempt, response.headers.get("retry-after")), 2000 * (attempt + 1));
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  } catch {
    console.error(`request failed: ${id}`);
    return "failed";
  }
  if (!response) return "failed";
  if (response.status === 429) {
    console.error(`quota or rate limit reached at ${id}. Stopping without writing.`);
    return "quota";
  }
  if (!response.ok) {
    let reason = "";
    try {
      const body = (await response.json()) as { error?: { status?: string } };
      reason = body.error?.status ?? "";
    } catch {
      reason = "";
    }
    console.error(`request failed (${response.status}${reason ? ` ${reason}` : ""}): ${id}`);
    return "failed";
  }

  const payload = await response.json();
  const parsed = style ? parseInteractionAudio(payload) : parseGenerateContentAudio(payload);
  if (!parsed) {
    console.error(`response had no audio: ${id}`);
    return "failed";
  }
  const sourceBytes = decodeBase64(parsed.base64);
  const normalized = normalizeToWav(sourceBytes, parsed.mime);
  if (!normalized) {
    console.error(`unknown audio format (${parsed.mime || "no mime"}): ${id}. Not written.`);
    return "failed";
  }
  const digest = await sha256Hex(normalized.bytes);
  await mkdir(rawDir, { recursive: true });
  await writeFile(wavPath, normalized.bytes);
  const meta = {
    id,
    kind,
    text,
    model: FLASH_TTS_MODEL,
    voice,
    voiceFixed: false,
    settings: { requestStyle: style ? "interactions" : "generateContent", temperature: null, stylePrompt: style },
    sourceMime: parsed.mime,
    storedMime: normalized.mime,
    wrappedFromPcm: normalized.wrappedFromPcm,
    sha256: digest,
    byteLength: normalized.bytes.length,
    generatedAt: new Date().toISOString(),
    reviewStatus: "draft",
    audioStatus: "draft_raw",
    core60Approved: false,
  };
  await writeFile(join(rawDir, `${id}.meta.json`), `${JSON.stringify(meta, null, 2)}\n`);
  console.log(`written: audio/raw/${id}.wav (${normalized.bytes.length} bytes, ${voice})`);
  return "written";
}

async function runAll(
  jobs: Array<{ id: string; kind: string; text: string; voice: string; style?: string | null }>,
  apiKey: string,
  skipExisting: boolean,
) {
  const delayMs = Number(argValue("--delay") ?? "1500");
  const tally: Record<Outcome, number> = { written: 0, skipped: 0, quota: 0, failed: 0 };
  for (const job of jobs) {
    const outcome = await generateOne({ ...job, apiKey, skipExisting });
    tally[outcome] += 1;
    if (outcome === "quota") break;
    if (outcome === "written") await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  console.log(
    `done. written ${tally.written}, skipped ${tally.skipped}, failed ${tally.failed}${tally.quota ? ", stopped at quota" : ""}. review status stays draft.`,
  );
  if (tally.failed > 0 || tally.quota > 0) process.exitCode = 3;
}

async function main() {
  const command = process.argv[2];
  if (!["audition", "auditions", "generate", "batch", "practice"].includes(command ?? "")) {
    fail("Use audition, auditions, generate, batch, or practice.");
  }
  const apiKey = readApiKey(process.env);
  if (!apiKey) fail(NOT_CONFIGURED_MESSAGE, 2);
  const voice = argValue("--voice") ?? VOICE_CANDIDATE;
  // 의사단어·단어는 평평한 낭독, 예문은 지시 없이 자연스럽게. --no-style이면 모두 지시 없이 만든다.
  const unitStyle = (kind: string) => (process.argv.includes("--no-style") ? null : styleForKind(kind));
  const skipExisting = !process.argv.includes("--force");

  if (command === "audition") {
    const text = argValue("--text") ?? AUDITION_TEXT;
    await runAll([{ id: auditionAudioId(voice), kind: "audition", text, voice }], apiKey, false);
    return;
  }

  if (command === "auditions") {
    // --flat: 평평한 낭독 톤 지시를 붙인 표본(audition-<voice>-flat)을 만든다.
    const flat = process.argv.includes("--flat");
    const voices = (argValue("--voices") ?? AUDITION_VOICES.map((item) => item.voice).join(","))
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    await runAll(
      voices.map((name) => ({
        id: flat ? flatAuditionAudioId(name) : auditionAudioId(name),
        kind: "audition",
        text: AUDITION_TEXT,
        voice: name,
        style: flat ? FLAT_READING_STYLE : null,
      })),
      apiKey,
      skipExisting,
    );
    return;
  }

  if (command === "practice") {
    // Core 60 배치표의 단계별 연습 음원을 목소리 3가지로 만든다. 예) --stages 0,1
    const stages = (argValue("--stages") ?? "0,1").split(",").map((item) => item.trim());
    const keys = (argValue("--voices") ?? PRACTICE_VOICES.map((row) => row.key).join(","))
      .split(",")
      .map((item) => item.trim().toLowerCase());
    const voices = PRACTICE_VOICES.filter((row) => keys.includes(row.key));
    if (voices.length === 0) fail("practice --voices accepts charon, erinome, sulafat.");
    type Unit = { base: string; kind: "pseudoword" | "word" | "sentence"; text: string };
    const syllables: Unit[] = [];
    const words: Unit[] = [];
    const sentences: Unit[] = [];
    const seen = new Set<string>();
    const add = (list: Unit[], unit: Unit) => {
      if (seen.has(unit.base)) return;
      seen.add(unit.base);
      list.push(unit);
    };
    if (stages.includes("1")) {
      for (const item of PRACTICE_ITEMS) add(syllables, { base: item.audioId, kind: "pseudoword", text: item.stimulus });
    }
    if (stages.includes("0")) {
      for (const cell of stageZeroCells()) {
        add(syllables, { base: syllableAudioBase(cell.stimulus), kind: "pseudoword", text: cell.stimulus });
        if (cell.word) {
          const entry = coreWords().find((word) => word.word === cell.word);
          const base = entry ? wordAudioBase(entry) : `word-0-${cell.word}`;
          add(words, { base, kind: "word", text: cell.word });
        }
      }
    }
    for (const word of coreWords()) {
      if (!stages.includes(word.stage.replace("Stage ", ""))) continue;
      add(words, { base: wordAudioBase(word), kind: "word", text: word.word });
      // 예문은 주어진 것만 쓴다. 없으면 만들지 않는다.
      if (word.example) add(sentences, { base: sentenceAudioBase(word), kind: "sentence", text: word.example });
    }
    // 할당량에 걸려도 쓸 수 있게: 의사단어 → 단어 → 예문 순서로, 각 묶음 안에서 목소리를 번갈아 만든다.
    const jobs = [syllables, words, sentences].flatMap((list) =>
      list.flatMap((unit) =>
        voices.map((row) => ({
          id: voicedAudioId(unit.base, row.key),
          kind: unit.kind,
          text: unit.text,
          voice: row.voice,
          style: unitStyle(unit.kind),
        })),
      ),
    );
    console.log(`practice audio: ${syllables.length} syllables, ${words.length} words, ${sentences.length} sentences × ${voices.length} voices = ${jobs.length}`);
    if (process.argv.includes("--dry-run")) return;
    await runAll(jobs, apiKey, skipExisting);
    return;
  }

  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as Manifest;

  if (command === "generate") {
    const id = argValue("--id");
    if (!id || !plainId(id)) fail("generate requires a plain --id.");
    const unit = manifest.units.find((item) => item.id === id);
    if (!unit) fail("manifest id was not found.");
    await runAll([{ id: unit.id, kind: unit.kind, text: unit.text, voice, style: unitStyle(unit.kind) }], apiKey, skipExisting);
    return;
  }

  const ids = (argValue("--ids") ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (ids.length === 0) fail("batch requires --ids a,b,c");
  const units = ids.map((id) => {
    if (!plainId(id)) fail(`not a plain id: ${id}`);
    const unit = manifest.units.find((item) => item.id === id);
    if (!unit) fail(`manifest id was not found: ${id}`);
    return unit;
  });
  await runAll(
    units.map((unit) => ({ id: unit.id, kind: unit.kind, text: unit.text, voice, style: unitStyle(unit.kind) })),
    apiKey,
    skipExisting,
  );
}

void main();
