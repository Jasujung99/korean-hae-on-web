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
import { syllableAudioBase } from "../content/core-table.ts";
import {
  snapshotPseudowords,
  snapshotSentenceAudioBase,
  exampleSlots,
  snapshotStageZero,
  snapshotWordAudioBase,
  snapshotWords,
} from "../content/snapshot.ts";
import { TtsSourceError, loadTtsSource, sourceKindFromArgs } from "./tts-source.ts";
import { PRACTICE_VOICES, voicedAudioId } from "../content/practice-voices.ts";
import { GROUP_MODES, groupFullId, groupPlans, splitAudioId, type GroupMode } from "../content/tts/groups.ts";
import { splitWavBySilence } from "../content/tts/split.ts";
import { logPcTtsUsage } from "./tts-usage-log.ts";

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
  /** 여러 소리를 한 번에 읽힌 파일이면 쉼 자리에서 잘라 parts로 따로 저장한다(통째 파일도 남김). */
  split?: { mode: GroupMode; parts: Array<{ id: string; text: string }> };
}): Promise<Outcome> {
  const { id, kind, text, voice, apiKey } = input;
  // 톤 지시가 있으면 Interactions 요청(지시를 본문과 따로 보냄), 없으면 기존 generateContent 요청.
  const style = input.style ?? null;
  const wavPath = join(rawDir, `${id}.wav`);
  if (input.skipExisting) {
    const targets = input.split ? input.split.parts.map((part) => join(rawDir, `${part.id}.wav`)) : [wavPath];
    const present = await Promise.all(targets.map((path) => exists(path)));
    if (present.every(Boolean)) {
      console.log(`skip (already generated): ${id}`);
      return "skipped";
    }
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
    await logPcTtsUsage({ voiceKey: voice, kind, ok: false, errorCode: "network_error" });
    console.error(`request failed: ${id}`);
    return "failed";
  }
  if (!response) {
    await logPcTtsUsage({ voiceKey: voice, kind, ok: false, errorCode: "network_error" });
    return "failed";
  }
  if (response.status === 429) {
    await logPcTtsUsage({ voiceKey: voice, kind, ok: false, errorCode: "rate_limit" });
    console.error(`quota or rate limit reached at ${id}. Stopping without writing.`);
    return "quota";
  }
  if (!response.ok) {
    await logPcTtsUsage({ voiceKey: voice, kind, ok: false, errorCode: `http_${response.status}` });
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
    await logPcTtsUsage({ voiceKey: voice, kind, ok: false, errorCode: "invalid_audio" });
    console.error(`response had no audio: ${id}`);
    return "failed";
  }
  const sourceBytes = decodeBase64(parsed.base64);
  const normalized = normalizeToWav(sourceBytes, parsed.mime);
  if (!normalized) {
    await logPcTtsUsage({ voiceKey: voice, kind, ok: false, errorCode: "invalid_audio" });
    console.error(`unknown audio format (${parsed.mime || "no mime"}): ${id}. Not written.`);
    return "failed";
  }
  await logPcTtsUsage({ voiceKey: voice, kind, ok: true, errorCode: null });
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

  if (input.split) {
    const result = splitWavBySilence(normalized.bytes, input.split.parts.length);
    if (!result) {
      console.error(`could not find ${input.split.parts.length - 1} pauses in ${id}. Kept the whole file only.`);
      return "failed";
    }
    for (const [index, part] of input.split.parts.entries()) {
      const bytes = result.parts[index];
      const cut = result.cuts[index];
      if (!bytes || !cut) continue;
      await writeFile(join(rawDir, `${part.id}.wav`), bytes);
      const partMeta = {
        ...meta,
        id: part.id,
        kind: "pseudoword",
        text: part.text,
        sha256: await sha256Hex(bytes),
        byteLength: bytes.length,
        storedMime: "audio/wav",
        split: { from: id, fromText: text, mode: input.split.mode, index, startMs: cut.startMs, endMs: cut.endMs },
      };
      await writeFile(join(rawDir, `${part.id}.meta.json`), `${JSON.stringify(partMeta, null, 2)}\n`);
      console.log(`  split: audio/raw/${part.id}.wav (${cut.startMs}-${cut.endMs} ms)`);
    }
  }
  return "written";
}

async function runAll(
  jobs: Array<{
    id: string;
    kind: string;
    text: string;
    voice: string;
    style?: string | null;
    split?: { mode: GroupMode; parts: Array<{ id: string; text: string }> };
  }>,
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
  if (!["audition", "auditions", "generate", "batch", "practice", "pseudo-groups", "single"].includes(command ?? "")) {
    fail("Use audition, auditions, generate, batch, practice, pseudo-groups, or single.");
  }
  if (command === "pseudo-groups" && process.argv.includes("--dry-run")) {
    // 키 없이도 무엇을 만들지 보여 준다.
    for (const { mode } of GROUP_MODES) for (const plan of groupPlans(mode)) console.log(`${mode}: ${plan.text} -> ${plan.parts.length} parts`);
    return;
  }
  const apiKey = readApiKey(process.env);
  if (!apiKey) fail(NOT_CONFIGURED_MESSAGE, 2);
  const voice = argValue("--voice") ?? VOICE_CANDIDATE;
  // 의사단어·단어는 평평한 낭독, 예문은 지시 없이 자연스럽게. --no-style이면 모두 지시 없이 만든다.
  const unitStyle = (kind: string) => (process.argv.includes("--no-style") ? null : styleForKind(kind));
  const skipExisting = !process.argv.includes("--force");

  if (command === "single") {
    // 비교용: 소리 하나를 한 요청으로 따로 만든다(평평 낭독). 앱이 쓰는 파일은 바꾸지 않고 `<id>--single-<시각>`으로만 남긴다.
    // 예) npm run tts:single -- --texts 주,추 --voices erinome,sulafat,charon
    const texts = (argValue("--texts") ?? "").split(",").map((item) => item.trim()).filter(Boolean);
    if (texts.length === 0) fail("single requires --texts 주,추");
    const keys = (argValue("--voices") ?? PRACTICE_VOICES.map((row) => row.key).join(",")).split(",").map((item) => item.trim().toLowerCase());
    const voices = keys.flatMap((key) => PRACTICE_VOICES.filter((row) => row.key === key));
    if (voices.length === 0) fail("single --voices accepts charon, erinome, sulafat.");
    const stamp = new Date().toISOString().replace(/[:.]/g, "").slice(0, 15);
    const jobs = texts.flatMap((text) =>
      voices.map((row) => ({
        id: `${voicedAudioId(syllableAudioBase(text), row.key)}--single-${stamp}`,
        kind: "pseudoword",
        text,
        voice: row.voice,
        style: unitStyle("pseudoword"),
      })),
    );
    console.log(`single: ${jobs.length} requests`);
    if (process.argv.includes("--dry-run")) return;
    await runAll(jobs, apiKey, false);
    return;
  }

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

  if (command === "pseudo-groups") {
    // 의사단어를 묶어서 읽힌 뒤 잘라 쓰는 비교용 음원. 예) --modes trio,all --voices erinome
    const modes = (argValue("--modes") ?? "trio,all")
      .split(",")
      .map((item) => item.trim())
      .filter((item): item is GroupMode => item === "trio" || item === "all");
    const keys = (argValue("--voices") ?? PRACTICE_VOICES.map((row) => row.key).join(","))
      .split(",")
      .map((item) => item.trim().toLowerCase());
    const voices = PRACTICE_VOICES.filter((row) => keys.includes(row.key));
    if (modes.length === 0 || voices.length === 0) fail("pseudo-groups needs --modes trio,all and --voices charon,erinome,sulafat.");
    const jobs = voices.flatMap((row) =>
      modes.flatMap((mode) =>
        groupPlans(mode).map((plan) => ({
          id: groupFullId(plan.fullBase, row.key, mode),
          kind: "pseudoword_group",
          text: plan.text,
          voice: row.voice,
          style: unitStyle("pseudoword"),
          split: { mode, parts: plan.parts.map((part) => ({ id: splitAudioId(part.base, row.key, mode), text: part.text })) },
        })),
      ),
    );
    console.log(`pseudo groups: ${jobs.length} requests (${modes.join(", ")} × ${voices.map((row) => row.voice).join(", ")})`);
    await runAll(jobs, apiKey, skipExisting);
    return;
  }

  if (command === "practice") {
    // ㅈ·ㅊ·ㅉ 단계별 연습 음원을 목소리 3가지로 만든다. 예) --stages 0,1
    // 단어·예문은 운영 DB 작업 표에서 읽는다(예전 JSON 표는 --source json). DB를 못 읽으면 멈춘다.
    let source;
    try {
      source = await loadTtsSource(sourceKindFromArgs(process.argv));
    } catch (error) {
      if (error instanceof TtsSourceError) fail(error.message);
      throw error;
    }
    const tableWords = snapshotWords(source.snapshot, "j_ch_jj");
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
      for (const row of snapshotPseudowords(source.snapshot, "j_ch_jj")) {
        add(syllables, { base: syllableAudioBase(row.stimulus), kind: "pseudoword", text: row.stimulus });
      }
    }
    if (stages.includes("0")) {
      for (const cell of snapshotStageZero(source.snapshot, "j_ch_jj")) {
        add(syllables, { base: syllableAudioBase(cell.stimulus), kind: "pseudoword", text: cell.stimulus });
        if (cell.word) {
          const entry = tableWords.find((word) => word.word === cell.word);
          const base = entry ? snapshotWordAudioBase(entry) : `word-0-${cell.word}`;
          add(words, { base, kind: "word", text: cell.word });
        }
      }
    }
    for (const word of tableWords) {
      if (!stages.includes(word.stage.replace("Stage ", ""))) continue;
      add(words, { base: snapshotWordAudioBase(word), kind: "word", text: word.word });
      // 예문은 주어진 것만 쓴다. 없으면 만들지 않는다.
      for (const slot of exampleSlots(word)) add(sentences, { base: slot.audioBase, kind: "sentence", text: slot.text });
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
