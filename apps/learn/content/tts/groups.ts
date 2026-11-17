// 의사단어를 하나씩이 아니라 묶어서 읽힌 뒤 잘라 쓰는 방식(비교용).
// - trio: 같은 앞 모음 세 소리를 한 번에("아자, 아차, 아짜.") → 3개로 자름
// - all: 아홉 소리를 한 번에 → 9개로 자름
// 하나씩 만든 음원(pw-아자--erinome)은 그대로 두고, 자른 음원은 접미사로 따로 둔다.
import { PRACTICE_ITEMS } from "../practice.ts";

export type GroupMode = "trio" | "all";

export const GROUP_MODES: Array<{ mode: GroupMode; label: string }> = [
  { mode: "trio", label: "세 소리씩 묶어 읽고 자름" },
  { mode: "all", label: "아홉 소리를 한 번에 읽고 자름" },
];

export type GroupPlan = {
  /** 자르기 전 통째 파일의 이름 앞부분 */
  fullBase: string;
  text: string;
  parts: Array<{ base: string; text: string }>;
};

/** 앞 모음(아·이·오)별 세 소리 */
export function pseudoFrames(): Array<{ lead: string; parts: Array<{ base: string; text: string }> }> {
  const leads = [...new Set(PRACTICE_ITEMS.map((item) => item.stimulus.slice(0, 1)))];
  return leads.map((lead) => ({
    lead,
    parts: PRACTICE_ITEMS.filter((item) => item.stimulus.startsWith(lead)).map((item) => ({ base: item.audioId, text: item.stimulus })),
  }));
}

export function groupPlans(mode: GroupMode): GroupPlan[] {
  const frames = pseudoFrames();
  if (mode === "trio") {
    return frames.map((frame) => ({
      fullBase: `pw-group-${frame.lead}`,
      text: `${frame.parts.map((part) => part.text).join(", ")}.`,
      parts: frame.parts,
    }));
  }
  const parts = frames.flatMap((frame) => frame.parts);
  return [{ fullBase: "pw-group-all", text: `${parts.map((part) => part.text).join(", ")}.`, parts }];
}

/** 자른 소리 하나의 파일 이름(예: pw-아자--erinome--trio) */
export function splitAudioId(base: string, voiceKey: string, mode: GroupMode): string {
  return `${base}--${voiceKey}--${mode}`;
}

/** 자르기 전 통째 파일 이름(예: pw-group-아--erinome--trio) */
export function groupFullId(fullBase: string, voiceKey: string, mode: GroupMode): string {
  return `${fullBase}--${voiceKey}--${mode}`;
}
