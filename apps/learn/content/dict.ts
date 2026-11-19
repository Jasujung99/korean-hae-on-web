// 단어 카드 '사전 풀이' 자료. scripts/dict-fetch.ts가 국립국어원 사전에서 받아 정리한 정적 JSON을 읽는다.
// 브라우저는 사전 API를 부르지 않는다. 서버가 낱말과 함께 내려 주고, 승인 전 항목은 개발 미리보기에서만 보낸다.
// status를 approved로 바꾸는 것은 검수자(사람)만 한다.
import { coreWords } from "./core-table.ts";
import entriesJson from "./dict/entries.json" with { type: "json" };
import { OTHER_GROUP_IDS, groupWords } from "./group-tables.ts";

export type DictStatus = "draft" | "needs_review" | "approved";
export const DICT_STATUSES: readonly DictStatus[] = ["draft", "needs_review", "approved"];
export const DICT_LANGUAGES = ["ru", "en"] as const;
export type DictEntryLanguage = (typeof DICT_LANGUAGES)[number];

export type DictTranslation = { word: string; definition: string };

export type KrdictEntry = {
  target_code: number;
  sup_no: number;
  pos: string;
  grade: string;
  origin: string;
  pronunciation: string;
  sense_order: number;
  definition: string;
  translations: Record<DictEntryLanguage, DictTranslation | null>;
  /** 기초사전 용례(문장). 출전 없는 기관 작성 용례만. */
  examples: string[];
};

export type StdictEntry = {
  target_code: number;
  sup_no: number;
  origin: string;
  pos: string;
  pronunciation: string;
  definition: string;
  /** 출전(source)이 없는 용례만 남긴다. */
  examples: string[];
};

export type DictEntry = {
  word: string;
  status: DictStatus;
  reviewNote: string;
  krdict: KrdictEntry | null;
  stdict: StdictEntry | null;
};

export type DictFile = {
  schemaVersion: 1;
  generatedAt: string;
  note: string;
  sources: Record<"krdict" | "stdict", { name: string; site: string; license: string; licenseUrl: string; policyUrl: string }>;
  entries: Record<string, DictEntry>;
};

export const DICT_FILE = entriesJson as unknown as DictFile;

export const DICT_ATTRIBUTION = {
  text: "출처: 국립국어원 한국어기초사전 · 표준국어대사전",
  license: "크리에이티브 커먼즈 저작자표시-동일조건변경허락 2.0 대한민국 라이선스",
  licenseUrl: "https://creativecommons.org/licenses/by-sa/2.0/kr/",
} as const;

export function dictEntry(wordId: string, file: DictFile = DICT_FILE): DictEntry | null {
  return file.entries[wordId] ?? null;
}

/** 학습자에게는 approved만 보낸다. 개발 미리보기(reviewMode)에서는 검수 전 항목도 보낸다. */
export function visibleDictEntry(wordId: string, reviewMode: boolean, file: DictFile = DICT_FILE): DictEntry | null {
  const entry = dictEntry(wordId, file);
  if (!entry) return null;
  if (entry.status !== "approved" && !reviewMode) return null;
  return entry;
}

export type DictIssue = { path: string; message: string };

const isText = (value: unknown): value is string => typeof value === "string";
const isCode = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value > 0;

/** entries.json 모양 검사. 키처럼 보이는 32자리 16진수가 들어 있어도 막는다. */
export function validateDictFile(file: DictFile, wordIds: string[], raw: string = JSON.stringify(file)): DictIssue[] {
  const issues: DictIssue[] = [];
  const add = (path: string, message: string) => issues.push({ path, message });
  if (file.schemaVersion !== 1) add("schemaVersion", "1이어야 해요");
  if (/\b[0-9a-fA-F]{32}\b/.test(raw)) add("(file)", "인증 키처럼 보이는 32자리 16진수가 있어요");
  if (/key=/i.test(raw)) add("(file)", "key= 문자열이 있어요");
  for (const name of ["krdict", "stdict"] as const) {
    const source = file.sources?.[name];
    if (!source || !source.license.includes("2.0 대한민국") || !source.licenseUrl.startsWith("https://creativecommons.org/licenses/by-sa/2.0/kr")) {
      add(`sources.${name}`, "출처·라이선스가 비었어요");
    }
  }
  const known = new Set(wordIds);
  for (const id of wordIds) if (!file.entries[id]) add(`entries.${id}`, "단어표 낱말의 사전 항목이 없어요");
  for (const [id, entry] of Object.entries(file.entries)) {
    const at = `entries.${id}`;
    if (!known.has(id)) add(at, "단어표에 없는 id예요");
    if (!isText(entry.word) || entry.word.length === 0) add(`${at}.word`, "낱말이 비었어요");
    if (!DICT_STATUSES.includes(entry.status)) add(`${at}.status`, "draft, needs_review, approved 가운데 하나여야 해요");
    if (!isText(entry.reviewNote)) add(`${at}.reviewNote`, "문자열이어야 해요");
    if (entry.status === "needs_review" && !entry.reviewNote) add(`${at}.reviewNote`, "검수 필요 까닭이 비었어요");
    if (entry.status === "approved" && !entry.krdict && !entry.stdict) add(at, "승인 항목에 사전 내용이 없어요");
    if ((!entry.krdict || !entry.stdict) && entry.status === "draft") add(`${at}.status`, "사전 한쪽이 비면 needs_review여야 해요");
    const kr = entry.krdict;
    if (kr) {
      if (!isCode(kr.target_code)) add(`${at}.krdict.target_code`, "양의 정수여야 해요");
      if (!isText(kr.definition) || !kr.definition) add(`${at}.krdict.definition`, "뜻풀이가 비었어요");
      for (const key of ["pos", "grade", "origin", "pronunciation"] as const) if (!isText(kr[key])) add(`${at}.krdict.${key}`, "문자열이어야 해요");
      const langs = Object.keys(kr.translations ?? {});
      if (langs.length !== 2 || !DICT_LANGUAGES.every((lang) => langs.includes(lang))) add(`${at}.krdict.translations`, "ru, en 두 칸이어야 해요");
      for (const lang of DICT_LANGUAGES) {
        const row = kr.translations?.[lang];
        if (row && (!isText(row.word) || !isText(row.definition) || (!row.word && !row.definition))) add(`${at}.krdict.translations.${lang}`, "대역어 모양이 틀려요");
      }
      if (!Array.isArray(kr.examples) || !kr.examples.every((row) => isText(row) && row.length > 0)) add(`${at}.krdict.examples`, "문장 배열이어야 해요");
    }
    const st = entry.stdict;
    if (st) {
      if (!isCode(st.target_code)) add(`${at}.stdict.target_code`, "양의 정수여야 해요");
      if (!isText(st.definition) || !st.definition) add(`${at}.stdict.definition`, "뜻풀이가 비었어요");
      for (const key of ["pos", "origin", "pronunciation"] as const) if (!isText(st[key])) add(`${at}.stdict.${key}`, "문자열이어야 해요");
      if (!Array.isArray(st.examples) || !st.examples.every((row) => typeof row === "string")) add(`${at}.stdict.examples`, "문장 배열이어야 해요");
      if ("source" in (st as Record<string, unknown>)) add(`${at}.stdict`, "출전 필드를 넣지 않아요");
    }
  }
  return issues;
}

/** 사전 풀이를 붙일 낱말: ㅈ·ㅊ·ㅉ 배치표와 나머지 묶음 배치표의 낱말 전부. 의사단어·첫 듣기 음절은 넣지 않는다. */
export type DictTarget = { id: string; word: string; pos: string; gloss: string; group: string };

export function dictTargets(): DictTarget[] {
  const rows: DictTarget[] = coreWords().map((row) => ({ id: row.id, word: row.word, pos: row.pos, gloss: row.gloss, group: "j_ch_jj" }));
  for (const group of OTHER_GROUP_IDS) {
    for (const row of groupWords(group)) rows.push({ id: row.id, word: row.word, pos: row.pos, gloss: row.gloss, group });
  }
  return rows;
}
