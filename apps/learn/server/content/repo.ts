// 콘텐츠·음원·게시본·TTS 사용량 저장소 계약.
// 운영은 Supabase(phoneme_content_*, phoneme_audio_assets, phoneme_tts_usage), 시험은 메모리 구현을 쓴다.
import type { GroupId } from "../../content/course-order.ts";
import type { ContentSnapshot, ContentStage, ContentSubstage, StageZeroContext } from "../../content/snapshot.ts";

export type ContentItemSource = "roadmap_seed" | "teacher";
export type ContentItemStatus = "draft" | "approved" | "hidden";

export type ContentItemRow = {
  id: string;
  legacyId: string | null;
  groupId: GroupId;
  stage: ContentStage;
  substage: ContentSubstage;
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
  source: ContentItemSource;
  status: ContentItemStatus;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type NewContentItemInput = {
  legacyId?: string | null;
  groupId: GroupId;
  stage: ContentStage;
  substage: ContentSubstage;
  consonant: string;
  word: string;
  entryId?: number | null;
  pos?: string;
  gloss?: string;
  scene?: string;
  example?: string;
  related?: string;
  note?: string;
  sortOrder?: number;
  source: ContentItemSource;
  status: ContentItemStatus;
  createdBy: string | null;
};

export type ContentItemPatch = Partial<
  Pick<
    ContentItemRow,
    "stage" | "substage" | "consonant" | "word" | "pos" | "gloss" | "scene" | "example" | "related" | "note" | "sortOrder" | "status"
  >
>;

export type ContentItemVersionRow = {
  id: string;
  itemId: string;
  version: number;
  snapshot: Record<string, unknown>;
  changedFields: string[];
  reason: string | null;
  editedBy: string | null;
  createdAt: string;
};

export type StageZeroRow = {
  id: string;
  groupId: GroupId;
  consonant: string;
  stimulus: string;
  word: string | null;
  context: StageZeroContext;
  kind: "pseudoword" | "cell";
  sortOrder: number;
};

export type NewStageZeroInput = Omit<StageZeroRow, "id">;

export type AudioAssetKind = "pseudo" | "syllable" | "word" | "sentence" | "sentence_turns" | "audition";
export type AudioAssetStatus = "draft" | "approved" | "rejected" | "superseded";
export type AudioAssetSource = "import" | "pc_batch" | "ui_single";

export type AudioAssetRow = {
  id: string;
  audioId: string;
  itemId: string | null;
  kind: AudioAssetKind;
  voiceKey: string;
  storage: "r2" | "local";
  objectKey: string;
  mime: string;
  bytes: number;
  durationMs: number | null;
  sha256: string;
  status: AudioAssetStatus;
  stale: boolean;
  source: AudioAssetSource;
  model: string;
  stylePrompt: string | null;
  settings: Record<string, unknown>;
  text: string;
  generatedAt: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
};

export type NewAudioAssetInput = Omit<AudioAssetRow, "id" | "createdAt" | "reviewedBy" | "reviewedAt" | "settings"> & {
  settings?: Record<string, unknown>;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
};

export type ContentReleaseRow = {
  id: string;
  seq: number;
  releasedBy: string | null;
  releasedAt: string;
  note: string | null;
  itemCount: number;
  audioCount: number;
  snapshot: ContentSnapshot;
};

export type TtsUsageRow = {
  id: string;
  at: string;
  quotaDay: string;
  source: "ui_single" | "pc_batch";
  voiceKey: string;
  kind: string;
  itemId: string | null;
  ok: boolean;
  errorCode: string | null;
};

export type TtsUsageSummary = {
  total: number;
  uiSingle: number;
  pcBatch: number;
};

export type ContentProposalKind = "fill" | "cleanup";
export type ContentProposalStatus = "pending" | "applied" | "dismissed";
export type ContentProposalFields = Partial<
  Pick<ContentItemRow, "pos" | "gloss" | "scene" | "example" | "related" | "note">
>;

export type ContentProposalRow = {
  id: string;
  itemId: string;
  kind: ContentProposalKind;
  fields: ContentProposalFields;
  sense: string;
  flags: string[];
  source: "ai_draft";
  model: string;
  promptVersion: string;
  status: ContentProposalStatus;
  createdAt: string;
  decidedBy: string | null;
  decidedAt: string | null;
};

export type NewContentProposalInput = {
  itemId: string;
  kind: ContentProposalKind;
  fields: ContentProposalFields;
  sense: string;
  flags: string[];
  source?: "ai_draft";
  model: string;
  promptVersion: string;
};

export type ContentRepo = {
  kind: "memory" | "supabase";

  listItems(filter?: { groupId?: GroupId; includeHidden?: boolean }): Promise<ContentItemRow[]>;
  getItem(id: string): Promise<ContentItemRow | null>;
  createItem(input: NewContentItemInput): Promise<ContentItemRow>;
  updateItem(
    id: string,
    patch: ContentItemPatch,
    versionInfo: { changedFields: string[]; reason: string | null; editedBy: string | null },
  ): Promise<{ item: ContentItemRow; version: ContentItemVersionRow } | null>;
  listItemVersions(itemId: string): Promise<ContentItemVersionRow[]>;

  listStageZero(groupId?: GroupId): Promise<StageZeroRow[]>;

  listAudioAssets(filter?: { audioId?: string; status?: AudioAssetStatus }): Promise<AudioAssetRow[]>;
  getAudioAsset(id: string): Promise<AudioAssetRow | null>;
  insertAudioAsset(input: NewAudioAssetInput): Promise<AudioAssetRow>;
  upsertAudioAssets(inputs: NewAudioAssetInput[], onConflict?: "ignore" | "merge"): Promise<number>;
  markAudioStale(filter: {
    itemIds?: string[];
    audioIds?: string[];
    kinds?: AudioAssetKind[];
    attachItemId?: string | null;
  }): Promise<number>;
  supersedeDrafts(audioId: string): Promise<number>;
  reviewAudioAsset(id: string, status: "approved" | "rejected", reviewedBy: string): Promise<AudioAssetRow | null>;

  latestRelease(): Promise<ContentReleaseRow | null>;
  createRelease(input: {
    releasedBy: string | null;
    note: string | null;
    snapshot: ContentSnapshot;
    itemCount: number;
    audioCount: number;
  }): Promise<ContentReleaseRow>;

  recordTtsUsage(input: Omit<TtsUsageRow, "id" | "at"> & { at?: string }): Promise<void>;
  ttsUsageSummary(quotaDay: string): Promise<TtsUsageSummary>;

  seedItems(items: NewContentItemInput[]): Promise<number>;
  seedStageZero(rows: NewStageZeroInput[]): Promise<number>;

  listProposals(filter?: { status?: ContentProposalStatus; itemId?: string }): Promise<ContentProposalRow[]>;
  getProposal(id: string): Promise<ContentProposalRow | null>;
  insertProposals(inputs: NewContentProposalInput[]): Promise<{ inserted: number; skipped: number }>;
  decideProposal(
    id: string,
    status: "applied" | "dismissed",
    decidedBy: string | null,
  ): Promise<ContentProposalRow | null>;
};

export function itemSnapshotRecord(item: ContentItemRow): Record<string, unknown> {
  return {
    id: item.id,
    legacyId: item.legacyId,
    groupId: item.groupId,
    stage: item.stage,
    substage: item.substage,
    consonant: item.consonant,
    word: item.word,
    entryId: item.entryId,
    pos: item.pos,
    gloss: item.gloss,
    scene: item.scene,
    example: item.example,
    related: item.related,
    note: item.note,
    sortOrder: item.sortOrder,
    source: item.source,
    status: item.status,
  };
}

export function normalizeProposalFields(raw: unknown): ContentProposalFields {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const obj = raw as Record<string, unknown>;
  const out: ContentProposalFields = {};
  for (const key of ["pos", "gloss", "scene", "example", "related", "note"] as const) {
    const val = obj[key];
    if (typeof val === "string") out[key] = val;
    else if (key === "related" && Array.isArray(val)) out.related = val.map(String).join(", ");
  }
  return out;
}
