// Supabase(PostgREST) 콘텐츠 저장소. 같은 origin 학습 서버와 운영 스크립트만 secret 키로 부른다.
// node:* 모듈을 쓰지 않으므로 Cloudflare 워커에서도 동작한다.
import type { GroupId } from "../../content/course-order.ts";
import type { ContentSnapshot, ContentStage, ContentSubstage, StageZeroContext } from "../../content/snapshot.ts";
import { DbError, type DbConfig } from "../accounts/supabase-repo.ts";
import {
  itemSnapshotRecord,
  normalizeProposalFields,
  type AudioAssetKind,
  type AudioAssetRow,
  type AudioAssetSource,
  type AudioAssetStatus,
  type ContentItemRow,
  type ContentItemStatus,
  type ContentItemVersionRow,
  type ContentProposalKind,
  type ContentProposalRow,
  type ContentProposalStatus,
  type ContentReleaseRow,
  type ContentRepo,
  type NewAudioAssetInput,
  type StageZeroRow,
} from "./repo.ts";

type Row = Record<string, unknown>;

export function isMissingContentTableError(error: unknown): boolean {
  if (!(error instanceof DbError)) return false;
  return error.status === 404 || error.code === "PGRST205" || error.code === "42P01";
}

function itemFrom(row: Row): ContentItemRow {
  return {
    id: String(row.id),
    legacyId: (row.legacy_id as string | null) ?? null,
    groupId: String(row.group_id) as GroupId,
    stage: String(row.stage) as ContentStage,
    substage: (row.substage as ContentSubstage) ?? null,
    consonant: String(row.consonant),
    word: String(row.word),
    entryId: row.entry_id === null || row.entry_id === undefined ? null : Number(row.entry_id),
    pos: String(row.pos ?? ""),
    gloss: String(row.gloss ?? ""),
    scene: String(row.scene ?? ""),
    example: String(row.example ?? ""),
    extraExamples: Array.isArray(row.extra_examples) ? (row.extra_examples as unknown[]).map(String).filter(Boolean) : [],
    related: String(row.related ?? ""),
    note: String(row.note ?? ""),
    sortOrder: Number(row.sort_order ?? 0),
    source: row.source === "teacher" ? "teacher" : "roadmap_seed",
    status: String(row.status) as ContentItemStatus,
    createdBy: (row.created_by as string | null) ?? null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function versionFrom(row: Row): ContentItemVersionRow {
  return {
    id: String(row.id),
    itemId: String(row.item_id),
    version: Number(row.version),
    snapshot: (row.snapshot as Record<string, unknown>) ?? {},
    changedFields: Array.isArray(row.changed_fields) ? row.changed_fields.map(String) : [],
    reason: (row.reason as string | null) ?? null,
    editedBy: (row.edited_by as string | null) ?? null,
    createdAt: String(row.created_at),
  };
}

function stageZeroFrom(row: Row): StageZeroRow {
  return {
    id: String(row.id),
    groupId: String(row.group_id) as GroupId,
    consonant: String(row.consonant),
    stimulus: String(row.stimulus),
    word: (row.word as string | null) ?? null,
    context: String(row.context) as StageZeroContext,
    kind: row.kind === "pseudoword" ? "pseudoword" : "cell",
    sortOrder: Number(row.sort_order ?? 0),
  };
}

function assetFrom(row: Row): AudioAssetRow {
  return {
    id: String(row.id),
    audioId: String(row.audio_id),
    itemId: (row.item_id as string | null) ?? null,
    kind: String(row.kind) as AudioAssetKind,
    voiceKey: String(row.voice_key),
    storage: row.storage === "local" ? "local" : "r2",
    objectKey: String(row.object_key),
    mime: String(row.mime),
    bytes: Number(row.bytes ?? 0),
    durationMs: row.duration_ms === null || row.duration_ms === undefined ? null : Number(row.duration_ms),
    sha256: String(row.sha256 ?? ""),
    status: String(row.status) as AudioAssetStatus,
    stale: row.stale === true,
    source: String(row.source) as AudioAssetSource,
    model: String(row.model ?? ""),
    stylePrompt: (row.style_prompt as string | null) ?? null,
    settings: row.settings && typeof row.settings === "object" && !Array.isArray(row.settings) ? (row.settings as Record<string, unknown>) : {},
    text: String(row.text ?? ""),
    generatedAt: (row.generated_at as string | null) ?? null,
    reviewedBy: (row.reviewed_by as string | null) ?? null,
    reviewedAt: (row.reviewed_at as string | null) ?? null,
    createdAt: String(row.created_at),
  };
}

function releaseFrom(row: Row): ContentReleaseRow {
  return {
    id: String(row.id),
    seq: Number(row.seq),
    releasedBy: (row.released_by as string | null) ?? null,
    releasedAt: String(row.released_at),
    note: (row.note as string | null) ?? null,
    itemCount: Number(row.item_count ?? 0),
    audioCount: Number(row.audio_count ?? 0),
    snapshot: row.snapshot as ContentSnapshot,
  };
}

function proposalFrom(row: Row): ContentProposalRow {
  return {
    id: String(row.id),
    itemId: String(row.item_id),
    kind: row.kind === "cleanup" ? ("cleanup" satisfies ContentProposalKind) : "fill",
    fields: normalizeProposalFields(row.fields),
    sense: String(row.sense ?? ""),
    flags: Array.isArray(row.flags) ? row.flags.map(String) : [],
    source: "ai_draft",
    model: String(row.model ?? ""),
    promptVersion: String(row.prompt_version ?? ""),
    status: String(row.status) as ContentProposalStatus,
    createdAt: String(row.created_at),
    decidedBy: (row.decided_by as string | null) ?? null,
    decidedAt: (row.decided_at as string | null) ?? null,
  };
}

const ITEM_PATCH_COLUMNS: Record<string, string> = {
  stage: "stage",
  substage: "substage",
  consonant: "consonant",
  word: "word",
  pos: "pos",
  gloss: "gloss",
  scene: "scene",
  example: "example",
  extraExamples: "extra_examples",
  related: "related",
  note: "note",
  sortOrder: "sort_order",
  status: "status",
};

const inList = (values: string[]) => `in.(${values.map((v) => `"${encodeURIComponent(v.replace(/"/g, '\\"'))}"`).join(",")})`;

export function createSupabaseContentRepo(config: DbConfig, fetcher: typeof fetch = fetch): ContentRepo {
  const base = `${config.url.replace(/\/$/, "")}/rest/v1`;

  async function call(method: string, path: string, body?: unknown, prefer?: string): Promise<Row[]> {
    const headers: Record<string, string> = {
      apikey: config.secretKey,
      accept: "application/json",
    };
    if (body !== undefined) headers["content-type"] = "application/json";
    if (prefer) headers.prefer = prefer;
    const response = await fetcher(`${base}/${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok) {
      let code = "unknown";
      try {
        const detail = (await response.json()) as { code?: string };
        code = detail.code ?? code;
      } catch {
        // 본문이 없으면 상태 코드만 남긴다.
      }
      throw new DbError(response.status, code);
    }
    if (response.status === 204) return [];
    const text = await response.text();
    if (!text) return [];
    const parsed = JSON.parse(text) as unknown;
    return Array.isArray(parsed) ? (parsed as Row[]) : [parsed as Row];
  }

  async function selectAll(pathWithQuery: string): Promise<Row[]> {
    const out: Row[] = [];
    const page = 1000;
    const sep = pathWithQuery.includes("?") ? "&" : "?";
    for (let offset = 0; ; offset += page) {
      const rows = await call("GET", `${pathWithQuery}${sep}limit=${page}&offset=${offset}`);
      out.push(...rows);
      if (rows.length < page) break;
    }
    return out;
  }

  const nowIso = () => new Date().toISOString();

  function toAssetDbRow(input: NewAudioAssetInput): Row {
    return {
      audio_id: input.audioId,
      item_id: input.itemId,
      kind: input.kind,
      voice_key: input.voiceKey,
      storage: input.storage,
      object_key: input.objectKey,
      mime: input.mime,
      bytes: input.bytes,
      duration_ms: input.durationMs,
      sha256: input.sha256,
      status: input.status,
      stale: input.stale,
      source: input.source,
      model: input.model,
      style_prompt: input.stylePrompt,
      settings: input.settings ?? {},
      text: input.text,
      generated_at: input.generatedAt,
      reviewed_by: input.reviewedBy ?? null,
      reviewed_at: input.reviewedAt ?? null,
    };
  }

  return {
    kind: "supabase",
    async listItems(filter) {
      const clauses = ["order=sort_order.asc,created_at.asc"];
      if (filter?.groupId) clauses.push(`group_id=eq.${encodeURIComponent(filter.groupId)}`);
      if (!filter?.includeHidden) clauses.push("status=neq.hidden");
      const rows = await selectAll(`phoneme_content_items?${clauses.join("&")}`);
      return rows.map(itemFrom);
    },
    async getItem(id) {
      if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
      const rows = await call("GET", `phoneme_content_items?id=eq.${id}`);
      return rows[0] ? itemFrom(rows[0]) : null;
    },
    async createItem(input) {
      const sortOrder =
        input.sortOrder ??
        (
          await call(
            "GET",
            `phoneme_content_items?group_id=eq.${encodeURIComponent(input.groupId)}&stage=eq.${encodeURIComponent(input.stage)}&select=sort_order&order=sort_order.desc&limit=1`,
          )
        )[0]?.sort_order;
      const nextSort = typeof sortOrder === "number" ? sortOrder + 1 : 1;
      const rows = await call(
        "POST",
        "phoneme_content_items",
        {
          legacy_id: input.legacyId ?? null,
          group_id: input.groupId,
          stage: input.stage,
          substage: input.substage,
          consonant: input.consonant,
          word: input.word,
          entry_id: input.entryId ?? null,
          pos: input.pos ?? "",
          gloss: input.gloss ?? "",
          scene: input.scene ?? "",
          example: input.example ?? "",
          extra_examples: input.extraExamples ?? [],
          related: input.related ?? "",
          note: input.note ?? "",
          sort_order: input.sortOrder ?? nextSort,
          source: input.source,
          status: input.status,
          created_by: input.createdBy,
        },
        "return=representation",
      );
      const created = itemFrom(rows[0] as Row);
      await call("POST", "phoneme_content_item_versions", {
        item_id: created.id,
        version: 1,
        snapshot: itemSnapshotRecord(created),
        changed_fields: ["created"],
        reason: null,
        edited_by: input.createdBy,
      });
      return created;
    },
    async updateItem(id, patch, versionInfo) {
      if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
      const body: Row = { updated_at: nowIso() };
      for (const [key, column] of Object.entries(ITEM_PATCH_COLUMNS)) {
        if (key in patch) body[column] = (patch as Row)[key];
      }
      const rows = await call("PATCH", `phoneme_content_items?id=eq.${id}`, body, "return=representation");
      const updated = rows[0] ? itemFrom(rows[0]) : null;
      if (!updated) return null;
      const latest = await call(
        "GET",
        `phoneme_content_item_versions?item_id=eq.${id}&select=version&order=version.desc&limit=1`,
      );
      const nextVer = Number(latest[0]?.version ?? 0) + 1;
      const verRows = await call(
        "POST",
        "phoneme_content_item_versions",
        {
          item_id: id,
          version: nextVer,
          snapshot: itemSnapshotRecord(updated),
          changed_fields: versionInfo.changedFields,
          reason: versionInfo.reason,
          edited_by: versionInfo.editedBy,
        },
        "return=representation",
      );
      return { item: updated, version: versionFrom(verRows[0] as Row) };
    },
    async listItemVersions(itemId) {
      if (!/^[0-9a-f-]{36}$/i.test(itemId)) return [];
      const rows = await call("GET", `phoneme_content_item_versions?item_id=eq.${itemId}&order=version.desc`);
      return rows.map(versionFrom);
    },
    async listStageZero(groupId) {
      const query = groupId
        ? `phoneme_content_stage0?group_id=eq.${encodeURIComponent(groupId)}&order=sort_order.asc`
        : "phoneme_content_stage0?order=sort_order.asc";
      const rows = await selectAll(query);
      return rows.map(stageZeroFrom);
    },
    async listAudioAssets(filter) {
      const clauses = ["order=created_at.desc"];
      if (filter?.audioId) clauses.push(`audio_id=eq.${encodeURIComponent(filter.audioId)}`);
      if (filter?.status) clauses.push(`status=eq.${encodeURIComponent(filter.status)}`);
      const rows = await selectAll(`phoneme_audio_assets?${clauses.join("&")}`);
      return rows.map(assetFrom);
    },
    async getAudioAsset(id) {
      if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
      const rows = await call("GET", `phoneme_audio_assets?id=eq.${id}`);
      return rows[0] ? assetFrom(rows[0]) : null;
    },
    async insertAudioAsset(input) {
      const rows = await call("POST", "phoneme_audio_assets", toAssetDbRow(input), "return=representation");
      return assetFrom(rows[0] as Row);
    },
    async upsertAudioAssets(inputs, onConflict = "merge") {
      if (inputs.length === 0) return 0;
      let total = 0;
      const chunkSize = 200;
      const resolution = onConflict === "ignore" ? "ignore-duplicates" : "merge-duplicates";
      for (let i = 0; i < inputs.length; i += chunkSize) {
        const chunk = inputs.slice(i, i + chunkSize).map(toAssetDbRow);
        const rows = await call(
          "POST",
          "phoneme_audio_assets?on_conflict=audio_id,storage,object_key",
          chunk,
          `resolution=${resolution},return=representation`,
        );
        total += rows.length;
      }
      return total;
    },
    async markAudioStale(filter) {
      let updated = 0;
      const kindClause = filter.kinds && filter.kinds.length > 0 ? `&kind=${inList(filter.kinds)}` : "";
      const itemIds = (filter.itemIds ?? []).filter((id) => /^[0-9a-f-]{36}$/i.test(id));
      if (itemIds.length > 0) {
        const rows = await call(
          "PATCH",
          `phoneme_audio_assets?item_id=${inList(itemIds)}&status=in.(draft,approved)&stale=eq.false${kindClause}`,
          { stale: true },
          "return=representation",
        );
        updated += rows.length;
      }
      const audioIds = filter.audioIds ?? [];
      if (audioIds.length > 0) {
        const rows = await call(
          "PATCH",
          `phoneme_audio_assets?audio_id=${inList(audioIds)}&status=in.(draft,approved)&stale=eq.false${kindClause}`,
          { stale: true },
          "return=representation",
        );
        updated += rows.length;
        if (filter.attachItemId && /^[0-9a-f-]{36}$/i.test(filter.attachItemId)) {
          await call(
            "PATCH",
            `phoneme_audio_assets?audio_id=${inList(audioIds)}&item_id=is.null${kindClause}`,
            { item_id: filter.attachItemId },
          );
        }
      }
      return updated;
    },
    async supersedeDrafts(audioId) {
      const rows = await call(
        "PATCH",
        `phoneme_audio_assets?audio_id=eq.${encodeURIComponent(audioId)}&status=eq.draft`,
        { status: "superseded" },
        "return=representation",
      );
      return rows.length;
    },
    async reviewAudioAsset(id, status, reviewedBy) {
      if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
      const body: Row = { status, reviewed_by: reviewedBy, reviewed_at: nowIso() };
      if (status === "approved") body.stale = false;
      const rows = await call("PATCH", `phoneme_audio_assets?id=eq.${id}`, body, "return=representation");
      const updated = rows[0] ? assetFrom(rows[0]) : null;
      if (!updated) return null;
      if (status === "approved") {
        await call(
          "PATCH",
          `phoneme_audio_assets?id=neq.${id}&audio_id=eq.${encodeURIComponent(updated.audioId)}&status=eq.approved`,
          { status: "superseded" },
        );
        if (updated.itemId && /^[0-9a-f-]{36}$/i.test(updated.itemId)) {
          await call(
            "PATCH",
            `phoneme_audio_assets?id=neq.${id}&item_id=eq.${updated.itemId}&kind=eq.${encodeURIComponent(updated.kind)}&voice_key=eq.${encodeURIComponent(updated.voiceKey)}&stale=eq.true&status=in.(draft,approved)`,
            { status: "superseded" },
          );
        }
      }
      return updated;
    },
    async latestRelease() {
      const rows = await call("GET", "phoneme_content_releases?order=seq.desc&limit=1");
      return rows[0] ? releaseFrom(rows[0]) : null;
    },
    async createRelease(input) {
      const latest = await this.latestRelease();
      const nextSeq = (latest?.seq ?? 0) + 1;
      const rows = await call(
        "POST",
        "phoneme_content_releases",
        {
          seq: nextSeq,
          released_by: input.releasedBy,
          released_at: nowIso(),
          note: input.note,
          item_count: input.itemCount,
          audio_count: input.audioCount,
          snapshot: input.snapshot,
        },
        "return=representation",
      );
      return releaseFrom(rows[0] as Row);
    },
    async recordTtsUsage(input) {
      await call("POST", "phoneme_tts_usage", {
        ...(input.at ? { at: input.at } : {}),
        quota_day: input.quotaDay,
        source: input.source,
        voice_key: input.voiceKey,
        kind: input.kind,
        item_id: input.itemId,
        ok: input.ok,
        error_code: input.errorCode,
      });
    },
    async ttsUsageSummary(quotaDay) {
      const rows = await selectAll(`phoneme_tts_usage?quota_day=eq.${encodeURIComponent(quotaDay)}&select=source`);
      let uiSingle = 0;
      let pcBatch = 0;
      for (const row of rows) {
        if (row.source === "ui_single") uiSingle += 1;
        else if (row.source === "pc_batch") pcBatch += 1;
      }
      return { total: rows.length, uiSingle, pcBatch };
    },
    async seedItems(inputs) {
      if (inputs.length === 0) return 0;
      let inserted = 0;
      const chunkSize = 100;
      for (let i = 0; i < inputs.length; i += chunkSize) {
        const chunk = inputs.slice(i, i + chunkSize).map((item) => ({
          legacy_id: item.legacyId ?? null,
          group_id: item.groupId,
          stage: item.stage,
          substage: item.substage,
          consonant: item.consonant,
          word: item.word,
          entry_id: item.entryId ?? null,
          pos: item.pos ?? "",
          gloss: item.gloss ?? "",
          scene: item.scene ?? "",
          example: item.example ?? "",
          extra_examples: item.extraExamples ?? [],
          related: item.related ?? "",
          note: item.note ?? "",
          sort_order: item.sortOrder ?? 0,
          source: item.source,
          status: item.status,
          created_by: item.createdBy,
        }));
        const rows = await call(
          "POST",
          "phoneme_content_items?on_conflict=legacy_id",
          chunk,
          "resolution=ignore-duplicates,return=representation",
        );
        inserted += rows.length;
        if (rows.length > 0) {
          const createdItems = rows.map(itemFrom);
          await call(
            "POST",
            "phoneme_content_item_versions?on_conflict=item_id,version",
            createdItems.map((item) => ({
              item_id: item.id,
              version: 1,
              snapshot: itemSnapshotRecord(item),
              changed_fields: ["created"],
              reason: "초기 들여오기",
              edited_by: null,
            })),
            "resolution=ignore-duplicates",
          );
        }
      }
      return inserted;
    },
    async seedStageZero(rows) {
      if (rows.length === 0) return 0;
      const insertedRows = await call(
        "POST",
        "phoneme_content_stage0?on_conflict=group_id,kind,stimulus,context",
        rows.map((row) => ({
          group_id: row.groupId,
          consonant: row.consonant,
          stimulus: row.stimulus,
          word: row.word,
          context: row.context,
          kind: row.kind,
          sort_order: row.sortOrder,
        })),
        "resolution=ignore-duplicates,return=representation",
      );
      return insertedRows.length;
    },
    async listProposals(filter) {
      const clauses = ["order=created_at.asc"];
      if (filter?.status) clauses.push(`status=eq.${encodeURIComponent(filter.status)}`);
      if (filter?.itemId) {
        if (!/^[0-9a-f-]{36}$/i.test(filter.itemId)) return [];
        clauses.push(`item_id=eq.${filter.itemId}`);
      }
      const rows = await selectAll(`phoneme_content_proposals?${clauses.join("&")}`);
      return rows.map(proposalFrom);
    },
    async getProposal(id) {
      if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
      const rows = await call("GET", `phoneme_content_proposals?id=eq.${id}`);
      return rows[0] ? proposalFrom(rows[0]) : null;
    },
    async insertProposals(inputs) {
      if (inputs.length === 0) return { inserted: 0, skipped: 0 };
      const existingPending = await this.listProposals({ status: "pending" });
      const pendingKeys = new Set(existingPending.map((row) => `${row.itemId}:${row.promptVersion}`));
      const toInsert: Row[] = [];
      let skipped = 0;
      for (const input of inputs) {
        const key = `${input.itemId}:${input.promptVersion}`;
        if (pendingKeys.has(key)) {
          skipped += 1;
          continue;
        }
        pendingKeys.add(key);
        toInsert.push({
          item_id: input.itemId,
          kind: input.kind,
          fields: normalizeProposalFields(input.fields),
          sense: input.sense ?? "",
          flags: [...(input.flags ?? [])],
          source: input.source ?? "ai_draft",
          model: input.model,
          prompt_version: input.promptVersion,
          status: "pending",
        });
      }
      let inserted = 0;
      const chunkSize = 100;
      for (let i = 0; i < toInsert.length; i += chunkSize) {
        const rows = await call(
          "POST",
          "phoneme_content_proposals",
          toInsert.slice(i, i + chunkSize),
          "return=representation",
        );
        inserted += rows.length;
      }
      return { inserted, skipped };
    },
    async decideProposal(id, status, decidedBy) {
      if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
      const rows = await call(
        "PATCH",
        `phoneme_content_proposals?id=eq.${id}`,
        { status, decided_by: decidedBy, decided_at: nowIso() },
        "return=representation",
      );
      return rows[0] ? proposalFrom(rows[0]) : null;
    },
  };
}
