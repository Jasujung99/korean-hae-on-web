// 미리보기 API의 요청·응답 모양. 서버와 화면이 같은 정의를 쓴다(화면은 type import만).
// 미리보기는 기기 세션·초대·DB가 없는 로컬 검토용이다. 학습자는 고정된 '미리보기 학습자' 하나다.

export type ConsonantKey = string;

export type ChoiceView = { key: ConsonantKey; text: string };

export type ItemView = {
  itemId: string;
  choices: ChoiceView[];
  audioRef: string | null;
  /** 소리 방식이 '브라우저 음성'일 때만 준다. 브라우저가 읽을 글자라 정답이 화면 코드에 드러난다. */
  speechText: string | null;
  positionLabel: string;
  stage: string;
  slotKind: string;
};

export type AnswerResult = {
  itemId: string;
  choice: ConsonantKey;
  correct: boolean;
  answer: ChoiceView;
  countsAsScore: boolean;
  excludedReason: "audio_error" | "answered_during_playback" | "not_first_attempt" | null;
  /** 답을 낸 뒤에만 알려 주는 정답·내 선택 음원 */
  answerRef: string | null;
  choiceRef: string | null;
};

export type SessionView = {
  sessionId: string;
  groupId: string;
  groupLabel: string;
  policyVersion: string;
  items: ItemView[];
  answers: AnswerResult[];
  skipped: string[];
  finished: boolean;
  voice: string;
  sound: SoundSource;
};

export type AnswerRequest = {
  eventId: string;
  sessionId: string;
  itemId: string;
  choice: ConsonantKey;
  seq: number;
  clientTime: string;
  replaysBeforeAnswer: number;
  msFromStimulusEnd: number | null;
  answeredDuringPlayback: boolean;
  audioState: "ok" | "error";
  audioSource?: SoundSource;
  style?: PreviewStyle;
};

export type AbxTrialView = {
  trialId: string;
  itemId: string;
  refs: { a: string | null; b: string | null; x: string | null };
  /** 브라우저 음성일 때만 */
  texts: { a: string; b: string; x: string } | null;
};

export type AbxAnswerRequest = {
  eventId: string;
  sessionId: string;
  trialId: string;
  choice: "A" | "B";
  seq: number;
  clientTime: string;
};

export type AbxAnswerResult = {
  trialId: string;
  correct: boolean;
  xWas: "A" | "B";
  a: ChoiceView;
  b: ChoiceView;
};

export const CLIENT_EVENT_TYPES = [
  "item_shown",
  "audio_play_start",
  "audio_play_end",
  "audio_error",
  "visibility_hidden",
  "visibility_visible",
  "compare_open",
  "compare_close",
  "session_end",
  "item_skipped",
  "word_viewed",
  "dictionary_opened",
  "word_saved",
  "word_unsaved",
] as const;

export type ClientEventType = (typeof CLIENT_EVENT_TYPES)[number];

export type ClientEvent = {
  id: string;
  sessionId: string | null;
  seq: number;
  type: ClientEventType;
  clientTime: string;
  payload?: Record<string, string | number | boolean | null>;
};

export type WordView = {
  id: string;
  word: string;
  pos: string;
  consonant: string;
  substage: string;
  positionLabel: string;
  gloss: string;
  scene: string;
  example: string;
  related: string;
  wordAudioRef: string | null;
  exampleAudioRef: string | null;
};

export type CourseGroupView = {
  id: string;
  order: number;
  label: string;
  choices: string[];
  category: string;
  pseudowords: string[];
  status: "practice" | "planned";
  stages: Array<{ stage: string; title: string; count: number; samples: string[] }>;
};

export type CourseView = {
  note: string;
  sourceCommit: string;
  roadmapPriority: string[];
  groups: CourseGroupView[];
};

export type VoiceView = {
  voice: string;
  character: string;
  reading: boolean;
  note: string;
  /** 톤 지시 없이 만든 표본 */
  audioRef: string | null;
  /** 평평한 낭독 톤 지시를 붙여 만든 표본 */
  flatAudioRef: string | null;
};

export type PracticeVoiceView = {
  key: string;
  voice: string;
  label: string;
  note: string;
  ready: number;
  total: number;
  sampleRef: string | null;
};

export type VoicesView = {
  sampleText: string;
  /** 표본에 붙인 톤 지시(영어 원문). 본문과 따로 보내 소리로 읽히지 않는다. */
  flatStyle: string;
  model: string;
  practiceVoice: string;
  /** 학습자가 고른 연습 목소리(charon·erinome·sulafat) */
  practiceVoiceKey: string;
  practiceVoices: PracticeVoiceView[];
  chosen: string | null;
  voices: VoiceView[];
};

export type LearnerSummary = {
  id: string;
  name: string;
  languages: string;
  kind: "preview" | "example";
  lastActive: string | null;
  days: number;
  note: string;
  activeMs: number;
  medial: Tally;
  initial: Tally;
  audioErrors: number;
};

export type Tally = { correct: number; total: number };

export type Matrix = { consonants: string[]; rows: number[][]; correct: number; total: number; excluded: number };

export type DwellRow = {
  label: string;
  dwellMs: number;
  replays: number;
  waitMs: number | null;
  hiddenMs: number;
  outcome: string;
};

export type LearnerDetail = {
  learner: LearnerSummary;
  period: string;
  stats: { activeMs: number; openMs: number; days: number; lastActive: string | null; started: number; finished: number };
  /** 살펴볼 점: 가장 잦은 혼동을 문장으로. 까닭은 판단하지 않는다. */
  insight: string;
  /** 월요일부터 시작하는 4주, 날마다의 활동 시간. */
  calendar: Array<{ date: string; activeMs: number; future: boolean }>;
  /** 회기별 첫 응답(모음 사이). 오래된 것부터. */
  trend: Array<{ label: string; correct: number; total: number }>;
  hardItems: Array<{ label: string; wrong: number; total: number; chosen: string }>;
  stops: string[];
  identify: { medial: Matrix; initial: Matrix; byVowel: Record<string, Matrix> };
  abx: { trials: number; correct: number; pairs: Array<{ pair: string; trials: number; correct: number }> };
  replays: Array<{ consonant: string; average: number; max: number; items: number }>;
  recent: {
    label: string;
    activeMs: number;
    openMs: number;
    hiddenMs: number;
    audioMs: number;
    idleMs: number;
    dwell: DwellRow[];
    interruptions: string[];
  } | null;
  sessions: number;
  isExample: boolean;
};

export type PreviewStyle = "proto" | "canvas";
export type SoundSource = "file" | "browser";
export type PreviewSettings = { style: PreviewStyle; sound: SoundSource };

export type ListenView = {
  frames: Array<{ lead: string; sounds: Array<{ key: string; text: string; audioRef: string | null }> }>;
};
