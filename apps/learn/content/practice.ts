// ㅈ·ㅊ·ㅉ 미리보기 연습 문항.
// Stage 1(모음 사이) '듣고 자음 고르기'는 두 가지로 낼 수 있다.
// - 낱말 대립쌍(기본): Core 배치표의 Stage 1 낱말을 Step 1 → 2 → 3 순으로 낸다(PR #5 d59e569).
// - 의사단어: 아자·아차·아짜 등 9개.
// 보기는 어느 쪽이든 자음 글자(ㅈ·ㅊ·ㅉ)다.
// 문항과 음원은 초안이며 Core 60 승인이나 청취 검수를 뜻하지 않는다.
import { selectPracticeSet, SELECTION_POLICY_VERSION } from "./selection.ts";
import {
  snapshotFromReferenceJson,
  snapshotSentenceAudioBase,
  snapshotWordAudioBase,
  snapshotWordCardId,
  snapshotWords,
  wordIdPrefix,
  type ContentSnapshot,
  type SnapshotWord,
} from "./snapshot.ts";
import {
  contrastOf,
  fortisFirst,
  inStageStep,
  orderInStage,
  resolvePartner,
  type Contrast,
  type ContrastTier,
  type InStageStep,
} from "./contrast.ts";

export const PRACTICE_GROUP_ID = "j_ch_jj" as const;
export const CONSONANTS = ["ㅈ", "ㅊ", "ㅉ"] as const;
export type Consonant = (typeof CONSONANTS)[number];

export type PracticeChoice = { key: Consonant; text: string };

export type ItemKind = "word" | "pseudo";

export type PracticeItem = {
  id: string;
  kind: ItemKind;
  groupId: typeof PRACTICE_GROUP_ID;
  task: "consonant_identification";
  stage: "Stage 1";
  stimulus: string;
  target: Consonant;
  choices: PracticeChoice[];
  audioId: string;
  position: "medial";
  positionLabel: string;
  previousVowel: string;
  followingVowel: string;
  /** 의사단어는 대립쌍 카탈로그(P-xxx) 밖이다. 낱말 문항이 생기면 묶음 번호와 Tier를 채운다. */
  pairGroupId: string | null;
  contrastTier: ContrastTier | null;
  /** Stage 안 출제 순서. 의사단어는 null */
  step: InStageStep | null;
  /** 목표 자음이 든 음절(1부터)과 그 음절의 모음. 화면은 이것만 보여 준다(다른 음절·받침은 답을 드러낼 수 있다). */
  syllableIndex: number;
  vowel: string;
  /** 목소리별 파일이 없을 때 쓰는 예전 파일 id */
  legacyAudioId: string;
  entryId: number | null;
};

const FRAMES = [
  { lead: "아", vowel: "ㅏ" },
  { lead: "이", vowel: "ㅣ" },
  { lead: "오", vowel: "ㅗ" },
] as const;

const SECOND_SYLLABLE: Record<Consonant, string> = { ㅈ: "자", ㅊ: "차", ㅉ: "짜" };

export const PRACTICE_ITEMS: PracticeItem[] = FRAMES.flatMap((frame) =>
  CONSONANTS.map((target) => {
    const stimulus = `${frame.lead}${SECOND_SYLLABLE[target]}`;
    return {
      id: `jcj-s1-${stimulus}`,
      groupId: PRACTICE_GROUP_ID,
      task: "consonant_identification" as const,
      stage: "Stage 1" as const,
      stimulus,
      target,
      choices: CONSONANTS.map((key) => ({ key, text: `${frame.lead}${SECOND_SYLLABLE[key]}` })),
      audioId: `pw-${stimulus}`,
      legacyAudioId: `pw-${stimulus}`,
      kind: "pseudo" as const,
      step: null,
      syllableIndex: 2,
      vowel: "ㅏ",
      entryId: null,
      position: "medial" as const,
      positionLabel: "모음 사이",
      previousVowel: frame.vowel,
      followingVowel: "ㅏ",
      pairGroupId: null,
      contrastTier: null,
    };
  }),
);

/** 보기 글자(예: 이짜)의 의사단어 음원 id */
export function choiceAudioId(text: string): string {
  return `pw-${text}`;
}

export function practiceItem(id: string, snapshot?: ContentSnapshot): PracticeItem | undefined {
  const words = snapshot ? wordItemsFrom(snapshot) : WORD_ITEMS;
  return PRACTICE_ITEMS.find((item) => item.id === id) ?? words.find((item) => item.id === id);
}

export function isConsonant(value: unknown): value is Consonant {
  return typeof value === "string" && (CONSONANTS as readonly string[]).includes(value);
}

/** 문자열 씨앗으로 같은 순서를 다시 만들 수 있는 섞기 */
export function seededShuffle<T>(items: readonly T[], seed: string): T[] {
  let state = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    state ^= seed.charCodeAt(index);
    state = Math.imul(state, 16777619) >>> 0;
  }
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
  const out = [...items];
  for (let index = out.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(next() * (index + 1));
    [out[index], out[swap]] = [out[swap] as T, out[index] as T];
  }
  return out;
}

export type PlannedSlot = { itemId: string; kind: string; reason: string };

/**
 * 균형 출제(balanced-v1): 자음마다 같은 수가 나오게 고른 뒤, 순서로 정답을 짐작하지 못하게 섞는다.
 * 취약 후보·간격 복습 표본이 없으면 균형 문항으로 채운다(slot reason에 남긴다).
 */
export function planPracticeSession(
  seed: string,
  kind: ItemKind = "pseudo",
  snapshot?: ContentSnapshot,
): { policyVersion: string; slots: PlannedSlot[] } {
  if (kind === "word") return planWordSession(seed, snapshot);
  const selection = selectPracticeSet(PRACTICE_ITEMS.map((item) => ({ id: item.id, consonant: item.target })));
  const slots = selection.slots.map((slot) => ({ itemId: slot.itemId, kind: slot.kind, reason: slot.reason }));
  return { policyVersion: selection.policyVersion || SELECTION_POLICY_VERSION, slots: seededShuffle(slots, seed) };
}

export function judge(item: PracticeItem, choice: Consonant): { correct: boolean; answer: PracticeChoice } {
  const answer = item.choices.find((row) => row.key === item.target);
  if (!answer) throw new Error(`item ${item.id} has no answer choice`);
  return { correct: choice === item.target, answer };
}

const DEFAULT_PARTNER: Record<Consonant, Consonant> = { ㅈ: "ㅉ", ㅊ: "ㅉ", ㅉ: "ㅈ" };

export type AbxDefinition = {
  trialId: string;
  itemId: string;
  lead: string;
  a: Consonant;
  b: Consonant;
  x: "A" | "B";
  audio: { a: string; b: string; x: string };
  legacy: { a: string; b: string; x: string };
  texts: { a: string; b: string };
  /** word: 같은 대립쌍 묶음의 낱말끼리 / pseudo: 상대 낱말이 없어 의사단어로 대신함 */
  kind: ItemKind;
  tier: ContrastTier | null;
  pairGroupId: string | null;
};

/**
 * 풀던 문항의 소리와, 고른 소리(틀렸다면) 또는 헷갈리기 쉬운 소리를 짝지어 A·B·X를 만든다.
 * 낱말 문항은 같은 대립쌍 묶음의 상대 낱말을 Tier 1 → 4 순으로 찾고, 없으면 같은 앞 모음의 의사단어로 대신한다.
 */
export function makeAbxTrial(
  item: PracticeItem,
  partner: Consonant | null,
  seed: string,
  snapshot?: ContentSnapshot,
): AbxDefinition {
  const other = partner && partner !== item.target ? partner : DEFAULT_PARTNER[item.target];
  const pair = comparePair(item, other, snapshot);
  // 평음–경음(ㅈ–ㅉ)은 경음을 기준음 A로 먼저 들려준다. 그 밖의 짝은 순서를 섞는다.
  const [first, second] = (fortisFirst(PRACTICE_GROUP_ID, item.target, other) ??
    seededShuffle([item.target, other], `${seed}:order`)) as [Consonant, Consonant];
  const x: "A" | "B" = seededShuffle(["A", "B"] as const, `${seed}:x`)[0] ?? "A";
  const side = (key: Consonant) => (key === item.target ? pair.answer : pair.chosen);
  const sideA = side(first);
  const sideB = side(second);
  const sideX = x === "A" ? sideA : sideB;
  return {
    trialId: `abx-${seed}`,
    itemId: item.id,
    lead: sideA.text.slice(0, 1),
    a: first,
    b: second,
    x,
    audio: { a: sideA.audioId, b: sideB.audioId, x: sideX.audioId },
    legacy: { a: sideA.legacyAudioId, b: sideB.legacyAudioId, x: sideX.legacyAudioId },
    texts: { a: sideA.text, b: sideB.text },
    kind: pair.kind,
    tier: pair.tier,
    pairGroupId: pair.pairGroupId,
  };
}

export function abxSyllable(lead: string, key: Consonant): string {
  return `${lead}${SECOND_SYLLABLE[key]}`;
}

export type WordCard = {
  id: string;
  word: string;
  pos: string;
  consonant: Consonant;
  substage: string;
  positionLabel: string;
  gloss: string;
  scene: string;
  example: string;
  related: string;
  wordAudioId: string;
  exampleAudioId: string;
  /** 목소리별 음원이 없을 때 쓰는 예전(Iapetus) 파일 id */
  legacyWordAudioId: string;
  legacyExampleAudioId: string;
  sourceEntryId: number | null;
  /** 배치표 낱말 id(예: jcj-1871). 사전 풀이 자료(content/dict/entries.json)의 키. 화면에서 새로 쓴 단어는 DB id */
  tableId: string;
  /** Stage 안 출제 순서: 1 기준점 잡기, 2 음절 틀 넓히기, 3 실전 어휘 일반화 */
  step: InStageStep;
  contrast: Contrast | null;
  /** 같은 단어가 다른 자음 묶음에도 있을 때 그 묶음의 예문(묶음마다 예문 음원이 따로 있다) */
  moreExamples: MoreExample[];
};

export type MoreExample = { groupId: SnapshotWord["groupId"]; text: string; audioId: string };

/** 다른 묶음에 있는 같은 단어(사전 번호·글자가 같음)의 예문. 이 카드의 예문과 글자가 같은 것은 뺀다. */
export function moreExamplesFor(word: SnapshotWord, snapshot: ContentSnapshot): MoreExample[] {
  const key = `${wordIdPrefix(word)}|${word.word}`;
  const seen = new Set([word.example.trim()]);
  const out: MoreExample[] = [];
  for (const other of snapshot.items) {
    if (other.groupId === word.groupId || !other.example.trim()) continue;
    if (`${wordIdPrefix(other)}|${other.word}` !== key || seen.has(other.example.trim())) continue;
    seen.add(other.example.trim());
    out.push({ groupId: other.groupId, text: other.example, audioId: snapshotSentenceAudioBase(other) });
  }
  return out;
}

/**
 * 사전·예문 화면의 Stage 1 생활 어휘(Core 60 배치표의 1-A 11개 + 1-B 11개).
 * 뜻·예문은 PR #5 초안이며 검수 전이다. 예문이 없는 단어는 비워 둔다.
 * 음원 id는 목소리 접미사가 없는 기본 id다. 서버가 고른 목소리 파일로 바꾼다.
 */
function toCard(word: SnapshotWord, snapshot: ContentSnapshot): WordCard {
  const consonant = (isConsonant(word.consonant) ? word.consonant : "ㅈ") as Consonant;
  const contrast = contrastOf(PRACTICE_GROUP_ID, word.word, consonant, word.stage);
  return {
    id: snapshotWordCardId(word),
    word: word.word,
    pos: word.pos,
    consonant,
    substage: word.substage ?? "",
    positionLabel: word.stage === "Stage 1" ? "모음 사이" : word.stage,
    gloss: word.gloss,
    scene: word.scene,
    example: word.example,
    related: word.related,
    wordAudioId: snapshotWordAudioBase(word),
    exampleAudioId: word.example ? snapshotSentenceAudioBase(word) : "",
    legacyWordAudioId: word.entryId !== null ? `word-Stage1-${word.entryId}-${word.word}` : "",
    legacyExampleAudioId: word.example && word.entryId !== null ? `sentence-Stage1-${word.entryId}-${word.word}` : "",
    sourceEntryId: word.entryId,
    tableId: word.legacyId ?? word.id,
    step: inStageStep(contrast?.tier ?? null),
    contrast,
    moreExamples: moreExamplesFor(word, snapshot),
  };
}

/** 한 Stage의 낱말을 Step 1 → 2 → 3 순으로 세운다(1-A, 1-B는 각각 따로). */
export function stageWordPlan(stage: SnapshotWord["stage"], snapshot: ContentSnapshot = snapshotFromReferenceJson()): WordCard[] {
  const cards = snapshotWords(snapshot, PRACTICE_GROUP_ID)
    .filter((word) => word.stage === stage)
    .map((word) => toCard(word, snapshot));
  const blocks = [...new Set(cards.map((card) => card.substage))];
  return blocks.flatMap((block) =>
    orderInStage(
      cards.filter((card) => card.substage === block),
      (card) => card.contrast?.tier ?? null,
    ),
  );
}

export function practiceWords(snapshot?: ContentSnapshot): WordCard[] {
  return stageWordPlan("Stage 1", snapshot);
}

// ---- 낱말 대립쌍 문항 ----

const INITIALS = ["ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"];
const MEDIALS = [
  "ㅏ", "ㅐ", "ㅑ", "ㅒ", "ㅓ", "ㅔ", "ㅕ", "ㅖ", "ㅗ", "ㅘ", "ㅙ", "ㅚ", "ㅛ", "ㅜ", "ㅝ", "ㅞ", "ㅟ", "ㅠ", "ㅡ", "ㅢ", "ㅣ",
];

/** 한글 음절을 첫소리·모음·받침 유무로 나눈다. */
export function splitSyllable(ch: string): { initial: string; vowel: string; hasCoda: boolean } | null {
  const code = ch.charCodeAt(0) - 0xac00;
  if (!(code >= 0 && code <= 11171)) return null;
  return {
    initial: INITIALS[Math.floor(code / 588)] ?? "",
    vowel: MEDIALS[Math.floor((code % 588) / 28)] ?? "",
    hasCoda: code % 28 !== 0,
  };
}

/** 낱말 하나에 ㅈ·ㅊ·ㅉ이 한 번만, 받침 없는 음절 뒤(모음 사이)에 올 때만 문항으로 쓴다(예: 김치찌개는 뺀다). */
function wordItem(card: WordCard): PracticeItem | null {
  const syllables = [...card.word];
  const hits = syllables
    .map((ch, index) => ({ index, parts: splitSyllable(ch) }))
    .filter((row) => row.parts !== null && isConsonant(row.parts.initial));
  const hit = hits[0];
  if (hits.length !== 1 || !hit?.parts || hit.parts.initial !== card.consonant || hit.index === 0) return null;
  const before = splitSyllable(syllables[hit.index - 1] ?? "");
  if (!before || before.hasCoda) return null;
  return {
    id: card.sourceEntryId !== null ? `jcj-w-${card.sourceEntryId}` : `jcj-${card.id}`,
    kind: "word",
    groupId: PRACTICE_GROUP_ID,
    task: "consonant_identification",
    stage: "Stage 1",
    stimulus: card.word,
    target: card.consonant,
    choices: CONSONANTS.map((key) => ({ key, text: "" })),
    audioId: card.wordAudioId,
    legacyAudioId: card.legacyWordAudioId,
    position: "medial",
    positionLabel: "모음 사이",
    previousVowel: before.vowel,
    followingVowel: hit.parts.vowel,
    pairGroupId: card.contrast?.pairGroupId ?? null,
    contrastTier: card.contrast?.tier ?? null,
    step: card.step,
    syllableIndex: hit.index + 1,
    vowel: hit.parts.vowel,
    entryId: card.sourceEntryId,
  };
}

export function wordItemsFrom(snapshot?: ContentSnapshot): PracticeItem[] {
  return practiceWords(snapshot)
    .map(wordItem)
    .filter((item): item is PracticeItem => item !== null);
}

export const WORD_ITEMS: PracticeItem[] = wordItemsFrom();

export const WORD_POLICY_VERSION = "contrast-step-v1";

/** Step마다 낼 문항 수(합 9). Step 1은 Stage 진입 첫 3~4문항이다. */
const STEP_QUOTA: Record<InStageStep, number> = { 1: 3, 2: 3, 3: 3 };
/** 한 Step의 답이 모두 같은 자음이면 순서로 답을 짐작할 수 있어 피한다. */
const SAME_ANSWER_PENALTY = 3;
const STEP_REASON: Record<InStageStep, string> = {
  1: "step1_anchor_tier1_2",
  2: "step2_frame_tier3",
  3: "step3_general_tier4_or_context",
};

function combinations<T>(items: readonly T[], size: number): T[][] {
  if (size <= 0) return [[]];
  if (items.length < size) return [];
  const [head, ...rest] = items as [T, ...T[]];
  return [...combinations(rest, size - 1).map((tail) => [head, ...tail]), ...combinations(rest, size)];
}

/**
 * 낱말 대립쌍 출제(contrast-step-v1).
 * Step 1(Tier 1·2) → Step 2(Tier 3) → Step 3(Tier 4·맥락 확장) 순서를 지키고, 자음마다 같은 수가 되게 고른다.
 * 같은 Step 안에서만 순서를 섞는다.
 */
export function planWordSession(seed: string, snapshot?: ContentSnapshot): { policyVersion: string; slots: PlannedSlot[] } {
  const items = snapshot ? wordItemsFrom(snapshot) : WORD_ITEMS;
  const steps: InStageStep[] = [1, 2, 3];
  const choices = steps.map((step) => {
    const pool = items.filter((item) => item.step === step);
    return combinations(pool, Math.min(STEP_QUOTA[step], pool.length));
  });
  const total = steps.reduce((sum, step, index) => sum + Math.min(STEP_QUOTA[step], choices[index]?.[0]?.length ?? 0), 0);
  const per = total / CONSONANTS.length;
  let best: PracticeItem[][][] = [];
  let bestScore = Number.POSITIVE_INFINITY;
  for (const one of choices[0] ?? [[]]) {
    for (const two of choices[1] ?? [[]]) {
      for (const three of choices[2] ?? [[]]) {
        const all = [...one, ...two, ...three];
        const same = [one, two, three].filter((step) => step.length > 1 && new Set(step.map((item) => item.target)).size === 1).length;
        const score =
          CONSONANTS.reduce((sum, key) => sum + Math.abs(all.filter((item) => item.target === key).length - per), 0) +
          same * SAME_ANSWER_PENALTY;
        if (score < bestScore) {
          bestScore = score;
          best = [[one, two, three]];
        } else if (score === bestScore) best.push([one, two, three]);
      }
    }
  }
  const picked = seededShuffle(best, `${seed}:pick`)[0] ?? [[], [], []];
  const slots = steps.flatMap((step, index) =>
    seededShuffle(picked[index] ?? [], `${seed}:step${step}`).map((item) => ({
      itemId: item.id,
      kind: `step${step}`,
      reason: STEP_REASON[step],
    })),
  );
  return { policyVersion: WORD_POLICY_VERSION, slots };
}

export type CompareSide = { key: Consonant; text: string; audioId: string; legacyAudioId: string };

export type ComparePair = {
  /** word: 같은 묶음의 낱말끼리 / pseudo: 의사단어끼리(낱말 상대가 없을 때) */
  kind: ItemKind;
  tier: ContrastTier | null;
  pairGroupId: string | null;
  answer: CompareSide;
  chosen: CompareSide;
};

const LEAD_BY_VOWEL: Record<string, string> = { ㅏ: "아", ㅣ: "이", ㅗ: "오" };

function pseudoSide(lead: string, key: Consonant): CompareSide {
  const text = `${lead}${SECOND_SYLLABLE[key]}`;
  return { key, text, audioId: choiceAudioId(text), legacyAudioId: choiceAudioId(text) };
}

/**
 * 오답 직후 [정답 소리] vs [내 선택]과 ABX에 쓸 두 소리.
 * 낱말 문항: 같은 대립쌍 묶음의 상대 낱말(Tier 1 → 4)이 배치표에 있으면 그 낱말, 없으면 같은 앞 모음의 의사단어 두 개.
 */
export function comparePair(
  item: PracticeItem,
  other: Consonant,
  snapshot: ContentSnapshot = snapshotFromReferenceJson(),
): ComparePair {
  if (item.kind === "pseudo") {
    const lead = item.stimulus.slice(0, 1);
    return { kind: "pseudo", tier: null, pairGroupId: null, answer: pseudoSide(lead, item.target), chosen: pseudoSide(lead, other) };
  }
  const self: CompareSide = { key: item.target, text: item.stimulus, audioId: item.audioId, legacyAudioId: item.legacyAudioId };
  if (other === item.target) {
    return { kind: "word", tier: item.contrastTier, pairGroupId: item.pairGroupId, answer: self, chosen: self };
  }
  const partner = resolvePartner({ groupId: PRACTICE_GROUP_ID, word: item.stimulus, target: item.target, other, stage: item.stage });
  const card = partner
    ? snapshotWords(snapshot, PRACTICE_GROUP_ID).find((word) => word.word === partner.word && word.consonant === other)
    : undefined;
  if (partner && card) {
    return {
      kind: "word",
      tier: partner.tier,
      pairGroupId: partner.pairGroupId,
      answer: self,
      chosen: {
        key: other,
        text: card.word,
        audioId: snapshotWordAudioBase(card),
        legacyAudioId: card.entryId !== null ? `word-Stage1-${card.entryId}-${card.word}` : "",
      },
    };
  }
  const lead = LEAD_BY_VOWEL[item.previousVowel] ?? "아";
  return { kind: "pseudo", tier: null, pairGroupId: null, answer: pseudoSide(lead, item.target), chosen: pseudoSide(lead, other) };
}
