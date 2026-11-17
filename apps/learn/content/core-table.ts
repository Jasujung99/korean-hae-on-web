// ㅈ·ㅊ·ㅉ Core 60 기준 단계별 어휘 배치표(후보 95개, Stage 1은 1-A/1-B로 나뉨).
// 원천: PR #5 `08-obstruent-curriculum-and-l1-tuning.md` 3.1.2 표. 2026-11-17 사용자 결정으로 이 표를 기준으로 삼는다.
// 뜻·예문은 같은 커밋의 로드맵 JSON에 있는 것만 옮겼다. 없으면 비워 두고 새로 만들지 않는다.
import tableJson from "./reference/jcj-core-table.json" with { type: "json" };

export type CoreConsonant = "ㅈ" | "ㅊ" | "ㅉ";

export type CoreWord = {
  id: string;
  word: string;
  entryId: number;
  stage: "Stage 1" | "Stage 2" | "Stage 3" | "Stage 4" | "Stage 5";
  substage: "1-A" | "1-B" | null;
  consonant: CoreConsonant;
  note: string;
  pos: string;
  gloss: string;
  scene: string;
  example: string;
  related: string;
};

export type StageZeroCell = {
  consonant: CoreConsonant;
  stimulus: string;
  word: string | null;
  context: "medial_vcv" | "initial_high" | "initial_nonhigh";
};

type CoreTable = {
  source: { path: string; branch: string; commit: string; status: string };
  note: string;
  stage0: StageZeroCell[];
  words: CoreWord[];
};

const table = tableJson as unknown as CoreTable;

export const CORE_TABLE_SOURCE = table.source;
export const CORE_TABLE_NOTE = table.note;

export function coreWords(): CoreWord[] {
  return table.words;
}

export function stageZeroCells(): StageZeroCell[] {
  return table.stage0;
}

/** 화면에 보이는 단계 묶음: Stage 0, 1-A, 1-B, 2, 3, 4, 5 */
export type CoreStageKey = "Stage 0" | "Stage 1-A" | "Stage 1-B" | "Stage 2" | "Stage 3" | "Stage 4" | "Stage 5";

export function coreStageKey(word: CoreWord): CoreStageKey {
  if (word.substage) return `Stage ${word.substage}`;
  return word.stage === "Stage 1" ? "Stage 1-A" : word.stage;
}

export function wordsInStage(key: CoreStageKey): CoreWord[] {
  return table.words.filter((word) => coreStageKey(word) === key);
}

/** 연습 음원 기본 id(목소리 접미사 없음). 의사단어·첫 듣기 음절은 pw-, 단어는 word-, 예문은 sentence- */
export function wordAudioBase(word: Pick<CoreWord, "entryId" | "word">): string {
  return `word-${word.entryId}-${word.word}`;
}

export function sentenceAudioBase(word: Pick<CoreWord, "entryId" | "word">): string {
  return `sentence-${word.entryId}-${word.word}`;
}

export function syllableAudioBase(text: string): string {
  return `pw-${text}`;
}
