// 연습 음원을 묶어서 만든다(2026-11-18 결정, 계획은 content/tts/batch-plan.ts).
// 예) npm run tts:groups -- --voices erinome,sulafat --dry-run
//     npm run tts:groups -- --groups s_ss,g_k_kk --voices erinome,sulafat,charon --dry-run
//     npm run tts:groups -- --voices erinome --kinds pseudo,stage0,words,sentences,turns
// 키는 GEMINI_API_KEY 환경 변수에서만 읽는다. 결과는 audio/raw/ 에만 쓰고 검수 상태는 draft로 둔다.
// 생성 대상은 운영 DB 작업 표(숨김 제외, draft·approved)에서 읽는다. 예전 JSON 표는 `--source json`.
// DB를 못 읽으면 JSON으로 넘어가지 않고 멈춘다.
// 이미 묶음 방식으로 만든 파일은 건너뛴다. 단 meta의 글자가 지금 표와 다르면(또는 DB 자산이 stale이면) 다시 만든다.
// 하나씩 만든 예전 파일은 `<id>--single`로, 다시 만들며 밀려난 묶음 파일은 `<id>--prev-<시각>`으로 옮겨 보관한다.
import { existsSync, readFileSync } from "node:fs";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  BATCH_KINDS,
  GROUPED_METHODS,
  batchPlan,
  groupContents,
  makeDoneCheck,
  groupPartCount,
  type BatchGroup,
  type BatchKind,
} from "../content/tts/batch-plan.ts";
import {
  FLASH_TTS_MODEL,
  NOT_CONFIGURED_MESSAGE,
  authHeaders,
  decodeBase64,
  interactionsEndpoint,
  normalizeToWav,
  parseInteractionAudio,
  readApiKey,
  retryDelayMs,
  sha256Hex,
} from "../content/tts/pipeline.ts";
import { splitChecked } from "../content/tts/split.ts";
import { PRACTICE_VOICES, type PracticeVoiceKey } from "../content/practice-voices.ts";
import { isOtherGroup } from "../content/group-tables.ts";
import type { ContentRepo } from "../server/content/repo.ts";
import { logPcTtsUsage, resolveContentRepo } from "./tts-usage-log.ts";
import { TtsSourceError, activeAssetTexts, loadTtsSource, sourceKindFromArgs } from "./tts-source.ts";

export { makeDoneCheck };

const appRoot = fileURLToPath(new URL("..", import.meta.url));
const rawDir = process.env.LEARN_AUDIO_DIR?.trim() || join(appRoot, "audio", "raw");
const groupDir = join(rawDir, "groups");

function argValue(flag: string): string | null {
  const index = process.argv.indexOf(flag);
  return index < 0 ? null : (process.argv[index + 1] ?? null);
}

/** 로컬 meta를 읽는다(없거나 깨졌으면 null). */
function localMeta(id: string): { method: string; text: string } | null {
  const meta = join(rawDir, `${id}.meta.json`);
  if (!existsSync(join(rawDir, `${id}.wav`)) || !existsSync(meta)) return null;
  try {
    const parsed = JSON.parse(readFileSync(meta, "utf8")) as { text?: string; settings?: { method?: string } };
    return { method: parsed.settings?.method ?? "", text: (parsed.text ?? "").trim() };
  } catch {
    return null;
  }
}

/** 묶음 방식으로 만든 파일이면 참 */
function isGroupedFile(id: string): boolean {
  return GROUPED_METHODS.includes(localMeta(id)?.method ?? "");
}

/** 묶음 방식으로 지금 글자 그대로 만든 파일이면 참 */
function doneGrouped(id: string, text: string): boolean {
  const meta = localMeta(id);
  return Boolean(meta && GROUPED_METHODS.includes(meta.method) && meta.text === text.trim());
}

/** DB에 이미 draft·approved(stale 아님) 상태로 올라간 audio_id → 글자들. 실패 시 빈 표를 돌려준다(`--source json`일 때만 쓴다). */
export async function loadDbActiveAudioIds(repo: ContentRepo | null): Promise<Map<string, Set<string>>> {
  if (!repo) return new Map();
  try {
    return activeAssetTexts(await repo.listAudioAssets());
  } catch {
    // 예전 JSON 방식: DB 연결이 없어도 로컬 판정으로 이어간다.
    return new Map();
  }
}

type Outcome = "written" | "split_failed" | "quota" | "failed";

async function request(group: BatchGroup, voice: string, apiKey: string): Promise<Response | "quota" | null> {
  const body = {
    model: FLASH_TTS_MODEL,
    input: [{ type: "user_input", content: groupContents(group) }],
    response_format: { type: "audio" },
    generation_config: { speech_config: [{ voice }] },
  };
  for (let attempt = 0; attempt < 4; attempt += 1) {
    let response: Response;
    try {
      response = await fetch(interactionsEndpoint(), { method: "POST", headers: authHeaders(apiKey), body: JSON.stringify(body) });
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 5000 * (attempt + 1)));
      continue;
    }
    if (response.status === 429) {
      const text = await response.text();
      // 하루 한도면 바로 멈춘다. 분당 제한이면 기다렸다가 다시 시도한다.
      if (/per day/i.test(text)) return "quota";
      await new Promise((resolve) => setTimeout(resolve, Math.max(retryDelayMs(attempt, response.headers.get("retry-after")), 20000)));
      continue;
    }
    if (response.status >= 500) {
      await new Promise((resolve) => setTimeout(resolve, 5000 * (attempt + 1)));
      continue;
    }
    return response;
  }
  return null;
}

async function runGroup(group: BatchGroup, voiceKey: PracticeVoiceKey, voice: string, apiKey: string): Promise<Outcome> {
  const response = await request(group, voice, apiKey);
  if (response === "quota") {
    await logPcTtsUsage({ voiceKey, kind: group.kind, ok: false, errorCode: "daily_quota" });
    return "quota";
  }
  if (!response) {
    await logPcTtsUsage({ voiceKey, kind: group.kind, ok: false, errorCode: "network_error" });
    console.error(`${group.groupId}: request failed`);
    return "failed";
  }
  if (!response.ok) {
    await logPcTtsUsage({ voiceKey, kind: group.kind, ok: false, errorCode: `http_${response.status}` });
    console.error(`${group.groupId}: ${response.status}`);
    return "failed";
  }
  const parsed = parseInteractionAudio(await response.json());
  const wav = parsed ? normalizeToWav(decodeBase64(parsed.base64), parsed.mime) : null;
  await logPcTtsUsage({ voiceKey, kind: group.kind, ok: Boolean(wav), errorCode: wav ? null : "invalid_audio" });
  if (!wav) {
    console.error(`${group.groupId}: no audio`);
    return "failed";
  }
  await mkdir(groupDir, { recursive: true });
  const generatedAt = new Date().toISOString();
  const fullName = `${group.groupId}-${generatedAt.replace(/[:.]/g, "")}`;
  await writeFile(join(groupDir, `${fullName}.wav`), wav.bytes);

  const count = groupPartCount(group);
  const split = splitChecked(wav.bytes, count, group.minGapMs);
  const groupMeta = {
    groupId: group.groupId,
    kind: group.kind,
    method: group.method,
    voice,
    model: FLASH_TTS_MODEL,
    stylePrompt: group.style,
    fillers: group.fillers,
    contents: groupContents(group).map((content) => content.text),
    items: group.items.map((item) => item.id),
    generatedAt,
    split: split ? { ok: split.ok, reason: split.reason, totalMs: split.totalMs, shortestCutGapMs: split.shortestCutGapMs, longestOtherGapMs: split.longestOtherGapMs } : null,
  };
  await writeFile(join(groupDir, `${fullName}.meta.json`), `${JSON.stringify(groupMeta, null, 2)}\n`);
  if (!split || !split.ok) {
    console.error(`${group.groupId}: split check failed (${split?.reason ?? "not wav"}). Kept the whole file only: groups/${fullName}.wav`);
    return "split_failed";
  }

  const offset = group.fillers ? 1 : 0;
  const lengths = group.items.map((_, index) => (split.parts[index + offset]?.endMs ?? 0) - (split.parts[index + offset]?.startMs ?? 0));
  for (const [index, item] of group.items.entries()) {
    const part = split.parts[index + offset];
    if (!part) continue;
    const wavPath = join(rawDir, `${item.id}.wav`);
    const metaPath = join(rawDir, `${item.id}.meta.json`);
    // 하나씩 만든 예전 파일은 `--single`로, 묶음으로 만든 이전 판은 `--prev-<시각>`으로 옮겨 둔다(덮어쓰지 않는다).
    if (existsSync(wavPath)) {
      const grouped = isGroupedFile(item.id);
      const keep = grouped ? `${item.id}--prev-${generatedAt.replace(/[:.]/g, "")}` : `${item.id}--single`;
      if (grouped || !existsSync(join(rawDir, `${keep}.wav`))) {
        await rename(wavPath, join(rawDir, `${keep}.wav`));
        if (existsSync(metaPath)) await rename(metaPath, join(rawDir, `${keep}.meta.json`));
      }
    }
    await writeFile(wavPath, part.bytes);
    const meta = {
      id: item.id,
      kind: item.unitKind,
      text: item.text,
      model: FLASH_TTS_MODEL,
      voice,
      voiceFixed: false,
      settings: { requestStyle: "interactions", method: group.method, temperature: null, stylePrompt: group.style },
      group: { id: group.groupId, file: `groups/${fullName}.wav`, position: index + 1, of: group.items.length, startMs: part.startMs, endMs: part.endMs },
      storedMime: "audio/wav",
      sha256: await sha256Hex(part.bytes),
      byteLength: part.bytes.length,
      generatedAt,
      reviewStatus: "draft",
      audioStatus: "draft_raw",
      core60Approved: false,
    };
    await writeFile(metaPath, `${JSON.stringify(meta, null, 2)}\n`);
  }
  // 끝자리 길이 점검: 마지막 조각이 나머지 평균의 70%보다 짧으면 알린다(자르기는 그대로 둔다).
  const lastLength = lengths[lengths.length - 1] ?? 0;
  const restMean = lengths.slice(0, -1).reduce((sum, value) => sum + value, 0) / Math.max(1, lengths.length - 1);
  const shortLast = group.items.length > 2 && group.kind !== "sentences" && group.kind !== "turns" && lastLength < restMean * 0.7;
  console.log(
    `${group.groupId}: ${group.items.length} written · cut pause ≥ ${split.shortestCutGapMs}ms, other ≤ ${split.longestOtherGapMs}ms${shortLast ? ` · last one short (${lastLength}ms vs ${Math.round(restMean)}ms)` : ""}`,
  );
  return "written";
}

async function main() {
  const keys = (argValue("--voices") ?? "erinome")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  // 적은 순서대로 만든다(예: erinome,sulafat,charon).
  const voices = keys.flatMap((key) => PRACTICE_VOICES.filter((row) => row.key === key));
  if (voices.length === 0) {
    console.error("--voices accepts charon, erinome, sulafat.");
    process.exit(1);
  }
  const kinds = (argValue("--kinds") ?? BATCH_KINDS.join(","))
    .split(",")
    .map((item) => item.trim())
    .filter((item): item is BatchKind => (BATCH_KINDS as string[]).includes(item));
  // 자음 묶음: 예) --groups j_ch_jj,s_ss,g_k_kk,b_p_pp,d_t_tt (기본 j_ch_jj). 학습 순서대로 적는다.
  const groupIds = (argValue("--groups") ?? "j_ch_jj")
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item === "j_ch_jj" || isOtherGroup(item));
  if (groupIds.length === 0) {
    console.error("--groups accepts j_ch_jj, s_ss, g_k_kk, b_p_pp, d_t_tt.");
    process.exit(1);
  }
  let source;
  try {
    source = await loadTtsSource(sourceKindFromArgs(process.argv));
  } catch (error) {
    if (!(error instanceof TtsSourceError)) throw error;
    console.error(error.message);
    process.exit(1);
  }
  console.log(
    source.kind === "db"
      ? `source: content DB (${source.snapshot.items.length} words, ${source.snapshot.items.filter((word) => word.example).length} with examples)`
      : "source: reference JSON (--source json)",
  );
  const replace = process.argv.includes("--replace");
  const dbActive = replace
    ? new Map<string, Set<string>>()
    : source.kind === "db"
      ? activeAssetTexts(source.assets)
      : await loadDbActiveAudioIds(resolveContentRepo());
  if (replace) {
    console.log("replace: regenerating matching audio (ignoring local/DB skip)");
  } else if (dbActive.size > 0) {
    console.log(`db: skipping ${dbActive.size} draft/approved audio ids whose text still matches`);
  }
  const done = makeDoneCheck({ doneLocal: doneGrouped, dbActive, replace });

  // --words-per-group 10 --sentences-per-group 5: 점검에 걸린 묶음을 작게 나눠 다시 만들 때
  const sizeArg = (flag: string) => {
    const value = Number(argValue(flag));
    return Number.isInteger(value) && value > 0 ? value : undefined;
  };
  const sizes = { words: sizeArg("--words-per-group"), sentences: sizeArg("--sentences-per-group") };
  const plans = voices.map((row) => {
    const taken = new Set<string>();
    return { row, groups: groupIds.flatMap((groupId) => batchPlan(row.key, kinds, done, groupId, taken, sizes, source.snapshot)) };
  });
  for (const { row, groups } of plans) {
    const byKind = kinds.map((kind) => {
      const list = groups.filter((group) => group.kind === kind);
      return `${kind} ${list.length}건/${list.reduce((sum, group) => sum + group.items.length, 0)}개`;
    });
    console.log(`${row.voice}: ${groups.length} requests (${byKind.join(", ")})`);
  }
  console.log(`total requests: ${plans.reduce((sum, plan) => sum + plan.groups.length, 0)}`);
  if (process.argv.includes("--dry-run")) return;

  const apiKey = readApiKey(process.env);
  if (!apiKey) {
    console.error(NOT_CONFIGURED_MESSAGE);
    process.exit(2);
  }
  const delayMs = Number(argValue("--delay") ?? "8000");
  const tally: Record<Outcome, number> = { written: 0, split_failed: 0, quota: 0, failed: 0 };
  outer: for (const { row, groups } of plans) {
    for (const group of groups) {
      const outcome = await runGroup(group, row.key, row.voice, apiKey);
      tally[outcome] += 1;
      if (outcome === "quota") {
        console.error(`daily limit reached at ${group.groupId}. Run the same command again after the limit resets.`);
        break outer;
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  console.log(
    `done. groups written ${tally.written}, split failed ${tally.split_failed}, failed ${tally.failed}${tally.quota ? ", stopped at daily limit" : ""}. review status stays draft.`,
  );
  if (tally.failed || tally.split_failed || tally.quota) process.exitCode = 3;
}

const isEntry = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isEntry) {
  void main();
}
