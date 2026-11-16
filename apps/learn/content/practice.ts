// ㅈ·ㅊ·ㅉ 미리보기 연습 문항.
// Stage 1(모음 사이) 의사단어 9개로 '듣고 자음 고르기'를 만들고, 같은 음원으로 두 소리 비교(ABX)를 만든다.
// 문항과 음원은 초안이며 Core 60 승인이나 청취 검수를 뜻하지 않는다.
import { selectPracticeSet, SELECTION_POLICY_VERSION } from "./selection.ts";
import { stageWords } from "./course.ts";

export const PRACTICE_GROUP_ID = "j_ch_jj" as const;
export const CONSONANTS = ["ㅈ", "ㅊ", "ㅉ"] as const;
export type Consonant = (typeof CONSONANTS)[number];

export type PracticeChoice = { key: Consonant; text: string };

export type PracticeItem = {
  id: string;
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
      position: "medial" as const,
      positionLabel: "모음 사이",
      previousVowel: frame.vowel,
      followingVowel: "ㅏ",
    };
  }),
);

/** 보기 글자(예: 이짜)의 의사단어 음원 id */
export function choiceAudioId(text: string): string {
  return `pw-${text}`;
}

export function practiceItem(id: string): PracticeItem | undefined {
  return PRACTICE_ITEMS.find((item) => item.id === id);
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
export function planPracticeSession(seed: string): { policyVersion: string; slots: PlannedSlot[] } {
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
};

/** 풀던 문항의 소리와, 고른 소리(틀렸다면) 또는 헷갈리기 쉬운 소리를 짝지어 A·B·X를 만든다. */
export function makeAbxTrial(item: PracticeItem, partner: Consonant | null, seed: string): AbxDefinition {
  const other = partner && partner !== item.target ? partner : DEFAULT_PARTNER[item.target];
  const [first, second] = seededShuffle([item.target, other], `${seed}:order`) as [Consonant, Consonant];
  const x: "A" | "B" = seededShuffle(["A", "B"] as const, `${seed}:x`)[0] ?? "A";
  const lead = item.stimulus.slice(0, 1);
  const audioOf = (key: Consonant) => `pw-${lead}${SECOND_SYLLABLE[key]}`;
  return {
    trialId: `abx-${seed}`,
    itemId: item.id,
    lead,
    a: first,
    b: second,
    x,
    audio: { a: audioOf(first), b: audioOf(second), x: audioOf(x === "A" ? first : second) },
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
  sourceEntryId: number;
};

const WORD_PICKS = ["모자", "바지", "기차", "아침", "가짜", "이쪽"] as const;

/** 마무리·사전·예문 화면의 Stage 1 생활 어휘 6개. 뜻·예문은 PR #5의 초안이며 검수 전이다. */
export function practiceWords(): WordCard[] {
  const rows = stageWords(PRACTICE_GROUP_ID, "Stage 1");
  return WORD_PICKS.flatMap((word) => {
    const row = rows.find((candidate) => candidate.word === word);
    if (!row || row.source_entry_id === undefined || !isConsonant(row.surface_phoneme)) return [];
    return [
      {
        id: `w-${row.source_entry_id}`,
        word,
        pos: row.pos ?? "",
        consonant: row.surface_phoneme,
        substage: row.substage ?? "",
        positionLabel: "모음 사이",
        gloss: row.gloss ?? "",
        scene: row.scene ?? "",
        example: row.example ?? "",
        related: row.related ?? "",
        wordAudioId: `word-Stage1-${row.source_entry_id}-${word}`,
        exampleAudioId: `sentence-Stage1-${row.source_entry_id}-${word}`,
        sourceEntryId: row.source_entry_id,
      },
    ];
  });
}
