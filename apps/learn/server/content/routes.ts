// 교사 콘텐츠 운영 API (/api/teacher/content/*). 앞단 teacher 미들웨어가 교사 인증을 확인한다.
import { Hono, type Context } from "hono";
import { syllableAudioBase } from "../../content/core-table.ts";
import { COURSE_ORDER, GROUP_CHOICES, GROUP_LABELS, type GroupId } from "../../content/course-order.ts";
import { stageTitle } from "../../content/course.ts";
import { CONTENT_VOICES, PRACTICE_VOICES, isPracticeVoiceKey, voicedAudioId, type PracticeVoiceKey } from "../../content/practice-voices.ts";
import {
  buildReleaseSnapshot,
  snapshotSentenceAudioBase,
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
import type { AudioAssetRow, ContentItemRow, ContentReleaseRow, ContentRepo, StageZeroRow, TtsUsageSummary } from "./repo.ts";
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
    const byItem = pickWinningAsset(fallbackByItemVoice.get(`${itemId}:${kind}:${voiceKey}`) ?? []);
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

function buildDbContentView(
  groupId: GroupId,
  allItems: readonly ContentItemRow[],
  allStage0: readonly StageZeroRow[],
  allAssets: readonly AudioAssetRow[],
  latestRelease: ContentReleaseRow | null,
  ttsReady: boolean,
  nowIso: string,
): TeacherContentView {
  const visibleItems = allItems.filter((item) => item.status !== "hidden");

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

  const stageKeys = groupId === "j_ch_jj" ? JCJ_STAGE_KEYS : OTHER_STAGE_KEYS;
  const stages: ContentStageSection[] = stageKeys.map((key) => {
    const itemsInStage = groupItems.filter((item) => snapshotStageKey(item) === key);
    const seenDraftAssets = new Set<string>();
    const draftAudios: DraftAudioReviewRow[] = [];

    const itemViews: ContentItemView[] = itemsInStage.map((item) => {
      const wordBase = snapshotWordAudioBase(item);
      const sentenceBase = snapshotSentenceAudioBase(item);
      const hasExample = item.example.trim().length > 0;

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

      let exampleAudio: Record<string, ContentAudioCell> | null = null;
      let turnsAudio: Record<string, ContentTurnsCell> | null = null;
      if (hasExample) {
        exampleAudio = {};
        turnsAudio = {};
        for (const voice of CONTENT_VOICES) {
          const cell = toAudioCell(
            voicedAudioId(sentenceBase, voice.key),
            byAudioId,
            byItemVoice,
            item.id,
            "sentence",
            voice.key,
          );
          exampleAudio[voice.key] = cell;
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
                voiceKey: voice.key,
                voiceLabel: voiceLabelFromKey(voice.key),
                durationMs: asset.durationMs,
                generatedAt: asset.generatedAt ?? asset.createdAt,
                playUrl: cell.playUrl,
              });
            }
          }

          const turnsId = turnsAudioId(voicedAudioId(sentenceBase, voice.key));
          const turnsAsset = pickWinningAsset(byAudioId.get(turnsId) ?? []);
          turnsAudio[voice.key] = turnsAsset
            ? {
                ready: true,
                playUrl: assetPlayUrl(turnsAsset),
                assetId: turnsAsset.id,
                durationMs: turnsAsset.durationMs,
              }
            : { ready: false, playUrl: null, assetId: null, durationMs: null };
        }
      }

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
        wordAudio,
        exampleAudio,
        turnsAudio,
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

  return {
    groups: COURSE_ORDER.map((id) => ({
      id,
      label: GROUP_LABELS[id],
      choices: [...GROUP_CHOICES[id]],
      count: visibleItems.filter((item) => item.groupId === id).length,
    })),
    group: {
      id: groupId,
      label: GROUP_LABELS[groupId],
      choices: [...GROUP_CHOICES[groupId]],
    },
    stage0: stage0Rows,
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
      const [allItems, allStage0, allAssets, latestRelease] = await Promise.all([
        deps.contentRepo.listItems({ includeHidden: true }),
        deps.contentRepo.listStageZero(),
        deps.contentRepo.listAudioAssets(),
        deps.contentRepo.latestRelease(),
      ]);
      if (allItems.length === 0 && allStage0.length === 0 && !latestRelease) {
        return c.json(buildReadOnlyContentView(rawGroup, deps.fallbackAudio, ttsReady));
      }
      return c.json(
        buildDbContentView(rawGroup, allItems, allStage0, allAssets, latestRelease, ttsReady, deps.now().toISOString()),
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

    const patch: Record<string, unknown> = {};
    const changedFields: string[] = [];

    if ("word" in body) {
      const nextWord = cleanText(body.word, 80);
      if (!nextWord) return c.json({ error: "word_required" }, 400);
      if (nextWord !== existing.word) {
        patch.word = nextWord;
        changedFields.push("word");
      }
    }
    if ("consonant" in body) {
      const nextConsonant = cleanText(body.consonant, 8);
      if (!GROUP_CHOICES[existing.groupId].includes(nextConsonant)) return c.json({ error: "invalid_consonant" }, 400);
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
      if (!nextStageInfo) return c.json({ error: "invalid_stage" }, 400);
      if (nextStageInfo.stage !== existing.stage) {
        patch.stage = nextStageInfo.stage;
        changedFields.push("stage");
      }
      if (nextStageInfo.substage !== existing.substage) {
        patch.substage = nextStageInfo.substage;
        changedFields.push("substage");
      }
    }

    for (const [field, limit] of [
      ["pos", 40],
      ["gloss", 400],
      ["scene", 200],
      ["example", 400],
      ["related", 200],
      ["note", 200],
    ] as const) {
      if (!(field in body)) continue;
      const val = cleanText(body[field], limit);
      if (val !== existing[field]) {
        patch[field] = val;
        changedFields.push(field);
      }
    }

    if (changedFields.length === 0) {
      return c.json({ item: existing, version: null, changedFields: [], staleMarked: 0 });
    }

    const reason = cleanText(body.reason, 200) || null;
    const updated = await deps.contentRepo.updateItem(existing.id, patch, {
      changedFields,
      reason,
      editedBy: c.get("teacherId"),
    });
    if (!updated) return c.json({ error: "not_found" }, 404);

    let staleMarked = 0;
    const wordChanged = changedFields.includes("word");
    const exampleChanged = changedFields.includes("example");
    if (wordChanged || exampleChanged) {
      const allActiveItems = await deps.contentRepo.listItems({ includeHidden: false });
      const others = allActiveItems.filter((row) => row.id !== existing.id);

      if (wordChanged) {
        const oldWordBase = snapshotWordAudioBase(existing);
        const sharedWordExists = others.some(
          (other) => snapshotWordAudioBase(other) === oldWordBase && other.word === existing.word,
        );
        staleMarked += await deps.contentRepo.markAudioStale({
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
        staleMarked += await deps.contentRepo.markAudioStale({
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

    return c.json({
      item: updated.item,
      version: updated.version,
      changedFields,
      staleMarked,
    });
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
    if (kind !== "word" && kind !== "sentence") return c.json({ error: "invalid_kind" }, 400);
    if (!isPracticeVoiceKey(body.voice)) return c.json({ error: "invalid_voice" }, 400);
    const voice = body.voice;

    const text = (kind === "word" ? item.word : item.example).trim();
    if (!text) {
      return c.json(
        {
          error: kind === "sentence" ? "example_required" : "empty_text",
          message: kind === "sentence" ? "예문을 먼저 써 주세요." : "단어를 먼저 써 주세요.",
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

    const base = kind === "word" ? snapshotWordAudioBase(item) : snapshotSentenceAudioBase(item);
    const audioId = voicedAudioId(base, voice);
    const draftKeyId = crypto.randomUUID();
    const stored = await deps.audioStore.putDraft(audioId, draftKeyId, result.bytes);

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
      text,
      generatedAt: deps.now().toISOString(),
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

  return app;
}

export function isValidPracticeVoice(value: unknown): value is PracticeVoiceKey {
  return isPracticeVoiceKey(value);
}
