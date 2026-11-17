// 대표 목소리를 고르기 위한 청취 표본 목록.
// 고른 결과는 미리보기 기록일 뿐이며, 목소리를 운영용으로 확정하지 않는다(VOICE_FIXED = false).
// 목소리 이름과 성격 표시는 3.8 TTS 모델(gemini-3.8-flash-tts) 문서의 기본 제공 목소리 30개를 따른다.

export const AUDITION_TEXT = "아자, 아차, 아짜. 모자를 쓰고 기차를 타요. 이쪽으로 오세요.";

export type AuditionVoice = {
  voice: string;
  /** 문서의 한 단어 성격 표시(영어)를 옮긴 것. 한국어로 들으면 다를 수 있다. */
  character: string;
  /** 낭독에 맞아 보이는 성격이면 true. 화면에서 먼저 보여 줄 뿐 선택을 막지 않는다. */
  reading: boolean;
  note: string;
};

export const AUDITION_VOICES: AuditionVoice[] = [
  { voice: "Iapetus", character: "또렷함", reading: true, note: "인계 문서의 첫 후보 · 지금 연습 음원" },
  { voice: "Erinome", character: "또렷함", reading: true, note: "" },
  { voice: "Charon", character: "설명하는 말투", reading: true, note: "A안 브랜치의 남성 후보" },
  { voice: "Rasalgethi", character: "설명하는 말투", reading: true, note: "" },
  { voice: "Kore", character: "단단함", reading: true, note: "A안 브랜치의 여성 후보(0.87배 느리게)" },
  { voice: "Orus", character: "단단함", reading: true, note: "" },
  { voice: "Alnilam", character: "단단함", reading: true, note: "" },
  { voice: "Schedar", character: "고른 말투", reading: true, note: "" },
  { voice: "Sadaltager", character: "지식 있는 말투", reading: true, note: "" },
  { voice: "Gacrux", character: "성숙함", reading: true, note: "" },
  { voice: "Achernar", character: "부드러움", reading: true, note: "" },
  { voice: "Vindemiatrix", character: "온화함", reading: true, note: "" },
  { voice: "Sulafat", character: "따뜻함", reading: true, note: "" },
  { voice: "Algieba", character: "매끄러움", reading: false, note: "" },
  { voice: "Despina", character: "매끄러움", reading: false, note: "" },
  { voice: "Achird", character: "친근함", reading: false, note: "" },
  { voice: "Callirrhoe", character: "느긋함", reading: false, note: "" },
  { voice: "Umbriel", character: "느긋함", reading: false, note: "" },
  { voice: "Zubenelgenubi", character: "편한 말투", reading: false, note: "" },
  { voice: "Aoede", character: "산뜻함", reading: false, note: "" },
  { voice: "Pulcherrima", character: "앞으로 나서는 말투", reading: false, note: "" },
  { voice: "Zephyr", character: "밝음", reading: false, note: "" },
  { voice: "Autonoe", character: "밝음", reading: false, note: "" },
  { voice: "Leda", character: "젊은 말투", reading: false, note: "" },
  { voice: "Puck", character: "경쾌함", reading: false, note: "" },
  { voice: "Laomedeia", character: "경쾌함", reading: false, note: "" },
  { voice: "Sadachbia", character: "생기 있음", reading: false, note: "" },
  { voice: "Fenrir", character: "들뜬 말투", reading: false, note: "" },
  { voice: "Enceladus", character: "숨소리 섞임", reading: false, note: "" },
  { voice: "Algenib", character: "거친 말투", reading: false, note: "" },
];

export function auditionAudioId(voice: string): string {
  return `audition-${voice.toLowerCase()}`;
}

/** 평평한 낭독 톤 지시를 붙여 만든 표본 */
export function flatAuditionAudioId(voice: string): string {
  return `audition-${voice.toLowerCase()}-flat`;
}
