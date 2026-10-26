/**
 * 나말온 자모 조각.
 * 01 첫 화면 시안의 ‘나·말·온’에서 그대로 가져온 종이 조각 열한 장과,
 * 그 조각만으로 다시 짠 글자들이다. 조각 모양은 고치지 않고 크기와 자리만 바꾼다.
 */

/** 조각이 글자 안에서 맡는 자리. 색이 이 자리를 따른다. */
export type Tone = "initial" | "vowel" | "final";

export interface Piece {
  width: number;
  height: number;
  tone: Tone;
  d: string;
}

export const PIECES = {
  /** ㄴ — ‘나’의 첫소리 */
  nieun: {
    width: 96,
    height: 94,
    tone: "initial",
    d: "M5.55 8.16 L23.10 4.29 Q25.56 3.75 25.92 6.25 L33.75 60.26 Q33.91 61.31 34.93 61.03 L88.07 46.47 Q91.38 45.56 91.62 48.98 L92.53 61.77 Q92.69 63.94 90.63 64.63 L28.72 85.49 Q14.78 90.19 12.76 75.62 L3.74 10.77 Q3.44 8.63 5.55 8.16 Z",
  },
  /** ㅣ 긴 막대 — ‘나’의 모음 */
  iLong: {
    width: 39,
    height: 170,
    tone: "vowel",
    d: "M6.10 8.45 L25.94 4.42 Q28.62 3.88 28.74 6.62 L35.17 154.44 Q35.28 156.97 32.97 158.01 L18.07 164.77 Q14.37 166.44 14.10 162.39 L3.85 11.39 Q3.69 8.94 6.10 8.45 Z",
  },
  /** 아래아 넓은 세모 — ‘나’의 ㅏ */
  dotWide: {
    width: 54,
    height: 25,
    tone: "vowel",
    d: "M5.60 14.27 L46.63 4.54 Q50.38 3.66 49.45 7.39 L46.40 19.66 Q45.88 21.75 43.74 21.40 L5.63 15.19 Q3.31 14.81 5.60 14.27 Z",
  },
  /** ㅁ — ‘말’의 첫소리 */
  mieum: {
    width: 78,
    height: 76,
    tone: "initial",
    d: "M6.09 9.53 L64.49 4.01 Q71.25 3.37 71.66 10.15 L74.66 60.23 Q74.81 62.81 72.26 63.18 L14.62 71.57 Q9.75 72.28 9.28 67.38 L3.97 12.09 Q3.75 9.75 6.09 9.53 Z M27.03 23.64 L49.82 20.72 Q51.28 20.53 51.40 21.99 L53.61 48.17 Q53.72 49.50 52.40 49.68 L29.78 52.86 Q28.31 53.06 28.18 51.59 L25.81 25.16 Q25.69 23.81 27.03 23.64 Z",
  },
  /** ㅣ 중간 막대 — ‘말’의 모음 */
  iMid: {
    width: 28,
    height: 122,
    tone: "vowel",
    d: "M5.39 3.66 L21.69 6.29 Q24.13 6.69 24.05 9.15 L21.20 109.44 Q21.12 112.06 18.64 112.89 L6.21 117.03 Q3.13 118.06 3.13 114.81 L3.22 5.51 Q3.22 3.31 5.39 3.66 Z",
  },
  /** 아래아 작은 세모 — ‘말’의 ㅏ */
  dotSmall: {
    width: 41,
    height: 24,
    tone: "vowel",
    d: "M5.29 11.51 L34.65 4.54 Q37.44 3.87 36.92 6.70 L34.89 17.86 Q34.44 20.38 31.97 19.70 L5.27 12.42 Q3.50 11.94 5.29 11.51 Z",
  },
  /** ㄹ — ‘말’의 받침 */
  rieul: {
    width: 102,
    height: 84,
    tone: "final",
    d: "M5.77 11.01 L77.87 3.95 Q81.56 3.59 81.47 7.30 L80.67 40.73 Q80.62 42.69 78.68 42.99 L30.64 50.36 Q29.34 50.56 29.45 51.87 L30.26 61.68 Q30.37 63.12 31.82 62.96 L95.64 55.55 Q98.25 55.25 98.25 57.88 L98.25 69.22 Q98.25 71.75 95.73 72.02 L18.51 80.17 Q13.03 80.75 12.34 75.29 L8.02 41.35 Q7.78 39.50 9.63 39.25 L61.42 32.30 Q62.25 32.19 62.24 31.36 L62.08 20.69 Q62.06 19.63 61.01 19.77 L12.15 26.54 Q9.94 26.84 9.14 24.76 L4.60 12.91 Q3.94 11.19 5.77 11.01 Z",
  },
  /** ㅇ — ‘온’의 첫소리 */
  ieung: {
    width: 81,
    height: 76,
    tone: "initial",
    d: "M77.25 30.80 A37.45 34.22 -10.6 1 0 3.62 44.58 A37.45 34.22 -10.6 1 0 77.25 30.80 Z M55.82 29.98 A17.20 16.31 -27.3 1 0 25.24 45.77 A17.20 16.31 -27.3 1 0 55.82 29.98 Z",
  },
  /** ㅡ — ‘온’의 모음 */
  eu: {
    width: 149,
    height: 38,
    tone: "vowel",
    d: "M5.45 17.03 L140.53 3.60 Q145.66 3.09 145.68 8.24 L145.74 19.79 Q145.75 21.94 143.61 22.13 L10.85 34.16 Q4.00 34.78 3.71 27.90 L3.34 19.46 Q3.25 17.25 5.45 17.03 Z",
  },
  /** 아래아 짧은 획 — ‘온’의 ㅗ */
  dotShort: {
    width: 28,
    height: 35,
    tone: "vowel",
    d: "M5.48 5.69 L21.46 3.56 Q24.06 3.22 24.12 5.84 L24.52 25.83 Q24.53 26.56 23.82 26.75 L8.03 30.97 Q7.00 31.25 6.86 30.19 L3.87 7.80 Q3.62 5.94 5.48 5.69 Z",
  },
  /** ㄴ 받침 — ‘온’의 받침 */
  nieunFinal: {
    width: 111,
    height: 71,
    tone: "final",
    d: "M5.77 4.31 L23.08 3.75 Q26.84 3.63 26.95 7.39 L28.02 44.13 Q28.06 45.62 29.55 45.49 L100.74 39.25 Q102.88 39.06 103.25 41.17 L106.62 59.89 Q107.19 63.06 103.97 63.20 L13.23 67.09 Q6.69 67.38 6.40 60.83 L3.96 6.27 Q3.88 4.37 5.77 4.31 Z",
  },
} satisfies Record<string, Piece>;

export type PieceName = keyof typeof PIECES;

export interface Placement {
  piece: PieceName;
  x: number;
  y: number;
  /** 한 값이면 가로세로를 같이, 두 값이면 [가로, 세로]로 늘인다. */
  scale?: number | readonly [number, number];
  /** 180도 돌려 붙인다. ㅓ·ㅔ처럼 아래아가 왼쪽을 볼 때 쓴다. */
  flip?: boolean;
  /** 조각 본래 자리와 다른 색으로 쓸 때. 숫자는 `initial`(olive). */
  tone?: Tone;
}

export interface Glyph {
  width: number;
  height: number;
  pieces: readonly Placement[];
}

/**
 * 조각으로 다시 짠 글자. 좌표는 글자 상자 안의 값이다.
 * 아래아는 막대에 겹치게 두어, 겹친 자리가 조금 더 짙게 보이도록 한다.
 */
export const GLYPHS: Record<string, Glyph> = {
  "1": {
    width: 45,
    height: 205,
    pieces: [{ piece: "iLong", x: 4, y: 64, scale: [1, 0.8], tone: "initial" }],
  },
  "2": {
    width: 84,
    height: 205,
    pieces: [{ piece: "rieul", x: 0, y: 66, scale: [0.8, 1.6], tone: "initial" }],
  },
  "0": {
    width: 82,
    height: 205,
    pieces: [{ piece: "ieung", x: 2, y: 70, scale: [0.95, 1.65], tone: "initial" }],
  },
  월: {
    width: 137,
    height: 206,
    pieces: [
      { piece: "ieung", x: 20, y: 6, scale: 0.72 },
      { piece: "eu", x: 0, y: 62, scale: [0.8, 0.78] },
      { piece: "dotShort", x: 37, y: 73, scale: 0.85 },
      { piece: "iMid", x: 112, y: 2, scale: [1, 1.06] },
      { piece: "dotWide", x: 88, y: 38, scale: 0.8, flip: true },
      { piece: "rieul", x: 16, y: 134, scale: [1.12, 0.86] },
    ],
  },
  일: {
    width: 137,
    height: 206,
    pieces: [
      { piece: "ieung", x: 4, y: 18, scale: 0.95 },
      { piece: "iLong", x: 96, y: 0, scale: [1, 0.76] },
      { piece: "rieul", x: 14, y: 134, scale: [1.12, 0.86] },
    ],
  },
  에: {
    width: 175,
    height: 205,
    pieces: [
      { piece: "ieung", x: 0, y: 70, scale: 0.86 },
      { piece: "iMid", x: 98, y: 28, scale: [1, 1.28] },
      { piece: "dotWide", x: 78, y: 93, scale: 0.8, flip: true },
      { piece: "iLong", x: 134, y: 0, scale: [1, 1.2] },
    ],
  },
  만: {
    width: 138,
    height: 205,
    pieces: [
      { piece: "mieum", x: 4, y: 14 },
      { piece: "iMid", x: 94, y: 0, scale: [1, 1.06] },
      { piece: "dotSmall", x: 100, y: 52 },
      { piece: "nieunFinal", x: 12, y: 134, scale: [1.05, 1] },
    ],
  },
  나: {
    width: 160,
    height: 172,
    pieces: [
      { piece: "nieun", x: 1, y: 60 },
      { piece: "iLong", x: 96, y: 1 },
      { piece: "dotWide", x: 105, y: 60 },
    ],
  },
  요: {
    width: 152,
    height: 150,
    pieces: [
      { piece: "ieung", x: 36, y: 10 },
      { piece: "eu", x: 2, y: 112 },
      { piece: "dotShort", x: 38, y: 102 },
      { piece: "dotShort", x: 86, y: 97 },
    ],
  },
};
