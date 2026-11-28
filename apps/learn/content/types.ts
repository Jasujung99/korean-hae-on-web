import type { TaskKey } from "./tasks.ts";

export const REVIEW_COLUMNS = [
  "source_entry_id",
  "lexeme_key",
  "sense_id",
  "revision_id",
  "word",
  "pos",
  "source_gloss",
  "learner_definition",
  "example",
  "example_source",
  "edit_reason",
  "occurrence_id",
  "written_jamo",
  "surface_phoneme",
  "word_position",
  "previous_segment",
  "following_vowel",
  "process",
  "stage_links",
  "meaning_status",
  "example_status",
  "pronunciation_status",
  "audio_status",
  "reviewer",
  "reviewed_at",
] as const;

export type ReviewColumn = (typeof REVIEW_COLUMNS)[number];

export type ReviewStatus = "draft" | "needs_review" | "unreviewed" | "missing" | "approved" | "retired";

export type ReviewRow = Record<ReviewColumn, string>;

export type SourceRef = {
  inventoryId: string;
  commit: string;
  path: string;
  schemaVersion: number;
};

export type StageDef = {
  id: string;
  name: string;
  lexemeIds: string[];
};

export type ContrastSet = {
  id: string;
  label: string;
  consonants: string[];
};

export type Pseudoword = {
  id: string;
  text: string;
  consonant: string;
  contrastId: string;
  dictionaryEntry: false;
};

export type SourceEntry = {
  id: string;
  entryId: string;
  lexemeKey: string;
  inventoryId: string;
  sourceCommit: string;
  sourcePath: string;
  schemaVersion: number;
};

export type RejectedSense = {
  entryId: string;
  lexemeKey: string;
  pos: string;
  reason: string;
};

export type Lexeme = {
  id: string;
  word: string;
  pos: string;
  grade: string;
  consonant: string;
  contrastId: string;
  sourceEntryId: string;
  stageId: string;
  firstTwelve: boolean;
  flags: string[];
  rejectedSenses: RejectedSense[];
};

export type Revision = {
  id: string;
  lexemeId: string;
  sourceGloss: string;
  learnerDefinition: string;
  example: string;
  exampleSource: string;
  editReason: string;
  meaningStatus: ReviewStatus;
  exampleStatus: ReviewStatus;
};

export type Occurrence = {
  id: string;
  lexemeId: string;
  writtenJamo: string;
  surfacePhoneme: string;
  syllable: number;
  charIndex: number;
  wordPosition: string;
  previousSegment: string;
  followingVowel: string;
  process: string;
  pronunciationStatus: ReviewStatus;
};

export type AudioAsset = {
  id: string;
  status: ReviewStatus;
  model: string;
  voice: string;
  mime: string;
  sha256: string;
  generatedAt: string;
};

export type ItemVersion = {
  id: string;
  task: TaskKey;
  contrastId: string;
  revisionId: string;
  lexemeId: string;
  targetOccurrenceId: string;
  pseudowordId: string;
  audioIds: string[];
};

export type Release = {
  id: string;
  visibility: "public" | "preview";
  itemIds: string[];
};

export type KnownSourceIssue = {
  entryIds: string[];
  word: string;
  problem: string;
};

export type Catalog = {
  schemaVersion: number;
  source: SourceRef;
  stages: StageDef[];
  contrasts: ContrastSet[];
  pseudowords: Pseudoword[];
  sourceEntries: SourceEntry[];
  lexemes: Lexeme[];
  revisions: Revision[];
  occurrences: Occurrence[];
  audioAssets: AudioAsset[];
  items: ItemVersion[];
  releases: Release[];
  knownSourceIssues: KnownSourceIssue[];
};

export type SelectionSlotKind = "common" | "weak_candidate" | "spaced_review";

export type PracticeSlot = {
  kind: SelectionSlotKind;
  itemId: string;
  reason: string;
};
