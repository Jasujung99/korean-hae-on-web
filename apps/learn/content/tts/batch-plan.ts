// 연습 음원을 묶어서 만드는 계획(2026-11-18 사용자 결정).
// - 의사단어(Stage 1)·첫소리(Stage 0): 한 글에 마침표 + <long pause>, 앞뒤 버릴 '네.', 순서 섞음 → 쉼에서 자름
// - 단어: 한 요청 안에 단어마다 칸(content)을 나눔, 칸마다 평평 낭독 지시, 앞뒤 '네.' 없음 → 쉼에서 자름
// - 예문: 두 버전. 말하듯이(<long pause>로 이음, 기본) / 또박또박(문장마다 칸을 나눔, 파일 끝에 --turns)
import { FLAT_READING_STYLE } from "./pipeline.ts";
import { coreWords, sentenceAudioBase, stageZeroCells, syllableAudioBase, wordAudioBase } from "../core-table.ts";
import { PRACTICE_ITEMS, seededShuffle } from "../practice.ts";
import { voicedAudioId, type PracticeVoiceKey } from "../practice-voices.ts";
import { groupPseudowords, groupStageZero, groupWords, isOtherGroup } from "../group-tables.ts";

export type BatchKind = "pseudo" | "stage0" | "words" | "sentences" | "turns";
export type BatchMethod = "pause_group" | "per_content_group";

export const BATCH_KINDS: BatchKind[] = ["pseudo", "stage0", "words", "sentences", "turns"];
export const GROUPED_METHODS: string[] = ["pause_group", "per_content_group"];
export const GROUP_FILLER = "네.";
export const WORDS_PER_GROUP = 25;
export const SENTENCES_PER_GROUP = 10;
export const TURNS_SUFFIX = "--turns";

export type BatchItem = { id: string; text: string; unitKind: "pseudoword" | "word" | "sentence" };

export type BatchGroup = {
  groupId: string;
  kind: BatchKind;
  method: BatchMethod;
  style: string | null;
  fillers: boolean;
  /** 쉼으로 인정하는 최소 길이(ms) */
  minGapMs: number;
  items: BatchItem[];
};

export type GroupContent = { type: "text"; text: string; annotations?: Array<{ type: "speech_metadata"; style: string }> };

/** 예문 '또박또박' 버전 파일 id */
export function turnsAudioId(voicedId: string): string {
  return `${voicedId}${TURNS_SUFFIX}`;
}

/** 묶음 요청의 content 칸들 */
export function groupContents(group: BatchGroup): GroupContent[] {
  const annotate = (text: string): GroupContent =>
    group.style ? { type: "text", text, annotations: [{ type: "speech_metadata", style: group.style }] } : { type: "text", text };
  const spoken = group.items.map((item) => (item.unitKind === "sentence" ? item.text : `${item.text}.`));
  const all = group.fillers ? [GROUP_FILLER, ...spoken, GROUP_FILLER] : spoken;
  if (group.method === "per_content_group") return all.map(annotate);
  return [annotate(all.join(" <long pause> "))];
}

/** 잘라 낼 조각 수(버릴 낱말 포함) */
export function groupPartCount(group: BatchGroup): number {
  return group.items.length + (group.fillers ? 2 : 0);
}

function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let index = 0; index < list.length; index += size) out.push(list.slice(index, index + size));
  return out;
}

/** 묶음 계획에 쓰는 낱말(묶음과 상관없이 같은 모양) */
type PlanWord = { entryId: number; word: string; example: string };

function sourceFor(groupId: string): { pseudo: string[]; stage0Syllables: string[]; stage0Words: string[]; words: PlanWord[] } {
  if (isOtherGroup(groupId)) {
    const cells = groupStageZero(groupId);
    return {
      pseudo: groupPseudowords(groupId),
      stage0Syllables: [],
      stage0Words: cells.filter((cell) => cell.word).map((cell) => cell.word as string),
      words: groupWords(groupId),
    };
  }
  return {
    pseudo: PRACTICE_ITEMS.map((item) => item.stimulus),
    stage0Syllables: [...new Set(stageZeroCells().map((cell) => cell.stimulus))].filter((text) => text.length === 1),
    stage0Words: [],
    words: coreWords(),
  };
}

/**
 * 목소리 하나, 자음 묶음 하나의 묶음 계획. done(id)이 참인 음원(이미 묶음 방식으로 만든 것)은 빼고 묶는다.
 * taken에 든 id도 뺀다(같은 단어가 두 자음 묶음에 나올 때 한 번만 만들려고). 계획에 넣은 id는 taken에 더한다.
 * 의사단어·첫소리는 하나라도 없으면 묶음 전체를 다시 만든다(한 묶음 안의 소리 조건을 맞추려고).
 */
export function batchPlan(
  voiceKey: PracticeVoiceKey,
  kinds: BatchKind[],
  done: (id: string) => boolean,
  groupId = "j_ch_jj",
  taken: Set<string> = new Set(),
): BatchGroup[] {
  const groups: BatchGroup[] = [];
  const source = sourceFor(groupId);
  const tag = groupId === "j_ch_jj" ? voiceKey : `${voiceKey}-${groupId}`;
  const seed = (name: string) => `${tag}:${name}`;
  const skip = (id: string) => done(id) || taken.has(id);
  const take = (items: BatchItem[]) => {
    for (const item of items) taken.add(item.id);
    return items;
  };

  if (kinds.includes("pseudo")) {
    const items: BatchItem[] = source.pseudo.map((text) => ({ id: voicedAudioId(syllableAudioBase(text), voiceKey), text, unitKind: "pseudoword" }));
    if (items.some((item) => !skip(item.id))) {
      groups.push({ groupId: `pseudo-${tag}`, kind: "pseudo", method: "pause_group", style: FLAT_READING_STYLE, fillers: true, minGapMs: 300, items: take(seededShuffle(items, seed("pseudo"))) });
    }
  }
  if (kinds.includes("stage0") && source.stage0Syllables.length > 0) {
    const items: BatchItem[] = source.stage0Syllables.map((text) => ({ id: voicedAudioId(syllableAudioBase(text), voiceKey), text, unitKind: "pseudoword" }));
    if (items.some((item) => !skip(item.id))) {
      groups.push({ groupId: `stage0-${tag}`, kind: "stage0", method: "pause_group", style: FLAT_READING_STYLE, fillers: true, minGapMs: 300, items: take(seededShuffle(items, seed("stage0"))) });
    }
  }
  if (kinds.includes("words")) {
    const items: BatchItem[] = [];
    const add = (word: { entryId: number; word: string }) => {
      const id = voicedAudioId(wordAudioBase(word), voiceKey);
      if (skip(id) || items.some((item) => item.id === id)) return;
      items.push({ id, text: word.word, unitKind: "word" });
    };
    for (const word of source.words) add(word);
    // 첫 듣기 점검(Stage 0)의 낱말이 단계 목록에 없으면 함께 만든다.
    for (const text of source.stage0Words) add(source.words.find((word) => word.word === text) ?? { entryId: 0, word: text });
    chunk(seededShuffle(items, seed("words")), WORDS_PER_GROUP).forEach((part, index) =>
      groups.push({ groupId: `words-${tag}-${index + 1}`, kind: "words", method: "per_content_group", style: FLAT_READING_STYLE, fillers: false, minGapMs: 300, items: take(part) }),
    );
  }
  for (const kind of ["sentences", "turns"] as const) {
    if (!kinds.includes(kind)) continue;
    const items: BatchItem[] = [];
    for (const word of source.words) {
      if (!word.example) continue;
      const voiced = voicedAudioId(sentenceAudioBase(word), voiceKey);
      const id = kind === "turns" ? turnsAudioId(voiced) : voiced;
      if (skip(id) || items.some((item) => item.id === id)) continue;
      items.push({ id, text: word.example, unitKind: "sentence" });
    }
    chunk(seededShuffle(items, seed(kind)), SENTENCES_PER_GROUP).forEach((part, index) =>
      groups.push({
        groupId: `${kind}-${tag}-${index + 1}`,
        kind,
        method: kind === "turns" ? "per_content_group" : "pause_group",
        style: null,
        fillers: false,
        minGapMs: kind === "turns" ? 450 : 600,
        items: take(part),
      }),
    );
  }
  return groups;
}
