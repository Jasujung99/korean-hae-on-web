// 대표 목소리를 고르기 위한 청취 표본 목록.
// 고른 결과는 미리보기 기록일 뿐이며, 목소리를 운영용으로 확정하지 않는다(VOICE_FIXED = false).

export const AUDITION_TEXT = "아자, 아차, 아짜. 모자를 쓰고 기차를 타요. 이쪽으로 오세요.";

export type AuditionVoice = {
  voice: string;
  character: string;
  note: string;
};

// 기본 제공 목소리 가운데 또렷하고 고른 낭독 성격의 후보만 골랐다.
export const AUDITION_VOICES: AuditionVoice[] = [
  { voice: "Iapetus", character: "또렷함", note: "인계 문서의 첫 후보" },
  { voice: "Erinome", character: "또렷함", note: "" },
  { voice: "Kore", character: "단단함", note: "" },
  { voice: "Charon", character: "설명하는 말투", note: "" },
  { voice: "Schedar", character: "고른 말투", note: "" },
  { voice: "Sulafat", character: "따뜻함", note: "" },
];

export function auditionAudioId(voice: string): string {
  return `audition-${voice.toLowerCase()}`;
}
