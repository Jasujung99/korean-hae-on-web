// 자음 묶음의 학습 순서. 화면이 큰 로드맵 JSON을 불러오지 않고도 순서를 보여 주도록 따로 둔다.
// 2026-11-17 사용자 결정: ㅈ·ㅊ·ㅉ → ㅅ·ㅆ → ㄱ·ㅋ·ㄲ → ㅂ·ㅍ·ㅃ → ㄷ·ㅌ·ㄸ
// (PR #5 로드맵의 macro_sequence는 ㅈ·ㅊ·ㅉ → ㅂ·ㅍ·ㅃ → ㄱ·ㅋ·ㄲ → ㄷ·ㅌ·ㄸ → ㅅ·ㅆ)

export const COURSE_ORDER = ["j_ch_jj", "s_ss", "g_k_kk", "b_p_pp", "d_t_tt"] as const;

export type GroupId = (typeof COURSE_ORDER)[number];

export const GROUP_LABELS: Record<GroupId, string> = {
  j_ch_jj: "ㅈ · ㅊ · ㅉ",
  s_ss: "ㅅ · ㅆ",
  g_k_kk: "ㄱ · ㅋ · ㄲ",
  b_p_pp: "ㅂ · ㅍ · ㅃ",
  d_t_tt: "ㄷ · ㅌ · ㄸ",
};

/** 음원과 문항이 준비되어 미리보기에서 연습할 수 있는 묶음 */
export const PRACTICE_READY_GROUPS: readonly GroupId[] = ["j_ch_jj"];

export const COURSE_ORDER_NOTE = "2026-11-17 결정 순서. PR #5 로드맵의 우선순위와 다릅니다.";

/**
 * 2026-11-17 사용자 결정: 묶음(군)끼리는 섞지 않는다.
 * 한 문항의 보기는 한 묶음 안의 자음만 쓴다(예: ㅈ·ㅊ·ㅉ 문항에 ㅅ·ㅆ을 넣지 않음).
 * PR #5 로드맵 Stage 5의 치찰음 5지선다(ㅅ·ㅆ·ㅈ·ㅊ·ㅉ, extended_cross_choices)는 쓰지 않는다.
 */
export const MIX_GROUPS = false;

export const GROUP_CHOICES: Record<GroupId, readonly string[]> = {
  j_ch_jj: ["ㅈ", "ㅊ", "ㅉ"],
  s_ss: ["ㅅ", "ㅆ"],
  g_k_kk: ["ㄱ", "ㅋ", "ㄲ"],
  b_p_pp: ["ㅂ", "ㅍ", "ㅃ"],
  d_t_tt: ["ㄷ", "ㅌ", "ㄸ"],
};
