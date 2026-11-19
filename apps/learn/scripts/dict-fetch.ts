// 사전 자료 받기: 앱에 들어간 낱말(의사단어 제외)의 국립국어원 한국어기초사전·표준국어대사전 항목을 받아
// content/dict/entries.json(앱이 읽는 정적 자료)과 content/dict/review.md(검수표)로 정리한다.
//
//   KRDICT_API_KEY, STDICT_API_KEY 환경 변수로만 키를 받는다. 키는 출력하지 않고, 로그·오류의 key= 값은 가린다.
//   이미 받은 원본(content/dict/raw)은 다시 받지 않는다. 몇 번을 다시 돌려도 안전하다.
//   --offline: 네트워크 없이 받아 둔 원본만으로 다시 정리한다.
//
// 뜻이나 예문을 새로 만들지 않는다. 사전에 없으면 비워 두고 needs_review로 둔다.
// status를 approved로 바꾸지 않는다. 이미 approved인 항목(검수자가 바꾼 것)은 그대로 둔다.
// 사전 발음 파일(MP3)은 받지 않는다.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DICT_ATTRIBUTION, dictTargets, type DictEntry, type DictFile, type DictTarget } from "../content/dict.ts";
import {
  parseKrdictSearch,
  parseKrdictView,
  parseStdictSearch,
  parseStdictView,
  pickKrdict,
  pickStdict,
  redact,
  stdictViewTargets,
  type ApiError,
  type KrItem,
  type KrPick,
  type KrView,
  type StCandidate,
  type StPick,
} from "../content/dict/fetch-lib.ts";

const appRoot = fileURLToPath(new URL("..", import.meta.url));
const dictDir = join(appRoot, "content", "dict");
const rawDir = join(dictDir, "raw");
const entriesPath = join(dictDir, "entries.json");
const reviewPath = join(dictDir, "review.md");
const picksPath = join(dictDir, "picks.json");

const offline = process.argv.includes("--offline");
const krKey = process.env.KRDICT_API_KEY?.trim() ?? "";
const stKey = process.env.STDICT_API_KEY?.trim() ?? "";
const secrets = [krKey, stKey];
const DELAY_MS = Math.max(200, Number(process.env.DICT_FETCH_DELAY_MS ?? 400) || 400);
/** 한 번 돌릴 때 부르는 최대 횟수. 기초사전 하루 한도(5만 건)보다 훨씬 작게 둔다. */
const MAX_CALLS = 6000;

const KRDICT_API = "https://krdict.korean.go.kr/api";
const STDICT_API = "https://kdict.korean.go.kr/standard/api";

const log = (line: string) => console.log(redact(line, secrets));
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

if (!offline && (!/^[0-9A-Fa-f]{32}$/.test(krKey) || !/^[0-9A-Fa-f]{32}$/.test(stKey))) {
  console.error("KRDICT_API_KEY와 STDICT_API_KEY 환경 변수가 필요해요(16진수 32자리). 키 값은 출력하지 않아요.");
  process.exit(1);
}

class FatalApiError extends Error {}

let calls = 0;
let fetched = 0;

async function call(label: string, url: string): Promise<string> {
  if (calls >= MAX_CALLS) throw new FatalApiError(`이번 실행의 호출 한도(${MAX_CALLS})에 닿았어요. 다시 돌리면 받은 것은 건너뛰어요.`);
  let lastError = "";
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    await sleep(DELAY_MS);
    calls += 1;
    try {
      // 다른 주소로 넘기는 응답은 따라가지 않는다(키가 붙은 주소가 다른 곳으로 가지 않게).
      const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(20000), headers: { accept: "*/*" } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = await response.text();
      return redact(body, secrets);
    } catch (error) {
      lastError = redact(error instanceof Error ? `${error.name}: ${error.message}` : String(error), secrets);
      await sleep(1500 * attempt);
    }
  }
  throw new Error(`${label} 받기 실패: ${lastError}`);
}

function rawPath(...parts: string[]): string {
  return join(rawDir, ...parts);
}

function safeName(word: string): string {
  return word.replace(/[^가-힣0-9A-Za-z_-]/g, "_");
}

function checkError(label: string, error: ApiError | null) {
  if (!error) return;
  const message = redact(`${label}: 사전 API 오류 ${error.code} ${error.message}`, secrets);
  // 020 등록되지 않은 키, 021 일시 중지된 키, 000 시스템 오류는 더 부르지 않는다.
  if (["020", "021", "20", "21", "000", "0"].includes(error.code)) throw new FatalApiError(message);
  throw new Error(message);
}

/** 받아 둔 원본이 있으면 그대로, 없으면 받아서 검사한 뒤에만 저장한다. 오류 응답은 저장하지 않는다. */
async function cached(path: string, label: string, url: () => string, validate: (body: string) => ApiError | null): Promise<string | null> {
  if (existsSync(path)) return readFileSync(path, "utf8");
  if (offline) return null;
  const body = await call(label, url());
  checkError(label, validate(body));
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, body);
  fetched += 1;
  log(`받음 ${label}`);
  return body;
}

const q = (value: string | number) => encodeURIComponent(String(value));

async function krSearch(word: string): Promise<KrItem[] | null> {
  const body = await cached(
    rawPath("krdict", "search", `${safeName(word)}.xml`),
    `기초사전 검색 ${word}`,
    () => `${KRDICT_API}/search?key=${krKey}&q=${q(word)}&num=100&translated=y&trans_lang=1,10`,
    (text) => parseKrdictSearch(text, word).error,
  );
  return body === null ? null : parseKrdictSearch(body, word).items;
}

async function krView(code: number): Promise<KrView | null> {
  const body = await cached(
    rawPath("krdict", "view", `${code}.xml`),
    `기초사전 상세 ${code}`,
    () => `${KRDICT_API}/view?key=${krKey}&method=target_code&q=${code}&translated=y&trans_lang=1,10`,
    (text) => parseKrdictView(text).error,
  );
  return body === null ? null : parseKrdictView(body).view;
}

async function stSearch(word: string) {
  const body = await cached(
    rawPath("stdict", "search", `${safeName(word)}.json`),
    `표준사전 검색 ${word}`,
    () => `${STDICT_API}/search.do?key=${stKey}&q=${q(word)}&req_type=json&num=100`,
    (text) => parseStdictSearch(text, word).error,
  );
  return body === null ? null : parseStdictSearch(body, word).items;
}

async function stView(code: number) {
  // 상세는 JSON 요청이 빈 본문으로 와서 XML로 받는다.
  const body = await cached(
    rawPath("stdict", "view", `${code}.xml`),
    `표준사전 상세 ${code}`,
    () => `${STDICT_API}/view.do?key=${stKey}&method=target_code&q=${code}`,
    (text) => parseStdictView(text).error,
  );
  return body === null ? null : parseStdictView(body).view;
}

type Picks = Record<string, { krdict?: number; stdict?: number }>;

function readJsonFile<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

type Built = { target: DictTarget; entry: DictEntry; kr: KrPick | null; st: StPick | null; failure: string | null; kept: boolean };

function krEntry(pick: KrPick, view: KrView | null): DictEntry["krdict"] {
  if (!pick.chosen) return null;
  const { item, senseIndex } = pick.chosen;
  const sense = item.senses[senseIndex];
  if (!sense || !sense.definition) return null;
  // 상세의 같은 뜻(뜻풀이가 같은 것)에서 출전 없는 기관 작성 문장 용례만 둘까지.
  const viewSense = view?.senses.find((row) => row.definition === sense.definition) ?? view?.senses[senseIndex];
  const examples = (viewSense?.examples ?? []).filter((row) => row.type === "문장" && row.text).map((row) => row.text).slice(0, 2);
  return {
    target_code: item.target_code,
    sup_no: item.sup_no,
    pos: item.pos,
    grade: item.grade,
    origin: view?.origin || item.origin,
    pronunciation: view?.pronunciation || item.pronunciation,
    sense_order: sense.order,
    definition: sense.definition,
    translations: { ru: sense.translations.ru, en: sense.translations.en },
    examples,
  };
}

function stEntry(pick: StPick): DictEntry["stdict"] {
  const chosen = pick.chosen;
  const view = chosen?.candidate.view;
  if (!chosen || !view) return null;
  const sense = view.senses[chosen.senseIndex];
  if (!sense || !sense.definition) return null;
  return {
    target_code: chosen.candidate.item.target_code,
    sup_no: chosen.candidate.item.sup_no,
    origin: view.origin,
    pos: sense.pos,
    pronunciation: view.pronunciation,
    definition: sense.definition,
    // 출전(source)이 있는 용례는 원저작자에게 권리가 있어 넣지 않는다.
    examples: sense.examples.filter((row) => !row.source && row.text).map((row) => row.text).slice(0, 2),
  };
}

async function build(target: DictTarget, picks: Picks, previous: DictFile | null): Promise<Built> {
  const old = previous?.entries[target.id];
  if (old && old.status === "approved") {
    return { target, entry: old, kr: null, st: null, failure: null, kept: true };
  }
  // 우리 뜻의 '(출제 위치: …)' 같은 괄호 메모는 대조에서 뺀다.
  const gloss = target.gloss.replace(/\s*\([^)]*\)/g, "").trim();
  const input = { word: target.word, pos: target.pos, gloss };
  const pin = picks[target.id] ?? {};
  const notes: string[] = [];
  let failure: string | null = null;
  let kr: KrPick | null = null;
  let st: StPick | null = null;
  let krdict: DictEntry["krdict"] = null;
  let stdict: DictEntry["stdict"] = null;
  let krItems: KrItem[] | null = null;
  try {
    krItems = await krSearch(target.word);
    if (krItems === null) {
      notes.push("기초사전 원본이 없어요(--offline).");
    } else {
      kr = pickKrdict(input, krItems, pin.krdict ?? null);
      const view = kr.chosen ? await krView(kr.chosen.item.target_code) : null;
      krdict = krEntry(kr, view);
      notes.push(`기초사전: ${kr.reason}`);
    }
    const stItems = await stSearch(target.word);
    if (stItems === null) {
      notes.push("표준국어대사전 원본이 없어요(--offline).");
    } else {
      const krHint = krdict ? { definition: krdict.definition, origin: krdict.origin, pos: krdict.pos } : null;
      const wanted = stdictViewTargets(input, stItems, krHint);
      if (pin.stdict && !wanted.some((row) => row.target_code === pin.stdict)) {
        const pinned = stItems.find((row) => row.target_code === pin.stdict);
        if (pinned) wanted.push(pinned);
      }
      const candidates: StCandidate[] = [];
      for (const item of wanted) candidates.push({ item, view: await stView(item.target_code) });
      st = pickStdict(input, candidates, krHint, pin.stdict ?? null);
      stdict = stEntry(st);
      notes.push(`표준국어대사전: ${st.reason}`);
      // 표준국어대사전에서 고른 뜻풀이·원어를 실마리로 기초사전을 한 번 더 고른다(우리 뜻이 풀어 쓴 글이라 겹침이 낮을 때가 많다).
      if (krItems && stdict) {
        const again = pickKrdict(input, krItems, pin.krdict ?? null, { definition: stdict.definition, origin: stdict.origin });
        if (again.chosen) {
          const view = await krView(again.chosen.item.target_code);
          kr = again;
          krdict = krEntry(again, view);
          notes[0] = `기초사전: ${again.reason}`;
        }
      }
    }
  } catch (error) {
    if (error instanceof FatalApiError) throw error;
    failure = redact(error instanceof Error ? error.message : String(error), secrets);
    notes.push(`받기 실패: ${failure}`);
  }
  const twoMeanings = /,\s*또는\s/.test(gloss);
  if (twoMeanings) notes.push("우리 뜻에 두 뜻이 함께 적혀 있어 어느 뜻을 보일지 정해야 해요.");
  const originsDiffer = Boolean(krdict?.origin && stdict?.origin && krdict.origin !== stdict.origin);
  if (originsDiffer) notes.push(`두 사전의 원어가 달라요(${krdict?.origin} · ${stdict?.origin}).`);
  const confident = Boolean(kr?.confident && st?.confident && krdict && stdict && !failure && !originsDiffer && !twoMeanings);
  if (krdict && !krdict.translations.ru) notes.push("기초사전에 러시아어 대역어가 없어요.");
  if (krdict && !krdict.translations.en) notes.push("기초사전에 영어 대역어가 없어요.");
  const entry: DictEntry = {
    word: target.word,
    status: confident ? "draft" : "needs_review",
    reviewNote: notes.join(" "),
    krdict,
    stdict,
  };
  return { target, entry, kr, st, failure, kept: false };
}

const short = (text: string, length = 70) => (text.length > length ? `${text.slice(0, length)}…` : text);
const cell = (text: string) => text.replace(/\|/g, "\\|").replace(/\n/g, " ");

function reviewMarkdown(rows: Built[], generatedAt: string): string {
  const count = (status: string) => rows.filter((row) => row.entry.status === status).length;
  const missingKr = rows.filter((row) => !row.kept && !row.entry.krdict).map((row) => `${row.target.word}(${row.target.id})`);
  const missingSt = rows.filter((row) => !row.kept && !row.entry.stdict).map((row) => `${row.target.word}(${row.target.id})`);
  const out: string[] = [];
  out.push("# 사전 풀이 검수표");
  out.push("");
  out.push(`만든 때: ${generatedAt} · 만든 명령: \`npm run dict:fetch\` (apps/learn)`);
  out.push("");
  out.push("이 표를 보고 맞는 항목만 `entries.json`의 `status`를 `approved`로 바꿔 주세요. 승인은 검수자만 해요.");
  out.push("뜻을 잘못 고른 낱말은 `content/dict/picks.json`에 `{ \"낱말 id\": { \"krdict\": 번호, \"stdict\": 번호 } }`로 적고 `npm run dict:fetch -- --offline`을 다시 돌리면 그 번호로 다시 정리해요.");
  out.push("");
  out.push(`- 전체 ${rows.length}개 · draft ${count("draft")} · needs_review ${count("needs_review")} · approved ${count("approved")}`);
  out.push(`- 기초사전에 없던 낱말 ${missingKr.length}개: ${missingKr.join(", ") || "없음"}`);
  out.push(`- 표준국어대사전에 없던 낱말 ${missingSt.length}개: ${missingSt.join(", ") || "없음"}`);
  out.push("");
  out.push("needs_review를 먼저, 그다음 draft 순서로 적었어요. 점수는 우리 뜻(gloss)과 사전 뜻풀이의 글자 겹침(0~1)이고, 표준국어대사전은 원어가 같으면 0.2를 더했어요.");
  out.push("");
  const ordered = [...rows].sort((a, b) => {
    const rank = (row: Built) => (row.entry.status === "needs_review" ? 0 : row.entry.status === "draft" ? 1 : 2);
    return rank(a) - rank(b);
  });
  for (const row of ordered) {
    const { target, entry } = row;
    out.push(`## ${target.word} · \`${target.id}\` · ${entry.status}`);
    out.push("");
    out.push(`- 우리 단어표: 품사 ${target.pos || "(없음)"} · 뜻 ${target.gloss || "(없음)"}`);
    if (row.kept) {
      out.push("- 이미 approved라 다시 고르지 않았어요.");
      out.push("");
      continue;
    }
    out.push(`- 고른 까닭: ${entry.reviewNote}`);
    const kr = entry.krdict;
    out.push(
      kr
        ? `- 기초사전 고름: ${kr.target_code} (${target.word}${kr.sup_no || ""}, ${kr.pos}, ${kr.grade || "등급 없음"}${kr.origin ? `, ${kr.origin}` : ""}) 뜻 ${kr.sense_order}: ${kr.definition}`
        : "- 기초사전 고름: 없음",
    );
    if (kr) {
      out.push(`  - ru: ${kr.translations.ru ? `${kr.translations.ru.word} — ${short(kr.translations.ru.definition)}` : "(없음)"}`);
      out.push(`  - en: ${kr.translations.en ? `${kr.translations.en.word} — ${short(kr.translations.en.definition)}` : "(없음)"}`);
    }
    const krOthers = row.kr?.others ?? [];
    if (krOthers.length > 0) {
      out.push("  - 다른 후보:");
      for (const other of krOthers) {
        const sense = other.item.senses[other.senseIndex];
        out.push(`    - ${other.item.target_code} (${other.item.pos}, ${other.item.grade || "등급 없음"}${other.item.origin ? `, ${other.item.origin}` : ""}) 점수 ${other.score}: ${cell(short(sense?.definition ?? ""))}`);
      }
    }
    const st = entry.stdict;
    out.push(
      st
        ? `- 표준국어대사전 고름: ${st.target_code} (${target.word}${st.sup_no ? String(st.sup_no).padStart(2, "0") : ""}, ${st.pos}${st.origin ? `, ${st.origin}` : ""}${st.pronunciation ? `, [${st.pronunciation}]` : ""}): ${st.definition}`
        : "- 표준국어대사전 고름: 없음",
    );
    const stOthers = row.st?.others ?? [];
    if (stOthers.length > 0) {
      out.push("  - 다른 후보:");
      for (const other of stOthers) {
        const sense = other.candidate.view?.senses[other.senseIndex];
        out.push(`    - ${other.candidate.item.target_code} (${sense?.pos ?? other.candidate.item.pos}${other.candidate.item.origin ? `, ${other.candidate.item.origin}` : ""}) 점수 ${other.score}: ${cell(short(sense?.definition ?? other.candidate.item.definition))}`);
      }
    }
    out.push("");
  }
  return `${out.join("\n")}\n`;
}

async function main() {
  const targets = dictTargets();
  const previous = readJsonFile<DictFile>(entriesPath);
  const picks = readJsonFile<Picks>(picksPath) ?? {};
  log(`대상 낱말 ${targets.length}개(서로 다른 표기 ${new Set(targets.map((row) => row.word)).size}개)${offline ? " · 네트워크 없이" : ""}`);
  const rows: Built[] = [];
  let fatal: string | null = null;
  for (const target of targets) {
    try {
      rows.push(await build(target, picks, previous));
    } catch (error) {
      fatal = redact(error instanceof Error ? error.message : String(error), secrets);
      break;
    }
  }
  if (fatal) {
    // 키 문제처럼 더 부르면 안 되는 오류: 받은 원본은 남기고, 정리 파일은 바꾸지 않는다.
    console.error(fatal);
    console.error(`멈췄어요. 이번에 받은 원본 ${fetched}개는 남겨 두었고 다시 돌리면 이어서 받아요.`);
    process.exit(1);
  }
  const generatedAt = new Date().toISOString();
  const file: DictFile = {
    schemaVersion: 1,
    generatedAt,
    note: "npm run dict:fetch로 만든 사전 풀이 자료. 사람이 review.md를 보고 맞는 항목만 status를 approved로 바꾼다. 학습자에게는 approved만 보인다.",
    sources: {
      krdict: {
        name: "국립국어원 한국어기초사전",
        site: "https://krdict.korean.go.kr",
        license: DICT_ATTRIBUTION.license,
        licenseUrl: DICT_ATTRIBUTION.licenseUrl,
        policyUrl: "https://krdict.korean.go.kr/kor/kboardPolicy/copyRightTermsInfo",
      },
      stdict: {
        name: "국립국어원 표준국어대사전",
        site: "https://stdict.korean.go.kr",
        license: DICT_ATTRIBUTION.license,
        licenseUrl: DICT_ATTRIBUTION.licenseUrl,
        policyUrl: "https://kdict.korean.go.kr/info/copyright",
      },
    },
    entries: Object.fromEntries(rows.map((row) => [row.target.id, row.entry])),
  };
  mkdirSync(dictDir, { recursive: true });
  writeFileSync(entriesPath, `${JSON.stringify(file, null, 2)}\n`);
  writeFileSync(reviewPath, reviewMarkdown(rows, generatedAt));
  const count = (status: string) => rows.filter((row) => row.entry.status === status).length;
  const failures = rows.filter((row) => row.failure);
  log(`정리함 ${rows.length}개 · draft ${count("draft")} · needs_review ${count("needs_review")} · approved ${count("approved")} · 이번 호출 ${calls}번 · 새로 받은 원본 ${fetched}개`);
  if (failures.length > 0) {
    for (const row of failures) log(`받기 실패 ${row.target.id} ${row.target.word}: ${row.failure}`);
    process.exit(1);
  }
}

main().catch((error: unknown) => {
  console.error(redact(error instanceof Error ? error.message : String(error), secrets));
  process.exit(1);
});
