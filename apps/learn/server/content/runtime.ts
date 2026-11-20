// 학습자·교사가 공유하는 게시본 스냅샷 캐시와 스냅샷 기반 음원 어댑터.
// node:crypto 외의 Node 모듈을 쓰지 않으므로 Cloudflare 워커에서도 그대로 돈다.
import { createHmac } from "node:crypto";
import { snapshotFromReferenceJson, voiceLabelFromKey, type ContentSnapshot, type SnapshotAudioEntry } from "../../content/snapshot.ts";
import type { AudioBody, PreviewAudio } from "../preview/audio.ts";
import { previewAudioIds } from "../preview/audio-ids.ts";
import type { AudioObjectStore } from "./audio-store.ts";
import type { AudioAssetRow, ContentRepo } from "./repo.ts";
import { isMissingContentTableError } from "./supabase-repo.ts";

export type CachedRelease = {
  snapshot: ContentSnapshot;
  fromRelease: boolean;
};

export type SnapshotCache = {
  get(): Promise<CachedRelease>;
  invalidate(): void;
};

export function createSnapshotCache(
  repo: ContentRepo,
  ttlMs = 60_000,
  now: () => number = () => Date.now(),
): SnapshotCache {
  let cached: { at: number; value: CachedRelease } | null = null;
  let fallbackSnapshot: ContentSnapshot | null = null;

  return {
    async get() {
      const ts = now();
      if (cached && ts - cached.at < ttlMs) return cached.value;
      try {
        const release = await repo.latestRelease();
        if (release) {
          const value: CachedRelease = { snapshot: release.snapshot, fromRelease: true };
          cached = { at: ts, value };
          return value;
        }
      } catch (error) {
        if (cached) return cached.value;
        if (!isMissingContentTableError(error)) throw error;
      }
      if (!fallbackSnapshot) fallbackSnapshot = snapshotFromReferenceJson();
      const value: CachedRelease = { snapshot: fallbackSnapshot, fromRelease: false };
      cached = { at: ts, value };
      return value;
    },
    invalidate() {
      cached = null;
    },
  };
}

/** 게시 스냅샷의 음원 매핑으로 학습자용 PreviewAudio를 만든다(HMAC ref 유지). */
export function createSnapshotAudio(
  snapshot: ContentSnapshot,
  secret: string,
  store: AudioObjectStore,
): PreviewAudio {
  const mac = (label: string) => createHmac("sha256", secret).update(label).digest("hex");
  const knownIds = previewAudioIds(snapshot);
  const idByRef = new Map<string, string>();
  const refById = new Map<string, string>();
  const inventoryRefs = new Map<string, string>();

  for (const id of knownIds) {
    if (!snapshot.audio[id]) continue;
    const ref = mac(`audio:${id}`).slice(0, 20);
    idByRef.set(ref, id);
    refById.set(id, ref);
  }
  for (const id of Object.keys(snapshot.audio)) {
    const ref = `i${mac(`audio-inventory:${id}`).slice(0, 19)}`;
    inventoryRefs.set(id, ref);
    idByRef.set(ref, id);
  }

  const toMeta = (entry: SnapshotAudioEntry) => ({
    voice: entry.voice,
    model: entry.model,
    reviewStatus: "approved",
    generatedAt: entry.generatedAt,
    sha256: entry.sha256,
    kind: entry.kind,
    text: entry.text,
    stylePrompt: entry.stylePrompt,
  });

  return {
    refFor: (audioId) => refById.get(audioId) ?? null,
    async read(ref): Promise<AudioBody | null> {
      const id = idByRef.get(ref);
      const entry = id ? snapshot.audio[id] : undefined;
      if (!entry) return null;
      const got = await store.get(entry.storage, entry.objectKey, id);
      if (!got || got.bytes.length === 0) return null;
      return { bytes: got.bytes, type: got.mime ?? entry.mime };
    },
    meta(audioId) {
      const entry = snapshot.audio[audioId];
      return entry ? toMeta(entry) : null;
    },
    listIds: () => Object.keys(snapshot.audio).sort(),
    info(audioId) {
      const entry = snapshot.audio[audioId];
      return entry ? { bytes: entry.bytes, durationMs: entry.durationMs } : null;
    },
    inventoryRef: (audioId) => inventoryRefs.get(audioId) ?? null,
  };
}

/** 교사 '만든 음원' 대시보드용 PreviewAudio 어댑터. DB phoneme_audio_assets 목록에서 만든다. */
export function createAssetsInventoryAudio(assets: readonly AudioAssetRow[]): PreviewAudio {
  const activeByAudioId = new Map<string, AudioAssetRow>();
  const rank = (row: AudioAssetRow) =>
    (row.status === "approved" ? 2 : row.status === "draft" ? 1 : 0) * 1e13 +
    Date.parse(row.reviewedAt ?? row.generatedAt ?? row.createdAt);

  for (const row of assets) {
    if (row.status === "rejected" || row.status === "superseded") continue;
    const prev = activeByAudioId.get(row.audioId);
    if (!prev || rank(row) >= rank(prev)) activeByAudioId.set(row.audioId, row);
  }

  return {
    refFor: (audioId) => {
      const row = activeByAudioId.get(audioId);
      return row ? `/api/teacher/content/audio/${row.id}` : null;
    },
    async read() {
      return null;
    },
    meta(audioId) {
      const row = activeByAudioId.get(audioId);
      if (!row) return null;
      return {
        voice: voiceLabelFromKey(row.voiceKey),
        model: row.model,
        reviewStatus: row.status,
        generatedAt: row.generatedAt ?? row.createdAt,
        sha256: row.sha256,
        kind: row.kind,
        text: row.text,
        stylePrompt: row.stylePrompt,
      };
    },
    listIds: () => [...activeByAudioId.keys()].sort(),
    info(audioId) {
      const row = activeByAudioId.get(audioId);
      return row ? { bytes: row.bytes, durationMs: row.durationMs } : null;
    },
    inventoryRef(audioId) {
      const row = activeByAudioId.get(audioId);
      return row ? `/api/teacher/content/audio/${row.id}` : null;
    },
  };
}
