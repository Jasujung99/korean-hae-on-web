// 교사 콘텐츠 운영 API (/api/teacher/content/*). 앞단 teacher 미들웨어가 교사 인증을 확인한다.
import { Hono, type Context } from "hono";
import { syllableAudioBase } from "../../content/core-table.ts";
import { COURSE_ORDER, GROUP_CHOICES, GROUP_LABELS, type GroupId } from "../../content/course-order.ts";
import { stageTitle } from "../../content/course.ts";
import {
  CONTENT_VOICES,
  PRACTICE_VOICES,
  isPracticeVoiceKey,
  practiceVoiceName,
  voicedAudioId,
  type PracticeVoiceKey,
} from "../../content/practice-voices.ts";
import {
  buildReleaseSnapshot,
  snapshotSentenceAudioBase,
  exampleSlots,
  isExtraExampleAudioId,
  MAX_EXAMPLES,
  snapshotStageKey,
  snapshotWordAudioBase,
  voiceLabelFromKey,
  type ContentStage,
  type ContentSubstage,
  type ReleaseCandidateAsset,
  type ReleaseCandidateItem,
} from "../../content/snapshot.ts";
import { turnsAudioId } from "../../content/tts/batch-plan.ts";
import { DAILY_TTS_LIMIT, ttsQuotaDay } from "../../content/tts/quota.ts";
import type { PreviewAudio } from "../preview/audio.ts";
import type {
  ContentAudioCell,
  ContentItemView,
  ContentProposalView,
  ContentReleaseStatusView,
  ContentStageSection,
  ContentStageZeroRow,
  ContentTurnsCell,
  DraftAudioReviewRow,
  TeacherContentView,
  TtsUsageView,
} from "../preview/contract.ts";
import type { AudioObjectStore } from "./audio-store.ts";
import { buildReadOnlyContentView, isGroupId } from "./read-only.ts";
import type {
  AudioAssetRow,
  ContentItemRow,
  ContentItemVersionRow,
  ContentProposalRow,
  ContentReleaseRow,
  ContentRepo,
  StageZeroRow,
  TtsUsageSummary,
} from "./repo.ts";
import type { SnapshotCache } from "./runtime.ts";
import { isMissingContentTableError } from "./supabase-repo.ts";
import { generateSingleTts } from "./tts-single.ts";

const JCJ_STAGE_KEYS = ["Stage 1-A", "Stage 1-B", "Stage 2", "Stage 3", "Stage 4", "Stage 5"] as const;
const OTHER_STAGE_KEYS = ["Stage 1", "Stage 2", "Stage 3", "Stage 4", "Stage 5"] as const;
const STAGES: readonly ContentStage[] = ["Stage 1", "Stage 2", "Stage 3", "Stage 4", "Stage 5"];

export type ContentTeacherVars = { Variables: { teacherId: string } };

export type ContentRoutesDeps = {
  contentRepo?: ContentRepo;
  fallbackAudio: PreviewAudio;
  audioStore?: AudioObjectStore;
  snapshotCache?: SnapshotCache;
  ttsApiKey: string | null;
  ttsFetcher?: typeof fetch;
  now: () => Date;
};

async function readBody(c: Context): Promise<Record<string, unknown> | null> {
  try {
    const parsed = (await c.req.json()) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function cleanText(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, max);
}

function parseStageAndSubstage(
  groupId: GroupId,
  rawStage: unknown,
  rawSubstage: unknown,
): { stage: ContentStage; substage: ContentSubstage } | null {
  if (rawStage === "Stage 1-A") {
    return groupId === "j_ch_jj" ? { stage: "Stage 1", substage: "1-A" } : { stage: "Stage 1", substage: null };
  }
  if (rawStage === "Stage 1-B") {
    return groupId === "j_ch_jj" ? { stage: "Stage 1", substage: "1-B" } : { stage: "Stage 1", substage: null };
  }
  if (typeof rawStage !== "string" || !(STAGES as readonly string[]).includes(rawStage)) return null;
  const stage = rawStage as ContentStage;
  if (groupId === "j_ch_jj" && stage === "Stage 1") {
    const sub = rawSubstage === "1-B" ? "1-B" : "1-A";
    return { stage, substage: sub };
  }
  return { stage, substage: null };
}

function assetTimestamp(asset: AudioAssetRow): number {
  const iso = asset.reviewedAt ?? asset.generatedAt ?? asset.createdAt;
  const parsed = Date.parse(iso);
  return Number.isFinite(parsed) ? parsed : 0;
}

function pickWinningAsset(candidates: readonly AudioAssetRow[]): AudioAssetRow | null {
  if (candidates.length === 0) return null;
  const drafts = candidates.filter((row) => row.status === "draft").sort((a, b) => assetTimestamp(b) - assetTimestamp(a));
  if (drafts[0]) return drafts[0];
  const approved = candidates.filter((row) => row.status === "approved").sort((a, b) => assetTimestamp(b) - assetTimestamp(a));
  return approved[0] ?? null;
}

function assetPlayUrl(asset: AudioAssetRow): string {
  return `/api/teacher/content/audio/${encodeURIComponent(asset.id)}`;
}

function toAudioCell(
  audioId: string,
  byAudioId: Map<string, AudioAssetRow[]>,
  fallbackByItemVoice?: Map<string, AudioAssetRow[]>,
  itemId?: string,
  kind?: "word" | "sentence",
  voiceKey?: string,
): ContentAudioCell {
  const exact = pickWinningAsset(byAudioId.get(audioId) ?? []);
  if (exact) {
    return {
      state: exact.stale ? "stale" : exact.status === "draft" ? "draft" : "approved",
      assetId: exact.id,
      audioId,
      playUrl: assetPlayUrl(exact),
      durationMs: exact.durationMs,
      generatedAt: exact.generatedAt ?? exact.createdAt,
      source: exact.source,
    };
  }
  if (fallbackByItemVoice && itemId && kind && voiceKey) {
    // 예문 2~5번 음원은 1번 예문의 '다시 만들어야 함' 자리로 쓰지 않는다.
    const byItem = pickWinningAsset(
      (fallbackByItemVoice.get(`${itemId}:${kind}:${voiceKey}`) ?? []).filter((asset) => !isExtraExampleAudioId(asset.audioId)),
    );
    if (byItem) {
      return {
        state: "stale",
        assetId: byItem.id,
        audioId: byItem.audioId,
        playUrl: assetPlayUrl(byItem),
        durationMs: byItem.durationMs,
        generatedAt: byItem.generatedAt ?? byItem.createdAt,
        source: byItem.source,
      };
    }
  }
  return {
    state: "missing",
    assetId: null,
    audioId,
    playUrl: null,
    durationMs: null,
    generatedAt: null,
    source: null,
  };
}

function itemSemanticKey(word: {
  id: string;
  legacyId: string | null;
  groupId: string;
  stage: string;
  substage: string | null;
  consonant: string;
  word: string;
  pos: string;
  gloss: string;
  scene: string;
  example: string;
  related: string;
  note: string;
}): string {
  return JSON.stringify([
    word.groupId,
    word.stage,
    word.substage,
    word.consonant,
    word.word,
    word.pos,
    word.gloss,
    word.scene,
    word.example,
    word.related,
    word.note,
  ]);
}

export function computeReleaseStatus(
  allItems: readonly ContentItemRow[],
  allStage0: readonly StageZeroRow[],
  allAssets: readonly AudioAssetRow[],
  latestRelease: ContentReleaseRow | null,
  nowIso: string,
): ContentReleaseStatusView {
  const visibleItems = allItems.filter((row) => row.status !== "hidden");
  const draftItemCount = visibleItems.filter((row) => row.status === "draft").length;

  const activeAssets = allAssets.filter((row) => row.status === "draft" || row.status === "approved");
  const draftAudioCount = activeAssets.filter((row) => row.status === "draft").length;
  const staleAudioCount = activeAssets.filter((row) => row.stale).length;

  const next = buildReleaseSnapshot(
    visibleItems as ReleaseCandidateItem[],
    allStage0,
    allAssets as readonly ReleaseCandidateAsset[],
    (latestRelease?.seq ?? 0) + 1,
    nowIso,
  );

  let unpublishedApprovedCount = 0;
  if (!latestRelease) {
    unpublishedApprovedCount = next.itemCount + next.audioCount;
  } else {
    const prevItems = new Map<string, string>();
    for (const prev of latestRelease.snapshot.items) {
      prevItems.set(prev.legacyId ?? prev.id, itemSemanticKey(prev));
    }
    const nextKeys = new Set<string>();
    for (const item of next.snapshot.items) {
      const key = item.legacyId ?? item.id;
      nextKeys.add(key);
      if (prevItems.get(key) !== itemSemanticKey(item)) unpublishedApprovedCount += 1;
    }
    for (const key of prevItems.keys()) {
      if (!nextKeys.has(key)) unpublishedApprovedCount += 1;
    }

    const prevAudio = latestRelease.snapshot.audio;
    const nextAudio = next.snapshot.audio;
    for (const [audioId, entry] of Object.entries(nextAudio)) {
      if (prevAudio[audioId]?.assetId !== entry.assetId) unpublishedApprovedCount += 1;
    }
    for (const audioId of Object.keys(prevAudio)) {
      if (!nextAudio[audioId]) unpublishedApprovedCount += 1;
    }
  }

  return {
    latestSeq: latestRelease?.seq ?? null,
    latestReleasedAt: latestRelease?.releasedAt ?? null,
    latestNote: latestRelease?.note ?? null,
    pendingReviewCount: draftItemCount + draftAudioCount,
    draftItemCount,
    draftAudioCount,
    staleAudioCount,
    unpublishedApprovedCount,
    nextItemCount: next.itemCount,
    nextAudioCount: next.audioCount,
  };
}

function toProposalView(row: ContentProposalRow): ContentProposalView {
  return {
    id: row.id,
    itemId: row.itemId,
    kind: row.kind,
    fields: { ...row.fields },
    sense: row.sense,
    flags: [...row.flags],
    source: row.source,
    model: row.model,
    promptVersion: row.promptVersion,
    status: row.status,
    createdAt: row.createdAt,
  };
}

function buildDbContentView(
  groupId: GroupId,
  allItems: readonly ContentItemRow[],
  allStage0: readonly StageZeroRow[],
  allAssets: readonly AudioAssetRow[],
  latestRelease: ContentReleaseRow | null,
  ttsReady: boolean,
  nowIso: string,
  pendingProposals: readonly ContentProposalRow[] = [],
): TeacherContentView {
  const visibleItems = allItems.filter((item) => item.status !== "hidden");
  const proposalByItemId = new Map<string, ContentProposalRow>();
  for (const proposal of pendingProposals) {
    if (proposal.status === "pending") proposalByItemId.set(proposal.itemId, proposal);
  }

  const byAudioId = new Map<string, AudioAssetRow[]>();
  const byItemVoice = new Map<string, AudioAssetRow[]>();
  for (const asset of allAssets) {
    if (asset.status === "rejected" || asset.status === "superseded") continue;
    const list = byAudioId.get(asset.audioId) ?? [];
    list.push(asset);
    byAudioId.set(asset.audioId, list);
    if (asset.itemId && (asset.kind === "word" || asset.kind === "sentence")) {
      const key = `${asset.itemId}:${asset.kind}:${asset.voiceKey}`;
      const itemList = byItemVoice.get(key) ?? [];
      itemList.push(asset);
      byItemVoice.set(key, itemList);
    }
  }

  const groupItems = visibleItems.filter((item) => item.groupId === groupId);
  const groupStage0 = allStage0.filter((row) => row.groupId === groupId);
  const stage0Rows: ContentStageZeroRow[] = [
    ...groupStage0
      .filter((row) => row.kind === "pseudoword")
      .map((row) => {
        const base = syllableAudioBase(row.stimulus);
        const audio: Record<string, ContentAudioCell> = {};
        for (const voice of CONTENT_VOICES) {
          audio[voice.key] = toAudioCell(voicedAudioId(base, voice.key), byAudioId);
        }
        return {
          id: row.id,
          groupId: row.groupId,
          kind: "pseudoword" as const,
          consonant: row.consonant,
          stimulus: row.stimulus,
          word: row.word,
          context: row.context,
          audio,
        };
      }),
    ...groupStage0
      .filter((row) => row.kind === "cell" && row.context !== "medial_vcv")
      .map((row) => {
        let base = syllableAudioBase(row.stimulus);
        if (row.word && row.stimulus === row.word) {
          const matched = groupItems.find((item) => item.word === row.word);
          base = matched ? snapshotWordAudioBase(matched) : `word-0-${row.word}`;
        }
        const audio: Record<string, ContentAudioCell> = {};
        for (const voice of CONTENT_VOICES) {
          audio[voice.key] = toAudioCell(voicedAudioId(base, voice.key), byAudioId);
        }
        return {
          id: row.id,
          groupId: row.groupId,
          kind: "cell" as const,
          consonant: row.consonant,
          stimulus: row.stimulus,
          word: row.word,
          context: row.context,
          audio,
        };
      }),
  ];

  // Stage 0 음원 초안 검수 목록(같은 음원이 두 칸에 나와도 한 번만)
  const stage0DraftAudios: DraftAudioReviewRow[] = [];
  const seenStage0Drafts = new Set<string>();
  for (const row of stage0Rows) {
    for (const voice of CONTENT_VOICES) {
      const cell = row.audio[voice.key];
      if (!cell?.assetId || cell.state !== "draft" || seenStage0Drafts.has(cell.assetId)) continue;
      seenStage0Drafts.add(cell.assetId);
      const asset = allAssets.find((a) => a.id === cell.assetId);
      stage0DraftAudios.push({
        assetId: cell.assetId,
        audioId: cell.audioId,
        itemId: asset?.itemId ?? null,
        word: row.stimulus,
        kind: row.kind === "pseudoword" ? "pseudo" : "syllable",
        voiceKey: voice.key,
        voiceLabel: voiceLabelFromKey(voice.key),
        durationMs: cell.durationMs,
        generatedAt: cell.generatedAt ?? asset?.createdAt ?? "",
        playUrl: cell.playUrl,
      });
    }
  }

  const stageKeys = groupId === "j_ch_jj" ? JCJ_STAGE_KEYS : OTHER_STAGE_KEYS;
  const stages: ContentStageSection[] = stageKeys.map((key) => {
    const itemsInStage = groupItems.filter((item) => snapshotStageKey(item) === key);
    const seenDraftAssets = new Set<string>();
    const draftAudios: DraftAudioReviewRow[] = [];

    const itemViews: ContentItemView[] = itemsInStage.map((item) => {
      const wordBase = snapshotWordAudioBase(item);

      const wordAudio: Record<string, ContentAudioCell> = {};
      for (const voice of CONTENT_VOICES) {
        const cell = toAudioCell(voicedAudioId(wordBase, voice.key), byAudioId, byItemVoice, item.id, "word", voice.key);
        wordAudio[voice.key] = cell;
        if (cell.assetId) {
          const asset = allAssets.find((a) => a.id === cell.assetId);
          if (asset?.status === "draft" && !seenDraftAssets.has(asset.id)) {
            seenDraftAssets.add(asset.id);
            draftAudios.push({
              assetId: asset.id,
              audioId: asset.audioId,
              itemId: item.id,
              word: item.word,
              kind: "word",
              voiceKey: voice.key,
              voiceLabel: voiceLabelFromKey(voice.key),
              durationMs: asset.durationMs,
              generatedAt: asset.generatedAt ?? asset.createdAt,
              playUrl: cell.playUrl,
            });
          }
        }
      }

      // 예문 1~5번. 1번은 예전 id라 글자가 바뀐 옛 음원을 '다시 만들어야 함'으로 보여 줄 수 있고(fallback),
      // 2~5번은 글자 해시 id라 그럴 필요가 없다.
      const exampleViews = exampleSlots(item).map((slot) => {
        const audio: Record<string, ContentAudioCell> = {};
        const turns: Record<string, ContentTurnsCell> = {};
        for (const voice of CONTENT_VOICES) {
          const cell = toAudioCell(
            voicedAudioId(slot.audioBase, voice.key),
            byAudioId,
            slot.index === 1 ? byItemVoice : undefined,
            item.id,
            "sentence",
            voice.key,
          );
          audio[voice.key] = cell;
          if (cell.assetId) {
            const asset = allAssets.find((a) => a.id === cell.assetId);
            if (asset?.status === "draft" && !seenDraftAssets.has(asset.id)) {
              seenDraftAssets.add(asset.id);
              draftAudios.push({
                assetId: asset.id,
                audioId: asset.audioId,
                itemId: item.id,
                word: item.word,
                kind: "sentence",
                exampleIndex: slot.index,
                voiceKey: voice.key,
                voiceLabel: voiceLabelFromKey(voice.key),
                durationMs: asset.durationMs,
                generatedAt: asset.generatedAt ?? asset.createdAt,
                playUrl: cell.playUrl,
              });
            }
          }
          const turnsAsset = pickWinningAsset(byAudioId.get(turnsAudioId(voicedAudioId(slot.audioBase, voice.key))) ?? []);
          turns[voice.key] = turnsAsset
            ? {
                ready: true,
                state: turnsAsset.stale ? "stale" : turnsAsset.status === "draft" ? "draft" : "approved",
                playUrl: assetPlayUrl(turnsAsset),
                assetId: turnsAsset.id,
                durationMs: turnsAsset.durationMs,
              }
            : { ready: false, playUrl: null, assetId: null, durationMs: null };
          if (turnsAsset?.status === "draft" && !seenDraftAssets.has(turnsAsset.id)) {
            seenDraftAssets.add(turnsAsset.id);
            draftAudios.push({
              assetId: turnsAsset.id,
              audioId: turnsAsset.audioId,
              itemId: item.id,
              word: item.word,
              kind: "sentence_turns",
              exampleIndex: slot.index,
              voiceKey: voice.key,
              voiceLabel: voiceLabelFromKey(voice.key),
              durationMs: turnsAsset.durationMs,
              generatedAt: turnsAsset.generatedAt ?? turnsAsset.createdAt,
              playUrl: assetPlayUrl(turnsAsset),
            });
          }
        }
        return { index: slot.index, text: slot.text, audio, turnsAudio: turns };
      });
      const firstExample = exampleViews.find((row) => row.index === 1) ?? null;
      const exampleAudio = firstExample?.audio ?? null;
      const turnsAudio = firstExample?.turnsAudio ?? null;

      const proposalRow = proposalByItemId.get(item.id);
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
        extraExamples: exampleViews.filter((row) => row.index > 1),
        related: item.related,
        note: item.note,
        sortOrder: item.sortOrder,
        source: item.source,
        status: item.status,
        wordAudio,
        exampleAudio,
        turnsAudio,
        proposal: proposalRow ? toProposalView(proposalRow) : null,
      };
    });

    return {
      key,
      title: stageTitle(key),
      totalCount: itemViews.length,
      approvedCount: itemViews.filter((item) => item.status === "approved").length,
      draftCount: itemViews.filter((item) => item.status === "draft").length,
      items: itemViews,
      draftAudios,
    };
  });

  const totalProposalCount = visibleItems.filter((item) => proposalByItemId.has(item.id)).length;

  return {
    groups: COURSE_ORDER.map((id) => ({
      id,
      label: GROUP_LABELS[id],
      choices: [...GROUP_CHOICES[id]],
      count: visibleItems.filter((item) => item.groupId === id).length,
      proposalCount: visibleItems.filter((item) => item.groupId === id && proposalByItemId.has(item.id)).length,
    })),
    totalProposalCount,
    group: {
      id: groupId,
      label: GROUP_LABELS[groupId],
      choices: [...GROUP_CHOICES[groupId]],
    },
    stage0: stage0Rows,
    stage0DraftAudios,
    stages,
    release: computeReleaseStatus(allItems, allStage0, allAssets, latestRelease, nowIso),
    ttsReady,
    writable: true,
  };
}

function toUsageView(quotaDay: string, summary: TtsUsageSummary, ttsReady: boolean): TtsUsageView {
  return {
    quotaDay,
    limit: DAILY_TTS_LIMIT,
    used: summary.total,
    remaining: Math.max(0, DAILY_TTS_LIMIT - summary.total),
    bySource: { ui_single: summary.uiSingle, pc_batch: summary.pcBatch },
    ttsReady,
  };
}

function voiceSuffixesForBase(base: string, includeTurns: boolean): string[] {
  const out = [base];
  for (const voice of PRACTICE_VOICES) {
    const voiced = voicedAudioId(base, voice.key);
    out.push(voiced);
    if (includeTurns) out.push(turnsAudioId(voiced));
  }
  return out;
}

const EDITABLE_TEXT_LIMITS = [
  ["pos", 40],
  ["gloss", 400],
  ["scene", 200],
  ["example", 400],
  ["related", 200],
  ["note", 200],
] as const;

type EditablePatchResult =
  | { ok: true; patch: Record<string, unknown>; changedFields: string[] }
  | { ok: false; error: "word_required" | "invalid_consonant" | "invalid_stage" | "example_required" | "duplicate_example" | "invalid_extra_examples" | "too_many_examples" };

function parseEditablePatch(existing: ContentItemRow, body: Record<string, unknown>): EditablePatchResult {
  const patch: Record<string, unknown> = {};
  const changedFields: string[] = [];

  if ("word" in body) {
    const nextWord = cleanText(body.word, 80);
    if (!nextWord) return { ok: false, error: "word_required" };
    if (nextWord !== existing.word) {
      patch.word = nextWord;
      changedFields.push("word");
    }
  }
  if ("consonant" in body) {
    const nextConsonant = cleanText(body.consonant, 8);
    if (!GROUP_CHOICES[existing.groupId].includes(nextConsonant)) return { ok: false, error: "invalid_consonant" };
    if (nextConsonant !== existing.consonant) {
      patch.consonant = nextConsonant;
      changedFields.push("consonant");
    }
  }
  if ("stage" in body || "substage" in body) {
    const nextStageInfo = parseStageAndSubstage(
      existing.groupId,
      "stage" in body ? body.stage : existing.stage,
      "substage" in body ? body.substage : existing.substage,
    );
    if (!nextStageInfo) return { ok: false, error: "invalid_stage" };
    if (nextStageInfo.stage !== existing.stage) {
      patch.stage = nextStageInfo.stage;
      changedFields.push("stage");
    }
    if (nextStageInfo.substage !== existing.substage) {
      patch.substage = nextStageInfo.substage;
      changedFields.push("substage");
    }
  }

  for (const [field, limit] of EDITABLE_TEXT_LIMITS) {
    if (!(field in body)) continue;
    const raw = field === "related" && Array.isArray(body[field]) ? body[field].map(String).join(", ") : body[field];
    const val = cleanText(raw, limit);
    if (val !== existing[field]) {
      patch[field] = val;
      changedFields.push(field);
    }
  }

  if ("extraExamples" in body) {
    const parsed = parseExtraExamples(body.extraExamples);
    if (!parsed.ok) return { ok: false, error: parsed.error };
    const nextExample = "example" in patch ? String(patch.example) : existing.example;
    if (parsed.values.length > 0 && !nextExample.trim()) return { ok: false, error: "example_required" };
    if (parsed.values.includes(nextExample.trim())) return { ok: false, error: "duplicate_example" };
    const before = existing.extraExamples ?? [];
    if (parsed.values.length !== before.length || parsed.values.some((value, index) => value !== before[index])) {
      patch.extraExamples = parsed.values;
      changedFields.push("extraExamples");
    }
  }

  return { ok: true, patch, changedFields };
}

/** 예문 2~5번: 문자열 배열, 빈 칸은 빼고, 최대 4개, 같은 문장 반복 금지 */
function parseExtraExamples(raw: unknown): { ok: true; values: string[] } | { ok: false; error: "invalid_extra_examples" | "too_many_examples" | "duplicate_example" } {
  if (!Array.isArray(raw)) return { ok: false, error: "invalid_extra_examples" };
  const values = raw.map((value) => cleanText(value, 400)).filter(Boolean);
  if (values.length > MAX_EXAMPLES - 1) return { ok: false, error: "too_many_examples" };
  if (new Set(values).size !== values.length) return { ok: false, error: "duplicate_example" };
  return { ok: true, values };
}

async function applyItemPatchAndMarkStale(
  repo: ContentRepo,
  existing: ContentItemRow,
  patch: Record<string, unknown>,
  changedFields: string[],
  reason: string | null,
  editedBy: string | null,
) {
  const updated = await repo.updateItem(existing.id, patch, {
    changedFields,
    reason,
    editedBy,
  });
  if (!updated) return null;

  let staleMarked = 0;
  const wordChanged = changedFields.includes("word");
  const exampleChanged = changedFields.includes("example");
  if (wordChanged || exampleChanged) {
    const allActiveItems = await repo.listItems({ includeHidden: false });
    const others = allActiveItems.filter((row) => row.id !== existing.id);

    if (wordChanged) {
      const oldWordBase = snapshotWordAudioBase(existing);
      const sharedWordExists = others.some(
        (other) => snapshotWordAudioBase(other) === oldWordBase && other.word === existing.word,
      );
      staleMarked += await repo.markAudioStale({
        itemIds: [existing.id],
        kinds: ["word"],
        ...(sharedWordExists
          ? {}
          : {
              audioIds: [
                ...voiceSuffixesForBase(oldWordBase, false),
                ...(existing.entryId !== null && existing.stage === "Stage 1"
                  ? [`word-Stage1-${existing.entryId}-${existing.word}`]
                  : []),
              ],
              attachItemId: existing.id,
            }),
      });
    }

    if (exampleChanged && existing.example.trim().length > 0) {
      const oldSentenceBase = snapshotSentenceAudioBase(existing);
      const sharedSentenceExists = others.some(
        (other) => snapshotSentenceAudioBase(other) === oldSentenceBase && other.example === existing.example,
      );
      staleMarked += await repo.markAudioStale({
        itemIds: [existing.id],
        kinds: ["sentence", "sentence_turns"],
        ...(sharedSentenceExists
          ? {}
          : {
              audioIds: [
                ...voiceSuffixesForBase(oldSentenceBase, true),
                ...(existing.entryId !== null && existing.stage === "Stage 1"
                  ? [`sentence-Stage1-${existing.entryId}-${existing.word}`]
                  : []),
              ],
              attachItemId: existing.id,
            }),
      });
    }
  }

  return {
    item: updated.item,
    version: updated.version,
    changedFields,
    staleMarked,
  };
}

/**
 * 제안 하나를 적용한다. 화면 API와 일괄 적용 스크립트(scripts/content-proposals-apply.ts)가 같이 쓴다.
 * overrides에 든 칸은 제안 값 대신 쓴다(교사가 고친 값). 판 기록 이유는 `ai_draft · 모델 · 지시문 판[ · 추가 이유]`.
 */
export async function applyContentProposal(
  repo: ContentRepo,
  proposalId: string,
  overrides: Record<string, unknown>,
  decidedBy: string,
): Promise<
  | { ok: false; status: 400 | 404 | 409; error: string }
  | {
      ok: true;
      item: ContentItemRow;
      version: ContentItemVersionRow | null;
      changedFields: string[];
      staleMarked: number;
      proposal: ContentProposalRow | null;
    }
> {
  const proposal = await repo.getProposal(proposalId);
  if (!proposal) return { ok: false, status: 404, error: "not_found" };
  if (proposal.status !== "pending") return { ok: false, status: 409, error: "proposal_not_pending" };
  const existing = await repo.getItem(proposal.itemId);
  if (!existing || existing.status === "hidden") return { ok: false, status: 404, error: "not_found" };

  const mergedFields: Record<string, unknown> = { ...proposal.fields };
  for (const field of ["word", "consonant", "stage", "substage", "pos", "gloss", "scene", "example", "related", "note"] as const) {
    if (field in overrides) mergedFields[field] = overrides[field];
  }
  const parsed = parseEditablePatch(existing, mergedFields);
  if (!parsed.ok) return { ok: false, status: 400, error: parsed.error };

  const baseReason = `${proposal.source} · ${proposal.model} · ${proposal.promptVersion}`;
  const extraReason = cleanText(overrides.reason, 120);
  const reason = extraReason ? `${baseReason} · ${extraReason}` : baseReason;

  let item = existing;
  let version: ContentItemVersionRow | null = null;
  let staleMarked = 0;
  if (parsed.changedFields.length > 0) {
    const applied = await applyItemPatchAndMarkStale(repo, existing, parsed.patch, parsed.changedFields, reason, decidedBy);
    if (!applied) return { ok: false, status: 404, error: "not_found" };
    item = applied.item;
    version = applied.version;
    staleMarked = applied.staleMarked;
  }
  const decided = await repo.decideProposal(proposal.id, "applied", decidedBy);
  return { ok: true, item, version, changedFields: parsed.changedFields, staleMarked, proposal: decided };
}

export function createContentRoutes(deps: ContentRoutesDeps) {
  const app = new Hono<ContentTeacherVars>();
  const ttsReady = Boolean(deps.ttsApiKey);

  app.get("/", async (c) => {
    const rawGroup = c.req.query("group") ?? "j_ch_jj";
    if (!isGroupId(rawGroup)) return c.json({ error: "unknown_group" }, 400);
    if (!deps.contentRepo) {
      return c.json(buildReadOnlyContentView(rawGroup, deps.fallbackAudio, ttsReady));
    }
    try {
      const [allItems, allStage0, allAssets, latestRelease, pendingProposals] = await Promise.all([
        deps.contentRepo.listItems({ includeHidden: true }),
        deps.contentRepo.listStageZero(),
        deps.contentRepo.listAudioAssets(),
        deps.contentRepo.latestRelease(),
        deps.contentRepo
          .listProposals({ status: "pending" })
          .catch((err) => (isMissingContentTableError(err) ? [] : Promise.reject(err))),
      ]);
      if (allItems.length === 0 && allStage0.length === 0 && !latestRelease) {
        return c.json(buildReadOnlyContentView(rawGroup, deps.fallbackAudio, ttsReady));
      }
      return c.json(
        buildDbContentView(
          rawGroup,
          allItems,
          allStage0,
          allAssets,
          latestRelease,
          ttsReady,
          deps.now().toISOString(),
          pendingProposals,
        ),
      );
    } catch (error) {
      if (isMissingContentTableError(error)) {
        return c.json(buildReadOnlyContentView(rawGroup, deps.fallbackAudio, ttsReady));
      }
      throw error;
    }
  });

  app.get("/usage", async (c) => {
    const quotaDay = ttsQuotaDay(deps.now());
    if (!deps.contentRepo) {
      const empty: TtsUsageView = {
        quotaDay,
        limit: DAILY_TTS_LIMIT,
        used: 0,
        remaining: DAILY_TTS_LIMIT,
        bySource: { ui_single: 0, pc_batch: 0 },
        ttsReady,
      };
      return c.json(empty);
    }
    try {
      const summary = await deps.contentRepo.ttsUsageSummary(quotaDay);
      const view: TtsUsageView = {
        quotaDay,
        limit: DAILY_TTS_LIMIT,
        used: summary.total,
        remaining: Math.max(0, DAILY_TTS_LIMIT - summary.total),
        bySource: { ui_single: summary.uiSingle, pc_batch: summary.pcBatch },
        ttsReady,
      };
      return c.json(view);
    } catch (error) {
      if (isMissingContentTableError(error)) {
        return c.json<TtsUsageView>({
          quotaDay,
          limit: DAILY_TTS_LIMIT,
          used: 0,
          remaining: DAILY_TTS_LIMIT,
          bySource: { ui_single: 0, pc_batch: 0 },
          ttsReady,
        });
      }
      throw error;
    }
  });

  app.get("/audio/:assetId", async (c) => {
    if (!deps.contentRepo || !deps.audioStore) return c.json({ error: "not_found" }, 404);
    const asset = await deps.contentRepo.getAudioAsset(c.req.param("assetId"));
    if (!asset) return c.json({ error: "not_found" }, 404);
    const got = await deps.audioStore.get(asset.storage, asset.objectKey, asset.audioId);
    if (!got || got.bytes.length === 0) return c.json({ error: "audio_not_ready" }, 404);
    return c.body(got.bytes.slice().buffer, 200, {
      "content-type": got.mime ?? asset.mime,
      "cache-control": "private, no-store",
    });
  });

  app.post("/items", async (c) => {
    if (!deps.contentRepo) return c.json({ error: "db_not_configured" }, 503);
    const body = await readBody(c);
    if (!body) return c.json({ error: "invalid_body" }, 400);
    if (!isGroupId(body.groupId)) return c.json({ error: "invalid_group" }, 400);
    const groupId = body.groupId;
    const stageInfo = parseStageAndSubstage(groupId, body.stage, body.substage);
    if (!stageInfo) return c.json({ error: "invalid_stage" }, 400);
    const consonant = cleanText(body.consonant, 8);
    if (!GROUP_CHOICES[groupId].includes(consonant)) return c.json({ error: "invalid_consonant" }, 400);
    const word = cleanText(body.word, 80);
    if (!word) return c.json({ error: "word_required" }, 400);

    const item = await deps.contentRepo.createItem({
      legacyId: null,
      groupId,
      stage: stageInfo.stage,
      substage: stageInfo.substage,
      consonant,
      word,
      entryId: null,
      pos: cleanText(body.pos, 40),
      gloss: cleanText(body.gloss, 400),
      scene: cleanText(body.scene, 200),
      example: cleanText(body.example, 400),
      extraExamples: (() => {
        const parsed = parseExtraExamples(body.extraExamples ?? []);
        return parsed.ok && cleanText(body.example, 400) ? parsed.values : [];
      })(),
      related: cleanText(body.related, 200),
      note: cleanText(body.note, 200),
      source: "teacher",
      status: "draft",
      createdBy: c.get("teacherId"),
    });
    return c.json({ item }, 201);
  });

  app.patch("/items/:id", async (c) => {
    if (!deps.contentRepo) return c.json({ error: "db_not_configured" }, 503);
    const existing = await deps.contentRepo.getItem(c.req.param("id"));
    if (!existing) return c.json({ error: "not_found" }, 404);
    const body = await readBody(c);
    if (!body) return c.json({ error: "invalid_body" }, 400);

    const parsed = parseEditablePatch(existing, body);
    if (!parsed.ok) return c.json({ error: parsed.error }, 400);

    if (parsed.changedFields.length === 0) {
      return c.json({ item: existing, version: null, changedFields: [], staleMarked: 0 });
    }

    const reason = cleanText(body.reason, 200) || null;
    const result = await applyItemPatchAndMarkStale(
      deps.contentRepo,
      existing,
      parsed.patch,
      parsed.changedFields,
      reason,
      c.get("teacherId"),
    );
    if (!result) return c.json({ error: "not_found" }, 404);

    return c.json(result);
  });

  app.post("/proposals/:id/apply", async (c) => {
    if (!deps.contentRepo) return c.json({ error: "db_not_configured" }, 503);
    const body = (await readBody(c)) ?? {};
    const result = await applyContentProposal(deps.contentRepo, c.req.param("id"), body, c.get("teacherId"));
    if (!result.ok) return c.json({ error: result.error }, result.status);
    return c.json({
      item: result.item,
      version: result.version,
      changedFields: result.changedFields,
      staleMarked: result.staleMarked,
      proposal: result.proposal ? toProposalView(result.proposal) : null,
    });
  });

  app.post("/proposals/:id/dismiss", async (c) => {
    if (!deps.contentRepo) return c.json({ error: "db_not_configured" }, 503);
    const proposal = await deps.contentRepo.getProposal(c.req.param("id"));
    if (!proposal) return c.json({ error: "not_found" }, 404);
    if (proposal.status !== "pending") return c.json({ error: "proposal_not_pending" }, 409);

    const decided = await deps.contentRepo.decideProposal(proposal.id, "dismissed", c.get("teacherId"));
    return c.json({ proposal: decided ? toProposalView(decided) : null });
  });

  app.get("/items/:id/versions", async (c) => {
    if (!deps.contentRepo) return c.json({ error: "db_not_configured" }, 503);
    const existing = await deps.contentRepo.getItem(c.req.param("id"));
    if (!existing) return c.json({ error: "not_found" }, 404);
    const versions = await deps.contentRepo.listItemVersions(existing.id);
    return c.json({ versions });
  });

  app.post("/items/:id/approve", async (c) => {
    if (!deps.contentRepo) return c.json({ error: "db_not_configured" }, 503);
    const existing = await deps.contentRepo.getItem(c.req.param("id"));
    if (!existing || existing.status === "hidden") return c.json({ error: "not_found" }, 404);
    if (existing.status === "approved") return c.json({ item: existing });
    const updated = await deps.contentRepo.updateItem(
      existing.id,
      { status: "approved" },
      { changedFields: ["status"], reason: "승인", editedBy: c.get("teacherId") },
    );
    return c.json({ item: updated?.item ?? existing });
  });

  app.post("/items/:id/hide", async (c) => {
    if (!deps.contentRepo) return c.json({ error: "db_not_configured" }, 503);
    const existing = await deps.contentRepo.getItem(c.req.param("id"));
    if (!existing) return c.json({ error: "not_found" }, 404);
    const body = await readBody(c);
    const reason = cleanText(body?.reason, 200) || "숨기기";
    if (existing.status === "hidden") return c.json({ item: existing });
    const updated = await deps.contentRepo.updateItem(
      existing.id,
      { status: "hidden" },
      { changedFields: ["status"], reason, editedBy: c.get("teacherId") },
    );
    return c.json({ item: updated?.item ?? existing });
  });

  app.post("/items/:id/audio", async (c) => {
    if (!deps.contentRepo || !deps.audioStore) return c.json({ error: "db_not_configured" }, 503);
    const item = await deps.contentRepo.getItem(c.req.param("id"));
    if (!item || item.status === "hidden") return c.json({ error: "not_found" }, 404);
    const body = await readBody(c);
    if (!body) return c.json({ error: "invalid_body" }, 400);
    const kind = body.kind;
    if (kind !== "word" && kind !== "sentence" && kind !== "sentence_turns") return c.json({ error: "invalid_kind" }, 400);
    if (!isPracticeVoiceKey(body.voice)) return c.json({ error: "invalid_voice" }, 400);
    const voice = body.voice;

    // 예문은 몇 번 예문인지(1~5, 기본 1)를 받는다.
    // 또박또박(sentence_turns)도 예문 칸 하나를 읽는다.
    const isExample = kind !== "word";
    const exampleIndex = isExample ? Number(body.exampleIndex ?? 1) : 1;
    const slot = isExample ? (exampleSlots(item).find((row) => row.index === exampleIndex) ?? null) : null;
    const text = (kind === "word" ? item.word : (slot?.text ?? "")).trim();
    if (!text) {
      return c.json(
        {
          error: isExample ? "example_required" : "empty_text",
          message: isExample ? "예문을 먼저 써 주세요." : "단어를 먼저 써 주세요.",
        },
        400,
      );
    }

    if (!deps.ttsApiKey) {
      return c.json({ error: "tts_not_configured", message: "생성 준비 안 됨" }, 503);
    }

    const quotaDay = ttsQuotaDay(deps.now());
    const summary = await deps.contentRepo.ttsUsageSummary(quotaDay);
    if (summary.total >= DAILY_TTS_LIMIT) {
      return c.json(
        {
          error: "daily_quota_exceeded",
          message: "오늘 한도를 다 썼어요. 오후 5시에 다시 열려요.",
          usage: toUsageView(quotaDay, summary, ttsReady),
        },
        409,
      );
    }

    const result = await generateSingleTts({
      text,
      kind,
      voiceKey: voice,
      apiKey: deps.ttsApiKey,
      fetcher: deps.ttsFetcher,
    });

    await deps.contentRepo.recordTtsUsage({
      at: deps.now().toISOString(),
      quotaDay,
      source: "ui_single",
      voiceKey: voice,
      kind,
      itemId: item.id,
      ok: result.ok,
      errorCode: result.ok ? null : result.errorCode,
    });

    const nextSummary = await deps.contentRepo.ttsUsageSummary(quotaDay);
    const usage = toUsageView(quotaDay, nextSummary, ttsReady);

    if (!result.ok) {
      return c.json({ error: result.errorCode, message: result.message, usage }, result.status);
    }

    const base = kind === "word" || !slot ? snapshotWordAudioBase(item) : slot.audioBase;
    const audioId = kind === "sentence_turns" ? turnsAudioId(voicedAudioId(base, voice)) : voicedAudioId(base, voice);
    const draftKeyId = crypto.randomUUID();
    const generatedAt = deps.now().toISOString();
    const stored = await deps.audioStore.putDraft(audioId, draftKeyId, result.bytes, {
      id: audioId,
      kind,
      text,
      voice: practiceVoiceName(voice),
      model: result.model,
      settings: result.settings,
      storedMime: result.mime,
      sha256: result.sha256,
      byteLength: result.bytes.length,
      generatedAt,
    });

    await deps.contentRepo.supersedeDrafts(audioId);
    const asset = await deps.contentRepo.insertAudioAsset({
      audioId,
      itemId: item.id,
      kind,
      voiceKey: voice,
      storage: stored.storage,
      objectKey: stored.objectKey,
      mime: result.mime,
      bytes: result.bytes.length,
      durationMs: result.durationMs,
      sha256: result.sha256,
      status: "draft",
      stale: false,
      source: "ui_single",
      model: result.model,
      stylePrompt: result.stylePrompt,
      settings: result.settings,
      text,
      generatedAt,
    });

    return c.json(
      {
        asset: { ...asset, playUrl: assetPlayUrl(asset) },
        usage,
      },
      201,
    );
  });

  app.post("/audio/:assetId/approve", async (c) => {
    if (!deps.contentRepo) return c.json({ error: "db_not_configured" }, 503);
    const existing = await deps.contentRepo.getAudioAsset(c.req.param("assetId"));
    if (!existing) return c.json({ error: "not_found" }, 404);
    const updated = await deps.contentRepo.reviewAudioAsset(existing.id, "approved", c.get("teacherId"));
    return c.json({ asset: updated ?? existing });
  });

  app.post("/audio/:assetId/reject", async (c) => {
    if (!deps.contentRepo) return c.json({ error: "db_not_configured" }, 503);
    const existing = await deps.contentRepo.getAudioAsset(c.req.param("assetId"));
    if (!existing) return c.json({ error: "not_found" }, 404);
    const updated = await deps.contentRepo.reviewAudioAsset(existing.id, "rejected", c.get("teacherId"));
    return c.json({ asset: updated ?? existing });
  });

  app.get("/release-status", async (c) => {
    if (!deps.contentRepo) return c.json({ error: "db_not_configured" }, 503);
    const [allItems, allStage0, allAssets, latestRelease] = await Promise.all([
      deps.contentRepo.listItems({ includeHidden: true }),
      deps.contentRepo.listStageZero(),
      deps.contentRepo.listAudioAssets(),
      deps.contentRepo.latestRelease(),
    ]);
    return c.json(computeReleaseStatus(allItems, allStage0, allAssets, latestRelease, deps.now().toISOString()));
  });

  app.post("/releases", async (c) => {
    if (!deps.contentRepo) return c.json({ error: "db_not_configured" }, 503);
    const body = await readBody(c);
    const note = cleanText(body?.note, 200) || null;
    const nowIso = deps.now().toISOString();
    const [allItems, allStage0, allAssets, latestRelease] = await Promise.all([
      deps.contentRepo.listItems({ includeHidden: true }),
      deps.contentRepo.listStageZero(),
      deps.contentRepo.listAudioAssets(),
      deps.contentRepo.latestRelease(),
    ]);
    const visibleItems = allItems.filter((row) => row.status !== "hidden");
    const { snapshot, itemCount, audioCount } = buildReleaseSnapshot(
      visibleItems as ReleaseCandidateItem[],
      allStage0,
      allAssets as readonly ReleaseCandidateAsset[],
      (latestRelease?.seq ?? 0) + 1,
      nowIso,
    );
    const release = await deps.contentRepo.createRelease({
      releasedBy: c.get("teacherId"),
      note,
      snapshot,
      itemCount,
      audioCount,
    });
    deps.snapshotCache?.invalidate();
    const status = computeReleaseStatus(allItems, allStage0, allAssets, release, nowIso);
    return c.json(
      {
        release: {
          seq: release.seq,
          releasedAt: release.releasedAt,
          note: release.note,
          itemCount: release.itemCount,
          audioCount: release.audioCount,
        },
        status,
      },
      201,
    );
  });

  return app;
}

export function isValidPracticeVoice(value: unknown): value is PracticeVoiceKey {
  return isPracticeVoiceKey(value);
}
