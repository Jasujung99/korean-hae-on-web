// 시험용 메모리 콘텐츠 저장소. Supabase 구현과 같은 제약(유일 키, 판 누적, 멱등 들여오기)을 지킨다.
import {
  buildReleaseSnapshot,
  snapshotFromReferenceJson,
  exampleSlots,
  snapshotWordAudioBase,
  type ReleaseCandidateAsset,
  type ReleaseCandidateItem,
} from "../../content/snapshot.ts";
import { PRACTICE_VOICES, voicedAudioId } from "../../content/practice-voices.ts";
import { turnsAudioId } from "../../content/tts/batch-plan.ts";
import {
  itemSnapshotRecord,
  normalizeProposalFields,
  type AudioAssetRow,
  type ContentItemRow,
  type ContentItemVersionRow,
  type ContentProposalRow,
  type ContentReleaseRow,
  type ContentRepo,
  type NewAudioAssetInput,
  type NewContentItemInput,
  type NewContentProposalInput,
  type NewStageZeroInput,
  type StageZeroRow,
  type TtsUsageRow,
} from "./repo.ts";

export function createMemoryContentRepo(options: { now?: () => Date } = {}): ContentRepo {
  const now = options.now ?? (() => new Date());
  const iso = () => now().toISOString();
  const items: ContentItemRow[] = [];
  const versions: ContentItemVersionRow[] = [];
  const stage0: StageZeroRow[] = [];
  const assets: AudioAssetRow[] = [];
  const releases: ContentReleaseRow[] = [];
  const usage: TtsUsageRow[] = [];
  const proposals: ContentProposalRow[] = [];

  return {
    kind: "memory",
    async listItems(filter) {
      return items
        .filter((row) => (!filter?.groupId || row.groupId === filter.groupId) && (filter?.includeHidden || row.status !== "hidden"))
        .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt))
        .map((row) => ({ ...row }));
    },
    async getItem(id) {
      const row = items.find((item) => item.id === id);
      return row ? { ...row } : null;
    },
    async createItem(input: NewContentItemInput) {
      const ts = iso();
      const maxOrder = items
        .filter((item) => item.groupId === input.groupId && item.stage === input.stage)
        .reduce((max, item) => Math.max(max, item.sortOrder), 0);
      const row: ContentItemRow = {
        id: crypto.randomUUID(),
        legacyId: input.legacyId ?? null,
        groupId: input.groupId,
        stage: input.stage,
        substage: input.substage,
        consonant: input.consonant,
        word: input.word,
        entryId: input.entryId ?? null,
        pos: input.pos ?? "",
        gloss: input.gloss ?? "",
        scene: input.scene ?? "",
        example: input.example ?? "",
        extraExamples: input.extraExamples ?? [],
        related: input.related ?? "",
        note: input.note ?? "",
        sortOrder: input.sortOrder ?? maxOrder + 1,
        source: input.source,
        status: input.status,
        createdBy: input.createdBy,
        createdAt: ts,
        updatedAt: ts,
      };
      items.push(row);
      versions.push({
        id: crypto.randomUUID(),
        itemId: row.id,
        version: 1,
        snapshot: itemSnapshotRecord(row),
        changedFields: ["created"],
        reason: null,
        editedBy: input.createdBy,
        createdAt: ts,
      });
      return { ...row };
    },
    async updateItem(id, patch, versionInfo) {
      const idx = items.findIndex((item) => item.id === id);
      if (idx < 0) return null;
      const prev = items[idx] as ContentItemRow;
      const ts = iso();
      const next: ContentItemRow = {
        ...prev,
        ...patch,
        updatedAt: ts,
      };
      items[idx] = next;
      const prevMax = versions
        .filter((row) => row.itemId === id)
        .reduce((max, row) => Math.max(max, row.version), 0);
      const ver: ContentItemVersionRow = {
        id: crypto.randomUUID(),
        itemId: id,
        version: prevMax + 1,
        snapshot: itemSnapshotRecord(next),
        changedFields: [...versionInfo.changedFields],
        reason: versionInfo.reason,
        editedBy: versionInfo.editedBy,
        createdAt: ts,
      };
      versions.push(ver);
      return { item: { ...next }, version: { ...ver } };
    },
    async listItemVersions(itemId) {
      return versions
        .filter((row) => row.itemId === itemId)
        .sort((a, b) => b.version - a.version)
        .map((row) => ({ ...row }));
    },
    async listStageZero(groupId) {
      return stage0
        .filter((row) => !groupId || row.groupId === groupId)
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((row) => ({ ...row }));
    },
    async listAudioAssets(filter) {
      return assets
        .filter((row) => (!filter?.audioId || row.audioId === filter.audioId) && (!filter?.status || row.status === filter.status))
        .map((row) => ({ ...row }));
    },
    async getAudioAsset(id) {
      const row = assets.find((item) => item.id === id);
      return row ? { ...row } : null;
    },
    async insertAudioAsset(input: NewAudioAssetInput) {
      const row: AudioAssetRow = {
        ...input,
        settings: input.settings ? { ...input.settings } : {},
        id: crypto.randomUUID(),
        reviewedBy: input.reviewedBy ?? null,
        reviewedAt: input.reviewedAt ?? null,
        createdAt: iso(),
      };
      assets.push(row);
      return { ...row };
    },
    async upsertAudioAssets(inputs: NewAudioAssetInput[], onConflict: "ignore" | "merge" = "merge") {
      let changed = 0;
      for (const input of inputs) {
        const existingIdx = assets.findIndex(
          (row) => row.audioId === input.audioId && row.storage === input.storage && row.objectKey === input.objectKey,
        );
        if (existingIdx >= 0) {
          if (onConflict === "ignore") continue;
          const prev = assets[existingIdx] as AudioAssetRow;
          assets[existingIdx] = {
            ...prev,
            ...input,
            settings: input.settings ? { ...input.settings } : prev.settings,
            id: prev.id,
            reviewedBy: input.reviewedBy ?? prev.reviewedBy,
            reviewedAt: input.reviewedAt ?? prev.reviewedAt,
            createdAt: prev.createdAt,
          };
          changed += 1;
        } else {
          await this.insertAudioAsset(input);
          changed += 1;
        }
      }
      return changed;
    },
    async markAudioStale(filter) {
      let count = 0;
      const itemIdSet = new Set(filter.itemIds ?? []);
      const audioIdSet = new Set(filter.audioIds ?? []);
      const kindSet = filter.kinds && filter.kinds.length > 0 ? new Set(filter.kinds) : null;
      for (const asset of assets) {
        if (asset.status !== "draft" && asset.status !== "approved") continue;
        if (kindSet && !kindSet.has(asset.kind)) continue;
        const matchItem = asset.itemId !== null && itemIdSet.has(asset.itemId);
        const matchAudio = audioIdSet.has(asset.audioId);
        if (matchItem || matchAudio) {
          if (!asset.stale) {
            asset.stale = true;
            count += 1;
          }
          if (!asset.itemId && filter.attachItemId && matchAudio) {
            asset.itemId = filter.attachItemId;
          }
        }
      }
      return count;
    },
    async supersedeDrafts(audioId) {
      let count = 0;
      for (const asset of assets) {
        if (asset.audioId === audioId && asset.status === "draft") {
          asset.status = "superseded";
          count += 1;
        }
      }
      return count;
    },
    async reviewAudioAsset(id, status, reviewedBy) {
      const asset = assets.find((row) => row.id === id);
      if (!asset) return null;
      const now = iso();
      asset.status = status;
      if (status === "approved") {
        asset.stale = false;
        for (const other of assets) {
          if (other.id === asset.id) continue;
          if (other.audioId === asset.audioId && other.status === "approved") {
            other.status = "superseded";
          } else if (
            asset.itemId !== null &&
            other.itemId === asset.itemId &&
            other.kind === asset.kind &&
            other.voiceKey === asset.voiceKey &&
            other.stale &&
            (other.status === "draft" || other.status === "approved")
          ) {
            other.status = "superseded";
          }
        }
      }
      asset.reviewedBy = reviewedBy;
      asset.reviewedAt = now;
      return { ...asset };
    },
    async latestRelease() {
      const sorted = [...releases].sort((a, b) => b.seq - a.seq);
      const top = sorted[0];
      return top ? { ...top, snapshot: structuredClone(top.snapshot) } : null;
    },
    async createRelease(input) {
      const maxSeq = releases.reduce((max, row) => Math.max(max, row.seq), 0);
      const row: ContentReleaseRow = {
        id: crypto.randomUUID(),
        seq: maxSeq + 1,
        releasedBy: input.releasedBy,
        releasedAt: iso(),
        note: input.note,
        itemCount: input.itemCount,
        audioCount: input.audioCount,
        snapshot: structuredClone(input.snapshot),
      };
      releases.push(row);
      return { ...row, snapshot: structuredClone(row.snapshot) };
    },
    async recordTtsUsage(input) {
      usage.push({
        id: crypto.randomUUID(),
        at: input.at ?? iso(),
        quotaDay: input.quotaDay,
        source: input.source,
        voiceKey: input.voiceKey,
        kind: input.kind,
        itemId: input.itemId,
        ok: input.ok,
        errorCode: input.errorCode,
      });
    },
    async ttsUsageSummary(quotaDay) {
      const rows = usage.filter((row) => row.quotaDay === quotaDay);
      const uiSingle = rows.filter((row) => row.source === "ui_single").length;
      const pcBatch = rows.filter((row) => row.source === "pc_batch").length;
      return { total: rows.length, uiSingle, pcBatch };
    },
    async seedItems(inputs: NewContentItemInput[]) {
      let inserted = 0;
      for (const input of inputs) {
        if (input.legacyId && items.some((row) => row.legacyId === input.legacyId)) continue;
        await this.createItem(input);
        inserted += 1;
      }
      return inserted;
    },
    async seedStageZero(rows: NewStageZeroInput[]) {
      let inserted = 0;
      for (const row of rows) {
        const dup = stage0.some(
          (existing) =>
            existing.groupId === row.groupId &&
            existing.kind === row.kind &&
            existing.stimulus === row.stimulus &&
            existing.context === row.context,
        );
        if (dup) continue;
        stage0.push({ ...row, id: crypto.randomUUID() });
        inserted += 1;
      }
      return inserted;
    },
    async listProposals(filter) {
      return proposals
        .filter(
          (row) =>
            (!filter?.status || row.status === filter.status) &&
            (!filter?.itemId || row.itemId === filter.itemId),
        )
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .map((row) => ({ ...row, fields: { ...row.fields }, flags: [...row.flags] }));
    },
    async getProposal(id) {
      const row = proposals.find((p) => p.id === id);
      return row ? { ...row, fields: { ...row.fields }, flags: [...row.flags] } : null;
    },
    async insertProposals(inputs: NewContentProposalInput[]) {
      let inserted = 0;
      let skipped = 0;
      const pendingKeys = new Set(
        proposals.filter((p) => p.status === "pending").map((p) => `${p.itemId}:${p.promptVersion}`),
      );
      for (const input of inputs) {
        const key = `${input.itemId}:${input.promptVersion}`;
        if (pendingKeys.has(key)) {
          skipped += 1;
          continue;
        }
        pendingKeys.add(key);
        proposals.push({
          id: crypto.randomUUID(),
          itemId: input.itemId,
          kind: input.kind,
          fields: normalizeProposalFields(input.fields),
          sense: input.sense ?? "",
          flags: [...(input.flags ?? [])],
          source: input.source ?? "ai_draft",
          model: input.model,
          promptVersion: input.promptVersion,
          status: "pending",
          createdAt: iso(),
          decidedBy: null,
          decidedAt: null,
        });
        inserted += 1;
      }
      return { inserted, skipped };
    },
    async decideProposal(id, status, decidedBy) {
      const row = proposals.find((p) => p.id === id);
      if (!row) return null;
      row.status = status;
      row.decidedBy = decidedBy;
      row.decidedAt = iso();
      return { ...row, fields: { ...row.fields }, flags: [...row.flags] };
    },
  };
}

/** 시험 도우미: 기준 JSON과 선택 음원 목록으로 메모리 저장소를 채우고 seq=1 게시본을 만든다. */
export async function seedMemoryContentRepo(
  repo: ContentRepo,
  audioIds: readonly string[] = [],
  options: { storage?: "r2" | "local"; releasedAt?: string } = {},
): Promise<ContentReleaseRow> {
  const ref = snapshotFromReferenceJson();
  await repo.seedItems(
    ref.items.map((item) => ({
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
      source: "roadmap_seed",
      status: "approved",
      createdBy: null,
    })),
  );
  await repo.seedStageZero(ref.stage0);

  const dbItems = await repo.listItems({ includeHidden: true });
  const itemsByAudioBase = new Map<string, string[]>();
  const linkBase = (base: string, itemId: string) => {
    const list = itemsByAudioBase.get(base);
    if (list) list.push(itemId);
    else itemsByAudioBase.set(base, [itemId]);
  };
  for (const item of dbItems) {
    linkBase(snapshotWordAudioBase(item), item.id);
    for (const slot of exampleSlots(item)) linkBase(slot.audioBase, item.id);
  }

  const assetsToSeed: NewAudioAssetInput[] = audioIds.map((audioId) => {
    const turns = audioId.endsWith("--turns");
    const withoutTurns = turns ? audioId.slice(0, -7) : audioId;
    const voiceMatch = withoutTurns.match(/--([a-z]+)$/);
    const voiceKey = voiceMatch?.[1] ?? "iapetus";
    const base = voiceMatch ? withoutTurns.slice(0, -voiceMatch[0].length) : withoutTurns;
    const kind = turns
      ? "sentence_turns"
      : base.startsWith("sentence-")
        ? "sentence"
        : base.startsWith("word-")
          ? "word"
          : base.startsWith("audition-")
            ? "audition"
            : "pseudo";
    const storage = options.storage ?? "local";
    const linked = itemsByAudioBase.get(base);
    return {
      audioId,
      itemId: linked && linked.length === 1 ? (linked[0] ?? null) : null,
      kind,
      voiceKey,
      storage,
      objectKey: storage === "r2" ? `a/${audioId}.m4a` : `${audioId}.wav`,
      mime: storage === "r2" ? "audio/mp4" : "audio/wav",
      bytes: 128,
      durationMs: 800,
      sha256: "",
      status: "approved",
      stale: false,
      source: "import",
      model: "fixture",
      stylePrompt: kind === "word" || kind === "pseudo" ? "flat" : null,
      text: "",
      generatedAt: options.releasedAt ?? "2026-11-19T00:00:00.000Z",
    };
  });
  await repo.upsertAudioAssets(assetsToSeed);

  const existingRelease = await repo.latestRelease();
  if (existingRelease) return existingRelease;
  const allAssets = await repo.listAudioAssets();
  const stage0Rows = await repo.listStageZero();
  const { snapshot, itemCount, audioCount } = buildReleaseSnapshot(
    dbItems as ReleaseCandidateItem[],
    stage0Rows,
    allAssets as ReleaseCandidateAsset[],
    1,
    options.releasedAt ?? new Date().toISOString(),
  );
  return repo.createRelease({
    releasedBy: null,
    note: "초기 들여오기",
    snapshot,
    itemCount,
    audioCount,
  });
}

export { PRACTICE_VOICES, voicedAudioId, turnsAudioId };
