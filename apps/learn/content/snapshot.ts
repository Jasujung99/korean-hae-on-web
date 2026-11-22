// 게시본 콘텐츠 스냅샷 모양과 기준 JSON 변환·집계 순수 함수.
// node:* 모듈을 쓰지 않으므로 Cloudflare 워커와 브라우저에서도 그대로 불러올 수 있다.
import { coreWords, JCJ_PSEUDOWORDS, stageZeroCells } from "./core-table.ts";
import { COURSE_ORDER, GROUP_CHOICES, type GroupId } from "./course-order.ts";
import { groupPseudowords, groupStageZero, groupWords, isOtherGroup } from "./group-tables.ts";

export type ContentStage = "Stage 1" | "Stage 2" | "Stage 3" | "Stage 4" | "Stage 5";
export type ContentSubstage = "1-A" | "1-B" | null;
export type StageZeroContext = "medial_vcv" | "initial_high" | "initial_nonhigh";

export type SnapshotWord = {
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
};

export type SnapshotStageZero = {
  groupId: GroupId;
  consonant: string;
  stimulus: string;
  word: string | null;
  context: StageZeroContext;
  kind: "pseudoword" | "cell";
  sortOrder: number;
};

export type SnapshotAudioEntry = {
  assetId: string;
  audioId: string;
  storage: "r2" | "local";
  objectKey: string;
  mime: string;
  bytes: number;
  durationMs: number | null;
  voice: string;
  model: string;
  generatedAt: string;
  sha256: string;
  kind: string;
  text: string;
  stylePrompt: string | null;
};

export type ContentSnapshot = {
  seq: number;
  releasedAt: string;
  items: SnapshotWord[];
  stage0: SnapshotStageZero[];
  audio: Record<string, SnapshotAudioEntry>;
};

export type ReleaseCandidateItem = SnapshotWord & { status: "draft" | "approved" | "hidden" };

export type ReleaseCandidateAsset = {
  id: string;
  audioId: string;
  storage: "r2" | "local";
  objectKey: string;
  mime: string;
  bytes: number;
  durationMs: number | null;
  voiceKey: string;
  model: string;
  generatedAt: string | null;
  reviewedAt: string | null;
  createdAt: string;
  sha256: string;
  kind: string;
  text: string;
  stylePrompt: string | null;
  status: "draft" | "approved" | "rejected" | "superseded";
  stale: boolean;
};

/**
 * 단어 음원 id의 중간 식별자.
 * 기존 JSON 단어는 entryId(예: 1871)를 유지하고, 화면에서 새로 만든 단어는 `c<uuid 앞 8자리>`를 써서 겹치지 않게 한다.
 */
export function wordIdPrefix(word: Pick<SnapshotWord, "id" | "entryId">): string {
  if (word.entryId !== null && Number.isFinite(word.entryId)) return String(word.entryId);
  const compact = word.id.replace(/[^a-zA-Z0-9]/g, "").slice(0, 8) || "item";
  return `c${compact}`;
}

export function snapshotWordAudioBase(word: Pick<SnapshotWord, "id" | "entryId" | "word">): string {
  return `word-${wordIdPrefix(word)}-${word.word}`;
}

/**
 * 예문 음원 id. 같은 단어가 두 묶음에 들어 있으면 묶음마다 예문이 다르므로(예: 사진 — ㅈ·ㅊ·ㅉ와 ㅅ·ㅆ),
 * 예문 음원은 묶음별로 따로 둔다. ㅈ·ㅊ·ㅉ는 이미 R2·DB에 올라간 id를 그대로 쓰고,
 * 나머지 묶음은 끝에 묶음 id를 붙인다(예: sentence-2615-사진-s_ss). 단어 음원은 글자가 같으므로 함께 쓴다.
 */
export function snapshotSentenceAudioBase(word: Pick<SnapshotWord, "id" | "entryId" | "word" | "groupId">): string {
  const base = `sentence-${wordIdPrefix(word)}-${word.word}`;
  return word.groupId === "j_ch_jj" ? base : `${base}-${word.groupId}`;
}

export function snapshotWordCardId(word: Pick<SnapshotWord, "id" | "entryId">): string {
  if (word.entryId !== null && Number.isFinite(word.entryId)) return `w-${word.entryId}`;
  return `w-${wordIdPrefix(word)}`;
}

export function snapshotStageKey(word: Pick<SnapshotWord, "stage" | "substage">): string {
  if (word.substage) return `Stage ${word.substage}`;
  return word.stage;
}

export function snapshotFromReferenceJson(): ContentSnapshot {
  const items: SnapshotWord[] = [];
  const stage0: SnapshotStageZero[] = [];

  coreWords().forEach((word, index) => {
    items.push({
      id: word.id,
      legacyId: word.id,
      groupId: "j_ch_jj",
      stage: word.stage,
      substage: word.substage,
      consonant: word.consonant,
      word: word.word,
      entryId: word.entryId,
      pos: word.pos,
      gloss: word.gloss,
      scene: word.scene,
      example: word.example,
      related: word.related,
      note: word.note,
      sortOrder: index + 1,
    });
  });

  JCJ_PSEUDOWORDS.forEach((row, index) => {
    stage0.push({
      groupId: "j_ch_jj",
      consonant: row.consonant,
      stimulus: row.stimulus,
      word: null,
      context: "medial_vcv",
      kind: "pseudoword",
      sortOrder: index + 1,
    });
  });

  stageZeroCells().forEach((cell, index) => {
    stage0.push({
      groupId: "j_ch_jj",
      consonant: cell.consonant,
      stimulus: cell.stimulus,
      word: cell.word,
      context: cell.context,
      kind: "cell",
      sortOrder: index + 1,
    });
  });

  for (const groupId of COURSE_ORDER) {
    if (!isOtherGroup(groupId)) continue;
    const choices = GROUP_CHOICES[groupId];
    groupWords(groupId).forEach((word, index) => {
      items.push({
        id: word.id,
        legacyId: word.id,
        groupId,
        stage: word.stage,
        substage: word.substage,
        consonant: word.consonant,
        word: word.word,
        entryId: word.entryId,
        pos: word.pos,
        gloss: word.gloss,
        scene: word.scene,
        example: word.example,
        related: word.related,
        note: word.note,
        sortOrder: index + 1,
      });
    });
    groupPseudowords(groupId).forEach((stimulus, index) => {
      const consonant = choices.find((ch) => stimulus.includes(ch)) ?? choices[0] ?? "";
      stage0.push({
        groupId,
        consonant,
        stimulus,
        word: null,
        context: "medial_vcv",
        kind: "pseudoword",
        sortOrder: index + 1,
      });
    });
    groupStageZero(groupId).forEach((cell, index) => {
      stage0.push({
        groupId,
        consonant: cell.consonant,
        stimulus: cell.stimulus,
        word: cell.word,
        context: cell.context,
        kind: "cell",
        sortOrder: index + 1,
      });
    });
  }

  return { seq: 0, releasedAt: "", items, stage0, audio: {} };
}

export function snapshotWords(snapshot: ContentSnapshot, groupId: GroupId): SnapshotWord[] {
  return snapshot.items
    .filter((word) => word.groupId === groupId)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

export function snapshotStageZero(snapshot: ContentSnapshot, groupId: GroupId): SnapshotStageZero[] {
  return snapshot.stage0
    .filter((row) => row.groupId === groupId && row.kind === "cell")
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

export function snapshotPseudowords(snapshot: ContentSnapshot, groupId: GroupId): SnapshotStageZero[] {
  return snapshot.stage0
    .filter((row) => row.groupId === groupId && row.kind === "pseudoword")
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

function assetSortTime(asset: Pick<ReleaseCandidateAsset, "reviewedAt" | "generatedAt" | "createdAt">): number {
  const iso = asset.reviewedAt ?? asset.generatedAt ?? asset.createdAt;
  const parsed = Date.parse(iso);
  return Number.isFinite(parsed) ? parsed : 0;
}

const VOICE_TITLE_BY_KEY: Record<string, string> = {
  charon: "Charon",
  erinome: "Erinome",
  sulafat: "Sulafat",
  iapetus: "Iapetus",
};

export function voiceLabelFromKey(voiceKey: string): string {
  return VOICE_TITLE_BY_KEY[voiceKey.toLowerCase()] ?? voiceKey;
}

/** 승인된 단어와 유효한 approved 음원으로 게시 스냅샷을 만든다. 같은 audio_id가 여럿이면 가장 최근 approved를 고른다. */
export function buildReleaseSnapshot(
  items: readonly ReleaseCandidateItem[],
  stage0: readonly SnapshotStageZero[],
  assets: readonly ReleaseCandidateAsset[],
  seq: number,
  releasedAt: string,
): { snapshot: ContentSnapshot; itemCount: number; audioCount: number } {
  const approvedItems: SnapshotWord[] = items
    .filter((item) => item.status === "approved")
    .map(({ status: _status, ...rest }) => rest)
    .sort((a, b) => COURSE_ORDER.indexOf(a.groupId) - COURSE_ORDER.indexOf(b.groupId) || a.sortOrder - b.sortOrder);

  const sortedStage0 = [...stage0].sort(
    (a, b) => COURSE_ORDER.indexOf(a.groupId) - COURSE_ORDER.indexOf(b.groupId) || a.sortOrder - b.sortOrder,
  );

  const latestByAudioId = new Map<string, ReleaseCandidateAsset>();
  for (const asset of assets) {
    if (asset.status !== "approved" || asset.stale) continue;
    const prev = latestByAudioId.get(asset.audioId);
    if (!prev || assetSortTime(asset) >= assetSortTime(prev)) {
      latestByAudioId.set(asset.audioId, asset);
    }
  }

  const audio: Record<string, SnapshotAudioEntry> = {};
  for (const [audioId, asset] of [...latestByAudioId.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    audio[audioId] = {
      assetId: asset.id,
      audioId,
      storage: asset.storage,
      objectKey: asset.objectKey,
      mime: asset.mime,
      bytes: asset.bytes,
      durationMs: asset.durationMs,
      voice: voiceLabelFromKey(asset.voiceKey),
      model: asset.model,
      generatedAt: asset.generatedAt ?? asset.createdAt,
      sha256: asset.sha256,
      kind: asset.kind,
      text: asset.text,
      stylePrompt: asset.stylePrompt,
    };
  }

  return {
    snapshot: { seq, releasedAt, items: approvedItems, stage0: sortedStage0, audio },
    itemCount: approvedItems.length,
    audioCount: Object.keys(audio).length,
  };
}

/**
 * TTS 생성·업로드 대상으로 쓰는 작업 표 스냅샷. 숨김을 뺀 draft·approved 단어와 첫소리 표를 그대로 담는다.
 * 게시본(buildReleaseSnapshot)과 달리 draft 단어도 넣어서, 게시 전에 음원을 먼저 만들 수 있게 한다.
 */
export function workingSnapshot(
  items: readonly ReleaseCandidateItem[],
  stage0: readonly SnapshotStageZero[],
): ContentSnapshot {
  const words: SnapshotWord[] = items
    .filter((item) => item.status === "draft" || item.status === "approved")
    .map(({ status: _status, ...rest }) => rest)
    .sort((a, b) => COURSE_ORDER.indexOf(a.groupId) - COURSE_ORDER.indexOf(b.groupId) || a.sortOrder - b.sortOrder);
  const rows = [...stage0].sort(
    (a, b) => COURSE_ORDER.indexOf(a.groupId) - COURSE_ORDER.indexOf(b.groupId) || a.sortOrder - b.sortOrder,
  );
  return { seq: 0, releasedAt: "", items: words, stage0: rows, audio: {} };
}
