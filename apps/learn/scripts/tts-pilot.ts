// 묶어 만들기 시험(2026-11-18). 여러 단어·예문을 한 요청으로 읽힌 뒤 쉼에서 잘라 쓸 수 있는지 본다.
// 결과는 audio/raw/pilot/ 에만 쓰고(gitignore), 앱 음원으로 쓰지 않는다.
// 키는 GEMINI_API_KEY 환경 변수에서만 읽는다.
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { coreWords } from "../content/core-table.ts";
import {
  FLASH_TTS_MODEL,
  FLAT_READING_STYLE,
  NOT_CONFIGURED_MESSAGE,
  authHeaders,
  decodeBase64,
  interactionsEndpoint,
  normalizeToWav,
  pcmToWav,
  readApiKey,
} from "../content/tts/pipeline.ts";
import { readPcm16Wav } from "../content/tts/split.ts";

const outDir = fileURLToPath(new URL("../audio/raw/pilot/", import.meta.url));
const VOICE = "Erinome";
const FILLER = "네.";

const WORDS_A = ["모자", "기차", "가짜", "의자", "아침", "이쪽", "사진", "우체국", "그쪽", "가족"];
const WORDS_B = ["그쪽", "사진", "아침", "가족", "가짜", "모자", "우체국", "의자", "이쪽", "기차"];
const SENTENCE_WORDS = ["모자", "기차", "가짜", "우체국", "그쪽"];

type Content = { type: "text"; text: string; annotations?: Array<{ type: "speech_metadata"; style: string }> };

type Trial = {
  id: string;
  title: string;
  kind: "word" | "sentence";
  items: string[];
  /** 앞뒤 버릴 낱말 포함 여부 */
  fillers: boolean;
  /** 한 요청 안에서 낱말마다 내용 칸을 나눠 보냄 */
  perItemContent: boolean;
  separator: "long_pause" | "newline";
  style: string | null;
};

function sentencesFor(words: string[]): string[] {
  return words.map((word) => coreWords().find((row) => row.word === word)?.example ?? "").filter(Boolean);
}

const TRIALS: Trial[] = [
  { id: "t1-words-longpause", title: "단어 10개 · <long pause> 구분 · 앞뒤 '네.'", kind: "word", items: WORDS_A, fillers: true, perItemContent: false, separator: "long_pause", style: FLAT_READING_STYLE },
  { id: "t2-words-newline", title: "단어 10개 · 줄바꿈만 · 앞뒤 '네.'", kind: "word", items: WORDS_A, fillers: true, perItemContent: false, separator: "newline", style: FLAT_READING_STYLE },
  { id: "t3-words-reordered", title: "단어 10개 · <long pause> · 순서 바꿈", kind: "word", items: WORDS_B, fillers: true, perItemContent: false, separator: "long_pause", style: FLAT_READING_STYLE },
  { id: "t4-sentences-longpause", title: "예문 5개 · <long pause> 구분 · 톤 지시 없음", kind: "sentence", items: sentencesFor(SENTENCE_WORDS), fillers: false, perItemContent: false, separator: "long_pause", style: null },
  { id: "t5-words-percontent", title: "단어 10개 · 낱말마다 내용 칸 나눔", kind: "word", items: WORDS_A, fillers: false, perItemContent: true, separator: "long_pause", style: FLAT_READING_STYLE },
  { id: "t6-sentences-percontent", title: "예문 5개 · 문장마다 내용 칸 나눔", kind: "sentence", items: sentencesFor(SENTENCE_WORDS), fillers: false, perItemContent: true, separator: "long_pause", style: null },
  // 의사단어: ㅉ가 늘 끝에 오지 않게 순서를 섞는다.
  { id: "t7-pseudo-stage1", title: "의사단어 9개 · <long pause> · 섞은 순서 · 앞뒤 '네.'", kind: "word", items: ["이차", "오짜", "아자", "오차", "이짜", "아차", "오자", "아짜", "이자"], fillers: true, perItemContent: false, separator: "long_pause", style: FLAT_READING_STYLE },
  { id: "t8-pseudo-stage0", title: "첫소리 6개 · <long pause> · 섞은 순서 · 앞뒤 '네.'", kind: "word", items: ["차", "주", "짜", "추", "자", "찌"], fillers: true, perItemContent: false, separator: "long_pause", style: FLAT_READING_STYLE },
];

function contents(trial: Trial): Content[] {
  const annotate = (text: string): Content =>
    trial.style ? { type: "text", text, annotations: [{ type: "speech_metadata", style: trial.style }] } : { type: "text", text };
  const spoken = trial.kind === "word" ? trial.items.map((word) => `${word}.`) : trial.items;
  const all = trial.fillers ? [FILLER, ...spoken, FILLER] : spoken;
  if (trial.perItemContent) return all.map(annotate);
  const joiner = trial.separator === "long_pause" ? " <long pause> " : "\n";
  return [annotate(all.join(joiner))];
}

/** 응답의 모든 audio 조각(칸마다 따로 오는지 보려고 전부 모은다) */
function audioBlocks(payload: unknown): Array<{ mime: string; base64: string }> {
  const record = payload as {
    steps?: Array<{ type?: string; content?: Array<{ type?: string; data?: string; mime_type?: string; mimeType?: string }> }>;
  };
  const blocks: Array<{ mime: string; base64: string }> = [];
  for (const step of record?.steps ?? []) {
    if (step.type && step.type !== "model_output") continue;
    for (const item of step.content ?? []) {
      if (item.type === "audio" && item.data) blocks.push({ mime: item.mime_type ?? item.mimeType ?? "", base64: item.data });
    }
  }
  return blocks;
}

type Gap = { startMs: number; endMs: number; ms: number };

function analyse(bytes: Uint8Array, count: number, minGapMs: number) {
  const pcm = readPcm16Wav(bytes);
  if (!pcm) return null;
  const frameMs = 10;
  const size = Math.round((pcm.sampleRate * frameMs) / 1000);
  const rms: number[] = [];
  for (let start = 0; start + size <= pcm.samples.length; start += size) {
    let sum = 0;
    for (let index = start; index < start + size; index += 1) sum += (pcm.samples[index] ?? 0) ** 2;
    rms.push(Math.sqrt(sum / size));
  }
  const peak = Math.max(...rms);
  const voiced = rms.map((value) => value >= peak * 0.04);
  const first = voiced.indexOf(true);
  const last = voiced.lastIndexOf(true);
  const gaps: Gap[] = [];
  let run = -1;
  for (let frame = first; frame <= last; frame += 1) {
    if (!voiced[frame]) {
      if (run < 0) run = frame;
    } else if (run >= 0) {
      gaps.push({ startMs: run * frameMs, endMs: frame * frameMs, ms: (frame - run) * frameMs });
      run = -1;
    }
  }
  const sorted = [...gaps].sort((a, b) => b.ms - a.ms);
  const chosen = sorted.slice(0, count - 1).sort((a, b) => a.startMs - b.startMs);
  const shortestChosen = chosen.reduce((min, gap) => Math.min(min, gap.ms), Infinity);
  const longestOther = sorted[count - 1]?.ms ?? 0;
  const ok = chosen.length === count - 1 && shortestChosen >= minGapMs && shortestChosen >= longestOther * 1.5;

  const pad = 60;
  const fadeSamples = Math.round(pcm.sampleRate * 0.005);
  const parts: Array<{ bytes: Uint8Array; ms: number }> = [];
  for (let index = 0; index < count; index += 1) {
    const before = chosen[index - 1];
    const after = chosen[index];
    const startMs = Math.max(before ? (before.startMs + before.endMs) / 2 : 0, (before ? before.endMs : first * frameMs) - pad);
    const endMs = Math.min(after ? (after.startMs + after.endMs) / 2 : rms.length * frameMs, (after ? after.startMs : (last + 1) * frameMs) + pad);
    const slice = pcm.samples.slice(Math.round((startMs * pcm.sampleRate) / 1000), Math.round((endMs * pcm.sampleRate) / 1000));
    for (let index2 = 0; index2 < fadeSamples && index2 < slice.length; index2 += 1) {
      const gain = index2 / fadeSamples;
      slice[index2] = Math.round((slice[index2] ?? 0) * gain);
      const tail = slice.length - 1 - index2;
      slice[tail] = Math.round((slice[tail] ?? 0) * gain);
    }
    parts.push({ bytes: pcmToWav(new Uint8Array(slice.buffer), pcm.sampleRate, 1), ms: Math.round(endMs - startMs) });
  }
  return {
    totalMs: Math.round((pcm.samples.length / pcm.sampleRate) * 1000),
    gapsMs: gaps.map((gap) => gap.ms),
    chosen,
    shortestChosen,
    longestOther,
    ok,
    parts,
  };
}

async function main() {
  const apiKey = readApiKey(process.env);
  if (!apiKey) {
    console.error(NOT_CONFIGURED_MESSAGE);
    process.exit(2);
  }
  await mkdir(outDir, { recursive: true });
  const report: unknown[] = [];
  const only = process.argv.includes("--only") ? process.argv[process.argv.indexOf("--only") + 1]?.split(",") : null;

  for (const trial of TRIALS) {
    if (only && !only.includes(trial.id)) continue;
    const body = {
      model: FLASH_TTS_MODEL,
      input: [{ type: "user_input", content: contents(trial) }],
      response_format: { type: "audio" },
      generation_config: { speech_config: [{ voice: VOICE }] },
    };
    let response: Response | null = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        response = await fetch(interactionsEndpoint(), { method: "POST", headers: authHeaders(apiKey), body: JSON.stringify(body) });
        break;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 5000 * (attempt + 1)));
      }
    }
    if (!response) {
      console.error(`${trial.id}: connection failed`);
      report.push({ id: trial.id, error: "connection" });
      continue;
    }
    if (!response.ok) {
      const text = (await response.text()).replace(/AIza\S+/g, "[key]");
      console.error(`${trial.id}: ${response.status}`);
      report.push({ id: trial.id, error: response.status, detail: text.slice(0, 300) });
      if (response.status === 429) break;
      continue;
    }
    const blocks = audioBlocks(await response.json());
    const wavs = blocks.map((block) => normalizeToWav(decodeBase64(block.base64), block.mime)).filter((value) => value !== null);
    const count = trial.items.length + (trial.fillers ? 2 : 0);
    const names = trial.fillers ? ["filler-start", ...trial.items, "filler-end"] : trial.items;
    const entry: Record<string, unknown> = {
      id: trial.id,
      title: trial.title,
      voice: VOICE,
      style: trial.style,
      text: contents(trial).map((content) => content.text),
      audioBlocks: wavs.length,
    };
    for (const [index, wav] of wavs.entries()) {
      await writeFile(join(outDir, `${trial.id}-full${wavs.length > 1 ? `-${index + 1}` : ""}.wav`), wav.bytes);
    }
    if (wavs.length === count) {
      // 칸마다 따로 왔다: 자를 필요 없음
      entry.split = "per_block";
      entry.parts = names.map((name, index) => ({ name, file: `${trial.id}-full-${index + 1}.wav` }));
    } else if (wavs.length === 1 && wavs[0]) {
      const minGap = trial.kind === "sentence" ? 450 : 300;
      const result = analyse(wavs[0].bytes, count, minGap);
      if (result) {
        entry.totalMs = result.totalMs;
        entry.gapsMs = result.gapsMs;
        entry.shortestChosenGapMs = result.shortestChosen;
        entry.longestOtherGapMs = result.longestOther;
        entry.splitOk = result.ok;
        const parts = [];
        for (const [index, part] of result.parts.entries()) {
          const name = names[index] ?? `part-${index + 1}`;
          const file = `${trial.id}-${String(index + 1).padStart(2, "0")}-${name.slice(0, 12)}.wav`;
          await writeFile(join(outDir, file), part.bytes);
          parts.push({ name, file, ms: part.ms });
        }
        entry.parts = parts;
      }
    }
    report.push(entry);
    console.log(`${trial.id}: blocks ${wavs.length}${entry.splitOk !== undefined ? `, split ok ${entry.splitOk}` : ""}`);
    await new Promise((resolve) => setTimeout(resolve, 8000));
  }
  await writeFile(join(outDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log("report: audio/raw/pilot/report.json");
}

void main();
