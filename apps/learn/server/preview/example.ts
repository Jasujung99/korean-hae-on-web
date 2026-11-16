// 교사 화면이 기록으로 채워졌을 때의 모습을 보이기 위한 예시 학습자.
// 실제 기록이 아니며 화면에 '예시'로 표시한다. 수치는 인계 시안(prototypes)의 예시와 같다.
import type { LearnerDetail, LearnerSummary, Matrix } from "./contract.ts";

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
  note: "ㅉ → ㅈ 선택 4회 · 예시",
};

export function exampleDetail(): LearnerDetail {
  const medial = matrix([
    [15, 1, 0],
    [2, 14, 0],
    [4, 1, 11],
  ]);
  return {
    learner: EXAMPLE_LEARNER,
    period: "11/9–11/15 · 예시 기록",
    stats: { activeMs: 33 * 60_000, days: 4, lastActive: null },
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
      interruptions: ["11/14 21:14 6/9에서 멈춤 → 11/15 08:02 다음 문항부터 이어 함"],
    },
    sessions: 5,
    isExample: true,
  };
}
