// 사전 자료 받기(scripts/dict-fetch.ts)가 쓰는 순수 함수: 응답 읽기, 정리, 뜻 고르기.
// 네트워크와 인증 키는 여기서 다루지 않는다. 뜻이나 예문을 새로 만들지 않고, 받은 글만 옮긴다.

// ---- 작은 XML 읽기(기초사전·표준국어대사전 응답 모양만 다룬다) ----

export type XmlNode = { name: string; children: XmlNode[]; text: string };

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

export function decodeEntities(value: string): string {
  return value.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (match, body: string) => {
    if (body.startsWith("#")) {
      const code = body[1] === "x" || body[1] === "X" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return ENTITIES[body] ?? match;
  });
}

export function parseXml(source: string): XmlNode {
  const root: XmlNode = { name: "#root", children: [], text: "" };
  const stack: XmlNode[] = [root];
  const top = () => stack[stack.length - 1] as XmlNode;
  let i = 0;
  while (i < source.length) {
    const lt = source.indexOf("<", i);
    if (lt < 0) {
      top().text += decodeEntities(source.slice(i));
      break;
    }
    if (lt > i) top().text += decodeEntities(source.slice(i, lt));
    if (source.startsWith("<![CDATA[", lt)) {
      const end = source.indexOf("]]>", lt);
      if (end < 0) break;
      top().text += source.slice(lt + 9, end);
      i = end + 3;
      continue;
    }
    if (source.startsWith("<!--", lt)) {
      const end = source.indexOf("-->", lt);
      if (end < 0) break;
      i = end + 3;
      continue;
    }
    const gt = source.indexOf(">", lt);
    if (gt < 0) break;
    const raw = source.slice(lt + 1, gt);
    i = gt + 1;
    if (raw.startsWith("?") || raw.startsWith("!")) continue;
    if (raw.startsWith("/")) {
      const name = raw.slice(1).trim();
      for (let k = stack.length - 1; k > 0; k -= 1) {
        if (stack[k]?.name === name) {
          stack.length = k;
          break;
        }
      }
      continue;
    }
    const selfClosing = raw.endsWith("/");
    const name = raw.replace(/\/$/, "").trim().split(/\s+/)[0] ?? "";
    const node: XmlNode = { name, children: [], text: "" };
    top().children.push(node);
    if (!selfClosing) stack.push(node);
  }
  return root;
}

export function kids(node: XmlNode | undefined, name: string): XmlNode[] {
  return node ? node.children.filter((child) => child.name === name) : [];
}

export function kid(node: XmlNode | undefined, name: string): XmlNode | undefined {
  return node?.children.find((child) => child.name === name);
}

export function descendants(node: XmlNode | undefined, name: string): XmlNode[] {
  if (!node) return [];
  const out: XmlNode[] = [];
  for (const child of node.children) {
    if (child.name === name) out.push(child);
    out.push(...descendants(child, name));
  }
  return out;
}

/** 태그를 걷어 내고 공백을 하나로 줄인다. */
export function clean(value: string | undefined | null): string {
  if (!value) return "";
  return decodeEntities(value.replace(/<[^>]*>/g, ""))
    .replace(/\s+/g, " ")
    .trim();
}

export function textOf(node: XmlNode | undefined, name: string): string {
  return clean(kid(node, name)?.text);
}

// ---- 응답 모양 ----

export type DictLang = "ru" | "en";
export type Translation = { word: string; definition: string };

export type KrSense = { order: number; definition: string; translations: Record<DictLang, Translation | null> };
export type KrItem = {
  target_code: number;
  word: string;
  sup_no: number;
  origin: string;
  pronunciation: string;
  grade: string;
  pos: string;
  senses: KrSense[];
};

export type ApiError = { code: string; message: string };

function xmlError(root: XmlNode): ApiError | null {
  const error = kid(root, "error");
  if (!error) return null;
  return { code: textOf(error, "error_code"), message: textOf(error, "message") };
}

const LANG_NAMES: Record<string, DictLang> = { 영어: "en", 러시아어: "ru" };

function translationsOf(node: XmlNode): Record<DictLang, Translation | null> {
  const out: Record<DictLang, Translation | null> = { ru: null, en: null };
  for (const row of kids(node, "translation")) {
    const lang = LANG_NAMES[textOf(row, "trans_lang")];
    if (!lang) continue;
    const word = textOf(row, "trans_word");
    const definition = textOf(row, "trans_dfn");
    if (word || definition) out[lang] = { word, definition };
  }
  return out;
}

/** 한국어기초사전 /api/search 응답. 같은 표기의 표제어만 남긴다. */
export function parseKrdictSearch(xml: string, word: string): { error: ApiError | null; items: KrItem[] } {
  const root = parseXml(xml);
  const error = xmlError(root);
  if (error) return { error, items: [] };
  const channel = kid(root, "channel");
  if (!channel) return { error: { code: "shape", message: "channel이 없어요" }, items: [] };
  const items = kids(channel, "item")
    .map((item) => ({
      target_code: Number(textOf(item, "target_code")),
      word: textOf(item, "word"),
      sup_no: Number(textOf(item, "sup_no") || 0),
      origin: textOf(item, "origin"),
      pronunciation: textOf(item, "pronunciation"),
      grade: textOf(item, "word_grade"),
      pos: textOf(item, "pos"),
      senses: kids(item, "sense").map((sense, index) => ({
        order: Number(textOf(sense, "sense_order") || index + 1),
        definition: textOf(sense, "definition"),
        translations: translationsOf(sense),
      })),
    }))
    .filter((item) => item.word === word && Number.isInteger(item.target_code) && item.target_code > 0);
  return { error: null, items };
}

export type KrViewSense = { definition: string; translations: Record<DictLang, Translation | null>; examples: Array<{ type: string; text: string }> };
export type KrView = { target_code: number; origin: string; pronunciation: string; senses: KrViewSense[] };

/** 한국어기초사전 /api/view 응답(대상 코드 하나). */
export function parseKrdictView(xml: string): { error: ApiError | null; view: KrView | null } {
  const root = parseXml(xml);
  const error = xmlError(root);
  if (error) return { error, view: null };
  const item = kid(kid(root, "channel"), "item");
  const info = kid(item, "word_info");
  if (!item || !info) return { error: null, view: null };
  const origins = kids(info, "original_language_info").map((row) => textOf(row, "original_language")).filter(Boolean);
  return {
    error: null,
    view: {
      target_code: Number(textOf(item, "target_code")),
      origin: origins.join(""),
      pronunciation: kids(info, "pronunciation_info").map((row) => textOf(row, "pronunciation")).filter(Boolean)[0] ?? "",
      senses: kids(info, "sense_info").map((sense) => ({
        definition: textOf(sense, "definition"),
        translations: translationsOf(sense),
        examples: kids(sense, "example_info").map((row) => ({ type: textOf(row, "type"), text: textOf(row, "example") })),
      })),
    },
  };
}

export type StItem = { target_code: number; word: string; sup_no: number; pos: string; origin: string; definition: string };

type JsonRecord = Record<string, unknown>;
const asRecord = (value: unknown): JsonRecord | null => (value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null);
const asList = (value: unknown): unknown[] => (Array.isArray(value) ? value : value === undefined || value === null ? [] : [value]);
const str = (value: unknown): string => (typeof value === "string" || typeof value === "number" ? clean(String(value)) : "");

/** 표준국어대사전 /standard/api/search.do JSON 응답. 같은 표기만 남긴다. 결과가 없으면 빈 본문이 오기도 한다. */
export function parseStdictSearch(body: string, word: string): { error: ApiError | null; items: StItem[] } {
  if (!body.trim()) return { error: null, items: [] };
  let data: unknown;
  try {
    data = JSON.parse(body);
  } catch {
    return { error: { code: "shape", message: "JSON이 아니에요" }, items: [] };
  }
  const record = asRecord(data);
  const error = asRecord(record?.error);
  if (error) return { error: { code: str(error.error_code), message: str(error.message) }, items: [] };
  const channel = asRecord(record?.channel);
  const items = asList(channel?.item)
    .map(asRecord)
    .filter((item): item is JsonRecord => item !== null)
    .map((item) => {
      const sense = asRecord(asList(item.sense)[0]);
      return {
        target_code: Number(str(item.target_code)),
        word: str(item.word),
        sup_no: Number(str(item.sup_no) || 0),
        pos: str(item.pos),
        origin: str(item.origin),
        definition: str(sense?.definition),
      };
    })
    .filter((item) => item.word.replace(/[-^ ]/g, "") === word && Number.isInteger(item.target_code) && item.target_code > 0);
  return { error: null, items };
}

export type StViewSense = { pos: string; definition: string; examples: Array<{ text: string; source: string }> };
export type StView = { target_code: number; word: string; origin: string; pronunciation: string; senses: StViewSense[] };

/** 표준국어대사전 /standard/api/view.do XML 응답(대상 코드 하나). JSON 요청은 빈 본문이 와서 XML로 받는다. */
export function parseStdictView(xml: string): { error: ApiError | null; view: StView | null } {
  const root = parseXml(xml);
  const error = xmlError(root);
  if (error) return { error, view: null };
  const item = kid(kid(root, "channel"), "item");
  const info = kid(item, "word_info");
  if (!item || !info) return { error: null, view: null };
  const senses: StViewSense[] = [];
  for (const posInfo of kids(info, "pos_info")) {
    const pos = textOf(posInfo, "pos");
    for (const sense of descendants(posInfo, "sense_info")) {
      senses.push({
        pos,
        definition: textOf(sense, "definition"),
        examples: kids(sense, "example_info").map((row) => ({ text: textOf(row, "example"), source: textOf(row, "source") })),
      });
    }
  }
  return {
    error: null,
    view: {
      target_code: Number(textOf(item, "target_code")),
      word: textOf(info, "word"),
      origin: kids(info, "original_language_info").map((row) => textOf(row, "original_language")).filter(Boolean).join(""),
      pronunciation: kids(info, "pronunciation_info").map((row) => textOf(row, "pronunciation")).filter(Boolean)[0] ?? "",
      senses,
    },
  };
}

// ---- 뜻 고르기 ----

/** 우리 단어표의 품사 줄임말 → 사전 품사 */
export const POS_NAMES: Record<string, string> = {
  명: "명사",
  동: "동사",
  형: "형용사",
  부: "부사",
  대: "대명사",
  감: "감탄사",
  관: "관형사",
  수: "수사",
  의: "의존 명사",
};

function bigrams(value: string): string[] {
  const text = value.replace(/[^가-힣0-9A-Za-z]/g, "");
  const out: string[] = [];
  for (let i = 0; i < text.length - 1; i += 1) out.push(text.slice(i, i + 2));
  if (text.length === 1) out.push(text);
  return out;
}

/** 우리 뜻(짧다)이 사전 뜻풀이에 얼마나 들어 있는지와 두 글의 겹침을 섞은 0~1 값. */
export function similarity(ours: string, theirs: string): number {
  const a = bigrams(ours);
  const b = bigrams(theirs);
  if (a.length === 0 || b.length === 0) return 0;
  const pool = new Map<string, number>();
  for (const gram of b) pool.set(gram, (pool.get(gram) ?? 0) + 1);
  let shared = 0;
  for (const gram of a) {
    const left = pool.get(gram) ?? 0;
    if (left > 0) {
      shared += 1;
      pool.set(gram, left - 1);
    }
  }
  const coverage = shared / a.length;
  const dice = (2 * shared) / (a.length + b.length);
  return Math.round((0.7 * coverage + 0.3 * dice) * 1000) / 1000;
}

const GRADE_RANK: Record<string, number> = { 초급: 0, 중급: 1, 고급: 2 };

export type Scored<T> = { item: T; senseIndex: number; score: number };

export type PickInput = { word: string; pos: string; gloss: string };

export type KrPick = {
  chosen: Scored<KrItem> | null;
  others: Array<Scored<KrItem>>;
  confident: boolean;
  reason: string;
};

export type DefinitionHint = { definition: string; origin: string };

/**
 * 기초사전 후보에서 우리 뜻에 맞는 표제어·뜻 하나를 고른다. 확신이 없으면 confident=false.
 * hint: 표준국어대사전에서 고른 뜻풀이·원어. 우리 뜻은 풀어 쓴 글이라 글자 겹침이 낮아서, 두 사전끼리의 겹침과 원어 일치도 함께 본다.
 */
export function pickKrdict(input: PickInput, items: KrItem[], pinned: number | null = null, hint: DefinitionHint | null = null): KrPick {
  if (items.length === 0) return { chosen: null, others: [], confident: false, reason: "기초사전에 같은 표기의 표제어가 없어요." };
  const wantPos = POS_NAMES[input.pos] ?? "";
  const scored = items.map((item) => {
    let best: Scored<KrItem> = { item, senseIndex: 0, score: 0 };
    item.senses.forEach((sense, senseIndex) => {
      let score = input.gloss ? similarity(input.gloss, sense.definition) : 0;
      if (hint?.definition) score = Math.max(score, similarity(hint.definition, sense.definition));
      if (hint?.origin && item.origin && hint.origin === item.origin) score += 0.2;
      score = Math.round(score * 1000) / 1000;
      if (score > best.score) best = { item, senseIndex, score };
    });
    return best;
  });
  const rank = (row: Scored<KrItem>) =>
    [
      wantPos && row.item.pos !== wantPos ? 1 : 0,
      -row.score,
      GRADE_RANK[row.item.grade] ?? 3,
      row.item.sup_no,
    ] as const;
  const sorted = [...scored].sort((x, y) => {
    const a = rank(x);
    const b = rank(y);
    for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return (a[i] as number) - (b[i] as number);
    return 0;
  });
  if (pinned !== null) {
    const hit = sorted.find((row) => row.item.target_code === pinned);
    if (hit) return { chosen: hit, others: sorted.filter((row) => row !== hit), confident: true, reason: `검수자가 정한 기초사전 번호(${pinned})를 썼어요.` };
  }
  const chosen = sorted[0] as Scored<KrItem>;
  const others = sorted.slice(1);
  const runnerUp = others[0]?.score ?? 0;
  const posOk = !wantPos || chosen.item.pos === wantPos;
  if (!input.gloss) {
    return {
      chosen,
      others,
      confident: false,
      reason: `우리 단어표에 뜻이 없어 대조하지 못했어요. ${posOk ? "" : "품사도 맞지 않아요. "}등급이 낮고 어깨번호가 앞선 항목을 임시로 골랐어요.`,
    };
  }
  if (!posOk) return { chosen, others, confident: false, reason: `우리 품사(${wantPos})와 같은 기초사전 항목이 없어요.` };
  if (chosen.score < 0.15) return { chosen, others, confident: false, reason: `우리 뜻과 사전 뜻풀이가 많이 달라요(일치 ${chosen.score}).` };
  if (others.length > 0 && chosen.score - runnerUp < 0.1) {
    return { chosen, others, confident: false, reason: `다른 동형어와 점수 차이가 작아요(${chosen.score} 대 ${runnerUp}).` };
  }
  const senseNote = chosen.item.senses.length > 1 ? ` 다의어 ${chosen.item.senses.length}개 뜻 가운데 ${chosen.senseIndex + 1}번째를 골랐어요.` : "";
  return {
    chosen,
    others,
    confident: true,
    reason: `우리 뜻과 가장 잘 맞아요(일치 ${chosen.score}${others.length > 0 ? `, 다음 후보 ${runnerUp}` : ""}).${senseNote}`,
  };
}

export type StCandidate = { item: StItem; view: StView | null };

export type StPick = {
  chosen: { candidate: StCandidate; senseIndex: number; score: number } | null;
  others: Array<{ candidate: StCandidate; senseIndex: number; score: number }>;
  confident: boolean;
  reason: string;
};

/** 표준국어대사전 후보에서 고른다. 우리 뜻과 기초사전에서 고른 뜻풀이를 함께 대조하고, 원어(한자)가 같으면 더 쳐 준다. */
export function pickStdict(
  input: PickInput,
  candidates: StCandidate[],
  kr: { definition: string; origin: string; pos: string } | null,
  pinned: number | null = null,
): StPick {
  if (candidates.length === 0) return { chosen: null, others: [], confident: false, reason: "표준국어대사전에 같은 표기의 표제어가 없어요." };
  const wantPos = POS_NAMES[input.pos] ?? kr?.pos ?? "";
  const scored = candidates.map((candidate) => {
    const senses = candidate.view?.senses.length ? candidate.view.senses : [{ pos: candidate.item.pos, definition: candidate.item.definition, examples: [] }];
    let best = { candidate, senseIndex: 0, score: -1 };
    senses.forEach((sense, senseIndex) => {
      let score = Math.max(input.gloss ? similarity(input.gloss, sense.definition) : 0, kr ? similarity(kr.definition, sense.definition) : 0);
      const origin = candidate.view?.origin || candidate.item.origin;
      if (kr?.origin && origin && origin === kr.origin) score += 0.2;
      if (wantPos && sense.pos !== wantPos) score -= 0.3;
      score = Math.round(score * 1000) / 1000;
      if (score > best.score) best = { candidate, senseIndex, score };
    });
    return best;
  });
  const sorted = [...scored].sort((x, y) => y.score - x.score || x.candidate.item.sup_no - y.candidate.item.sup_no);
  if (pinned !== null) {
    const hit = sorted.find((row) => row.candidate.item.target_code === pinned);
    if (hit) return { chosen: hit, others: sorted.filter((row) => row !== hit), confident: true, reason: `검수자가 정한 표준국어대사전 번호(${pinned})를 썼어요.` };
  }
  const chosen = sorted[0] as StPick["others"][number];
  const others = sorted.slice(1);
  const runnerUp = others[0]?.score ?? 0;
  if (!chosen.candidate.view) return { chosen, others, confident: false, reason: "표준국어대사전 상세 내용을 받지 못했어요." };
  if (chosen.score < 0.25) return { chosen, others, confident: false, reason: `맞는 뜻을 찾지 못했어요(일치 ${chosen.score}).` };
  if (others.length > 0 && chosen.score - runnerUp < 0.1) {
    return { chosen, others, confident: false, reason: `다른 동형어와 점수 차이가 작아요(${chosen.score} 대 ${runnerUp}).` };
  }
  return { chosen, others, confident: true, reason: `우리 뜻·기초사전 뜻풀이와 가장 잘 맞아요(일치 ${chosen.score}${others.length > 0 ? `, 다음 후보 ${runnerUp}` : ""}).` };
}

/** 표준국어대사전 상세를 받을 후보: 같은 품사를 앞에, 검색 결과의 첫 뜻풀이 점수가 높은 순으로 최대 limit개. */
export function stdictViewTargets(input: PickInput, items: StItem[], kr: { definition: string; origin: string; pos: string } | null, limit = 5): StItem[] {
  const wantPos = POS_NAMES[input.pos] ?? kr?.pos ?? "";
  const score = (item: StItem) =>
    Math.max(input.gloss ? similarity(input.gloss, item.definition) : 0, kr ? similarity(kr.definition, item.definition) : 0) +
    (kr?.origin && item.origin === kr.origin ? 0.2 : 0) -
    (wantPos && !item.pos.includes(wantPos) ? 0.3 : 0);
  return [...items].sort((a, b) => score(b) - score(a) || a.sup_no - b.sup_no).slice(0, limit);
}

/** 로그·오류 글에서 key= 값과 키 문자열을 가린다. */
export function redact(text: string, secrets: Array<string | undefined>): string {
  let out = text.replace(/key=[^&\s"'<>]*/gi, "key=[redacted]");
  for (const secret of secrets) if (secret && secret.length >= 8) out = out.split(secret).join("[redacted]");
  return out;
}
