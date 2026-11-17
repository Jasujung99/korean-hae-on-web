// 학습자가 고를 수 있는 연습 목소리 3가지(2026-11-17 사용자 결정): 남 Charon, 여 Erinome·Sulafat.
// 음원 파일은 `<기본 id>--<key>.wav`로 목소리마다 따로 둔다.

export const PRACTICE_VOICES = [
  { key: "charon", voice: "Charon", label: "남성", note: "설명하는 말투" },
  { key: "erinome", voice: "Erinome", label: "여성", note: "또렷함" },
  { key: "sulafat", voice: "Sulafat", label: "여성", note: "따뜻함" },
] as const;

export type PracticeVoiceKey = (typeof PRACTICE_VOICES)[number]["key"];

export const DEFAULT_PRACTICE_VOICE: PracticeVoiceKey = "charon";

export function isPracticeVoiceKey(value: unknown): value is PracticeVoiceKey {
  return PRACTICE_VOICES.some((row) => row.key === value);
}

export function practiceVoiceName(key: PracticeVoiceKey): string {
  return PRACTICE_VOICES.find((row) => row.key === key)?.voice ?? "Charon";
}

/** 목소리별 음원 id */
export function voicedAudioId(baseId: string, key: PracticeVoiceKey): string {
  return `${baseId}--${key}`;
}
