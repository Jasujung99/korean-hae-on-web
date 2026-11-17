// 교사 화면이 기록으로 채워졌을 때의 모습을 보이기 위한 예시 학습자.
// 실제 기록이 아니며 화면에 '예시'로 표시한다. 수치는 인계 시안(prototypes)의 예시와 같다.
import type { LearnerDetail, LearnerSummary, Matrix } from "./contract.ts";
import { calendarKeys } from "./observe.ts";

const CONSONANTS = ["ㅈ", "ㅊ", "ㅉ"];

function matrix(rows: number[][]): Matrix {
  const total = rows.flat().reduce((sum, value) => sum + value, 0);
  const correct = rows.reduce((sum, row, index) => sum + (row[index] ?? 0), 0);
  return { consonants: CONSONANTS, rows, correct, total, excluded: 1 };
}

export const EXAMPLE_LEARNER: LearnerSummary = {
  id: "example-b",
  name: "예시 학습자 B",
  languages: "우즈베크어 / 러시아어",
  kind: "example",
  lastActive: null,
  days: 4,
  note: "ㅉ을 ㅈ으로 4번 골랐어요",
  activeMs: 33 * 60_000,
  medial: { correct: 40, total: 48 },
  initial: { correct: 18, total: 24 },
  audioErrors: 1,
};

// 시안의 4주 달력 예시(0 없음, 1 1~5분, 2 6~10분, 3 10분 넘음).
const LEVELS = [0, 3, 2, 0, 2, 1, 0, 2, 0, 3, 2, 0, 0, 1, 2, 2, 0, 3, 2, 0, 0, 0, 0, 1, 0, 2, 2, 3];
const LEVEL_MS = [0, 4 * 60_000, 8 * 60_000, 13 * 60_000];

export function exampleDetail(): LearnerDetail {
  const medial = matrix([
    [15, 1, 0],
    [2, 14, 0],
    [4, 1, 11],
  ]);
  return {
    learner: EXAMPLE_LEARNER,
    period: "11/9–11/15 · 예시 기록",
    stats: { activeMs: 33 * 60_000, openMs: 51 * 60_000, days: 4, lastActive: null, started: 5, finished: 4 },
    insight:
      "모음 사이에서는 ㅉ을 ㅈ으로, 첫머리에서는 ㅈ을 ㅊ으로 고른 일이 가장 잦았어요. 이 수만으로 까닭을 판단하지는 않아요.",
    calendar: calendarKeys(Date.now()).map((day, index) => ({
      ...day,
      activeMs: day.future ? 0 : (LEVEL_MS[LEVELS[index] ?? 0] ?? 0),
    })),
    trend: [
      { label: "첫째 주", correct: 20, total: 32 },
      { label: "둘째 주", correct: 30, total: 40 },
      { label: "셋째 주", correct: 34, total: 44 },
      { label: "넷째 주", correct: 40, total: 48 },
    ],
    hardItems: [
      { label: "첫머리 ㅈ · 자다", wrong: 3, total: 4, chosen: "ㅊ" },
      { label: "모음 사이 ㅉ · 아짜", wrong: 3, total: 5, chosen: "ㅈ" },
      { label: "첫머리 ㅈ · 지다", wrong: 2, total: 3, chosen: "ㅊ" },
    ],
    tiers: [
      { band: "tier12", correct: 30, total: 34 },
      { band: "tier34", correct: 18, total: 28 },
      { band: "unpaired", correct: 10, total: 10 },
    ],
    stops: [
      "듣고 고르기 6/9에서 멈췄어요. 이튿날 아침에 다음 문항부터 이어 했어요.",
      "연습을 열고 1분 만에 닫았어요.",
      "나흘 동안 학습이 없었어요.",
    ],
    identify: {
      medial,
      initial: matrix([
        [5, 3, 0],
        [1, 7, 0],
        [2, 0, 6],
      ]),
      byVowel: { "i-u": matrix([[7, 1, 0], [1, 7, 0], [2, 0, 5]]), "a-eo-o": matrix([[8, 0, 0], [1, 7, 0], [2, 1, 6]]) },
    },
    abx: { trials: 6, correct: 4, pairs: [{ pair: "ㅈ–ㅉ", trials: 4, correct: 2 }, { pair: "ㅊ–ㅉ", trials: 2, correct: 2 }] },
    replays: [
      { consonant: "ㅈ", average: 0.6, max: 2, items: 16 },
      { consonant: "ㅊ", average: 0.8, max: 3, items: 16 },
      { consonant: "ㅉ", average: 1.8, max: 4, items: 16 },
    ],
    recent: {
      label: "11/15 · 모음 사이 · 듣고 고르기 9/9",
      activeMs: 6 * 60_000 + 20_000,
      openMs: 9 * 60_000 + 10_000,
      hiddenMs: 2 * 60_000 + 50_000,
      audioMs: 72_000,
      idleMs: 0,
      dwell: [
        { label: "7번 · 오짜", dwellMs: 48_000, replays: 3, waitMs: 8_000, hiddenMs: 0, outcome: "제시 ㅉ → 첫 선택 ㅈ" },
      ],
      interruptions: [],
    },
    sessions: 5,
    isExample: true,
  };
}
