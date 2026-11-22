// 학습 API의 요청·응답 모양. 서버와 화면이 같은 정의를 쓴다(화면은 type import만).
// 학습자는 개인 초대로 연결한 기기 세션(쿠키)으로, 교사는 교사 세션으로 서버가 정한다.

export type ConsonantKey = string;

export type ChoiceView = { key: ConsonantKey; text: string };

export type ItemView = {
  itemId: string;
  choices: ChoiceView[];
  audioRef: string | null;
  positionLabel: string;
  stage: string;
  slotKind: string;
  /** word: 낱말 대립쌍 / pseudo: 의사단어 */
  kind: ItemKind;
  /** Stage 안 출제 순서(낱말만) */
  step: 1 | 2 | 3 | null;
  stepLabel: string | null;
  /** 목표 자음이 든 음절(1부터)과 그 음절의 모음. 다른 음절·받침은 답을 드러낼 수 있어 보내지 않는다. */
  syllableIndex: number;
  vowel: string;
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
  /** 비교 재생하는 두 소리의 글자. 낱말 상대가 없으면 같은 앞 모음의 의사단어다. */
  answerText: string;
  choiceText: string;
  compareKind: ItemKind;
  compareTier: number | null;
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
  itemKind: ItemKind;
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
  style?: PreviewStyle;
};

export type AbxTrialView = {
  trialId: string;
  itemId: string;
  refs: { a: string | null; b: string | null; x: string | null };
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
  /** 사전 풀이의 새 창 링크(↗). payload { wordId, target: "krdict" | "stdict" | "naver", lang?: "ru" | "en" }. lang은 다국어 한국어기초사전 화면일 때만 붙는다. */
  "dictionary_link_opened",
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
  /** 실제로 들려줄 파일의 목소리. 예문은 아직 예전 초안(Iapetus)만 있는 경우가 있다. */
  wordVoice: string | null;
  exampleVoice: string | null;
  /** Stage 안 출제 순서(1 기준점 잡기 · 2 음절 틀 넓히기 · 3 실전 어휘 일반화) */
  step: 1 | 2 | 3;
  stepLabel: string;
  pairGroupId: string | null;
  contrastTier: number | null;
  /** 같은 대립쌍 묶음의 상대 낱말. 음원이 있으면 바로 비교해 들을 수 있다. */
  partners: Array<{ consonant: string; word: string; audioRef: string | null }>;
  /** 사전 풀이(국립국어원 사전에서 미리 받아 검수한 정적 자료). 학습자에게는 승인 항목만, 개발 미리보기에서는 검수 전 항목도 온다. */
  dict: WordDictView | null;
  /** 이 단어의 예문 2~5번 */
  extraExamples: Array<{ index: number; text: string; audioRef: string | null }>;
  /** 같은 단어가 다른 자음 묶음에도 있을 때 그 묶음의 예문. 묶음마다 예문 음원이 따로 있다. */
  moreExamples: Array<{ groupLabel: string; text: string; audioRef: string | null }>;
};

export type DictStatusView = "draft" | "needs_review" | "approved";

export type DictTranslationView = { word: string; definition: string };

export type WordDictView = {
  status: DictStatusView;
  krdict: {
    targetCode: number;
    pos: string;
    grade: string;
    definition: string;
    /** 기초사전 문장 용례 하나(보조). 주 예문은 우리 단어표의 예문이다. */
    example: string | null;
    translations: Record<DictLanguage, DictTranslationView | null>;
  } | null;
  stdict: { targetCode: number; origin: string; pos: string; pronunciation: string; definition: string } | null;
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
  kind: "learner" | "example";
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
  /** 대립 정밀도별 첫 응답. tier12 순수 음향 변별 / tier34 어휘 맥락 전이 / unpaired 의사단어·짝 없는 낱말 */
  tiers: Array<{ band: "tier12" | "tier34" | "unpaired"; correct: number; total: number }>;
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
export type ItemKind = "word" | "pseudo";
export type DictLanguage = "ru" | "en";
/** 학습자 설정. 학습자 id에 저장하므로 기기를 바꿔도 이어진다. */
/** 예문 읽기: spoken = 말하듯이(기본), turns = 또박또박 */
export type ExampleReading = "spoken" | "turns";
export type LearnerSettings = {
  style: PreviewStyle;
  items: ItemKind;
  dictLanguage: DictLanguage;
  practiceVoice: string;
  exampleReading: ExampleReading;
};

export type MeView = {
  learner: { id: string; nickname: string };
  settings: LearnerSettings;
  practiceVoices: PracticeVoiceView[];
};

export type InviteInspectView = {
  status: "ok" | "invalid" | "used" | "revoked" | "expired";
  nickname: string | null;
  dictLanguage: DictLanguage | null;
};

export type InviteStatus = "none" | "open" | "expired" | "used" | "revoked";

export type TeacherLearnerRow = {
  id: string;
  nickname: string;
  classLabel: string | null;
  homeLanguage: "ru" | null;
  dictLanguage: DictLanguage;
  isTest: boolean;
  /** active = 진행 중, archived = 종료함(링크·기기 연결이 끊기고 기록은 남음) */
  status: "active" | "archived";
  invite: { status: InviteStatus; expiresAt: string | null; createdAt: string | null };
  devices: number;
  summary: LearnerSummary;
};

export type TeacherView = { teacher: { displayName: string }; inviteOrigin: string; learners: TeacherLearnerRow[] };

export type InviteIssued = { url: string; expiresAt: string };

export type ListenView = {
  frames: Array<{ lead: string; sounds: Array<{ key: string; text: string; audioRef: string | null }> }>;
};

// ---- 만든 음원 목록(목소리 화면의 대시보드) ----

export type GenerationMethod = "single" | "trio" | "all";

export type MethodCompareView = {
  voiceKey: string;
  voice: string;
  /** 아홉 소리를 한 번에 읽힌 통째 파일 */
  allFull: AudioCellView | null;
  frames: Array<{
    lead: string;
    methods: Array<{
      method: GenerationMethod;
      label: string;
      /** 세 소리를 묶어 읽힌 통째 파일(trio만) */
      full: AudioCellView | null;
      items: Array<{ text: string; cell: AudioCellView | null }>;
      spreadPct: number | null;
    }>;
  }>;
};

export type AudioCellView = {
  id: string;
  /** 목록 화면 전용 ref(연습 화면 ref와 따로) */
  ref: string | null;
  voice: string;
  model: string;
  generatedAt: string;
  durationMs: number | null;
  bytes: number;
  /** flat: 평평한 낭독 지시를 붙임 / plain: 지시 없음 / null: 기록 없음 */
  style: "flat" | "plain" | null;
};

export type AudioColumnView = { key: string; label: string; voice: string };

export type AudioUnitKind = "pseudoword" | "syllable" | "word" | "sentence";

export type AudioUnitView = {
  base: string;
  groupId: string;
  kind: AudioUnitKind;
  text: string;
  /** 열(목소리) key별 파일. 없으면 null */
  cells: Record<string, AudioCellView | null>;
};

export type AudioGroupView = {
  id: string;
  label: string;
  kind: AudioUnitKind;
  total: number;
  ready: Record<string, number>;
};

export type LengthCheckView = {
  label: string;
  column: string;
  items: Array<{ text: string; durationMs: number | null }>;
  /** (가장 긴 것 − 가장 짧은 것) / 가장 짧은 것, 퍼센트 */
  spreadPct: number | null;
};

export type AudioInventoryView = {
  rawDir: string;
  totals: {
    files: number;
    durationMs: number;
    lastGeneratedAt: string | null;
    byVoice: Array<{ voice: string; files: number }>;
  };
  columns: AudioColumnView[];
  groups: AudioGroupView[];
  units: AudioUnitView[];
  auditions: Array<{ voice: string; plain: AudioCellView | null; flat: AudioCellView | null }>;
  /** 위 어디에도 속하지 않는 파일 */
  others: Array<AudioCellView & { text: string }>;
  lengthChecks: LengthCheckView[];
  /** 의사단어 생성 방식 비교: 하나씩 / 세 소리씩 묶어 읽고 자름 / 아홉 소리 한 번에 읽고 자름 */
  methods: MethodCompareView[];
  /** 빠진 음원을 만들 때 쓰는 명령(키는 환경 변수로만) */
  commands: Array<{ label: string; command: string }>;
};

// ---- 콘텐츠 운영(/teach/content) ----

export type ContentAudioState = "approved" | "draft" | "stale" | "missing";

export type ContentAudioCell = {
  state: ContentAudioState;
  assetId: string | null;
  audioId: string;
  playUrl: string | null;
  durationMs: number | null;
  generatedAt: string | null;
  source: string | null;
};

export type ContentTurnsCell = {
  ready: boolean;
  playUrl: string | null;
  assetId: string | null;
  durationMs: number | null;
};

export type ContentProposalKind = "fill" | "cleanup";
export type ContentProposalStatus = "pending" | "applied" | "dismissed";
export type ContentProposalFields = Partial<
  Pick<ContentItemView, "pos" | "gloss" | "scene" | "example" | "related" | "note">
>;

export type ContentProposalView = {
  id: string;
  itemId: string;
  kind: ContentProposalKind;
  fields: ContentProposalFields;
  sense: string;
  flags: string[];
  source: string;
  model: string;
  promptVersion: string;
  status: ContentProposalStatus;
  createdAt: string;
};

export type ContentItemView = {
  id: string;
  legacyId: string | null;
  groupId: string;
  stage: string;
  substage: string | null;
  consonant: string;
  word: string;
  entryId: number | null;
  pos: string;
  gloss: string;
  scene: string;
  example: string;
  related: string;
  note: string;
  sortOrder: number;
  source: "roadmap_seed" | "teacher";
  status: "draft" | "approved" | "hidden";
  wordAudio: Record<string, ContentAudioCell>;
  exampleAudio: Record<string, ContentAudioCell> | null;
  turnsAudio: Record<string, ContentTurnsCell> | null;
  /** 예문 2~5번과 그 음원(1번은 example·exampleAudio·turnsAudio) */
  extraExamples?: ContentExampleView[];
  proposal?: ContentProposalView | null;
};

export type ContentStageZeroRow = {
  id: string;
  groupId: string;
  kind: "pseudoword" | "cell";
  consonant: string;
  stimulus: string;
  word: string | null;
  context: string;
  audio: Record<string, ContentAudioCell>;
};

export type ContentExampleView = {
  /** 2~5 */
  index: number;
  text: string;
  audio: Record<string, ContentAudioCell>;
  turnsAudio: Record<string, ContentTurnsCell>;
};

export type DraftAudioReviewRow = {
  assetId: string;
  audioId: string;
  itemId: string | null;
  word: string;
  kind: "word" | "sentence" | "pseudo" | "syllable";
  /** 예문 음원이면 몇 번 예문인지(1~5) */
  exampleIndex?: number;
  voiceKey: string;
  voiceLabel: string;
  durationMs: number | null;
  generatedAt: string;
  playUrl: string | null;
};

export type ContentStageSection = {
  key: string;
  title: string;
  totalCount: number;
  approvedCount: number;
  draftCount: number;
  items: ContentItemView[];
  draftAudios: DraftAudioReviewRow[];
};

export type ContentReleaseStatusView = {
  latestSeq: number | null;
  latestReleasedAt: string | null;
  latestNote: string | null;
  pendingReviewCount: number;
  draftItemCount: number;
  draftAudioCount: number;
  staleAudioCount: number;
  unpublishedApprovedCount: number;
  nextItemCount: number;
  nextAudioCount: number;
};

export type TtsUsageView = {
  quotaDay: string;
  limit: number;
  used: number;
  remaining: number;
  bySource: { ui_single: number; pc_batch: number };
  ttsReady: boolean;
};

export type ContentVersionRow = {
  version: number;
  changedFields: string[];
  reason: string | null;
  editedBy: string | null;
  createdAt: string;
  snapshot: Record<string, unknown>;
};

export type TeacherContentView = {
  groups: Array<{ id: string; label: string; choices: string[]; count: number; proposalCount?: number }>;
  totalProposalCount?: number;
  group: { id: string; label: string; choices: string[] };
  stage0: ContentStageZeroRow[];
  stages: ContentStageSection[];
  release: ContentReleaseStatusView;
  ttsReady: boolean;
  writable: boolean;
};
