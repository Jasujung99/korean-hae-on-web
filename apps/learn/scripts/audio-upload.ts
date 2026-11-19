// 음원을 R2(haeon-sori-audio)에 올리고 DB(phoneme_audio_assets)에 기록한다. R2 manifest.json은 덮어쓰지 않는다.
//   npm run audio:upload                 (초안으로 등록, 이미 있는 동일 해시 승인 상태는 유지)
//   npm run audio:upload -- --approve    (올린 음원을 approved로 표시)
//   npm run audio:upload -- --dry-run    (인코딩·업로드·DB 쓰기 없이 묶음별 현황만 확인)
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { syllableAudioBase } from "../content/core-table.ts";
import { COURSE_ORDER, type GroupId } from "../content/course-order.ts";
import { PRACTICE_VOICES, voicedAudioId } from "../content/practice-voices.ts";
import {
  snapshotFromReferenceJson,
  snapshotSentenceAudioBase,
  snapshotWordAudioBase,
  type SnapshotStageZero,
  type SnapshotWord,
} from "../content/snapshot.ts";
import { turnsAudioId } from "../content/tts/batch-plan.ts";
import type { ContentItemRow, ContentRepo, NewAudioAssetInput } from "../server/content/repo.ts";
import { createSupabaseContentRepo, isMissingContentTableError } from "../server/content/supabase-repo.ts";
import { createRawAudio, type AudioMeta } from "../server/preview/audio.ts";
import { allContentAudioIds } from "../server/preview/audio-ids.ts";
import { parseR2AudioMeta } from "./content-seed.ts";

const BUCKET = "haeon-sori-audio";
const BITRATE = 96000;
const KEYS_DIR = "I:/내 드라이브/_keys";
const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export type GroupAudioSummary = {
  groupId: GroupId;
  total: number;
  present: number;
};

export type UploadCandidateEntry = {
  audioId: string;
  objectKey: string;
  bytes: number;
  durationMs: number | null;
  meta: AudioMeta | null;
};

function groupAudioIds(
  groupId: GroupId,
  words: readonly Pick<SnapshotWord, "id" | "entryId" | "word" | "example" | "groupId" | "stage">[],
  stage0: readonly Pick<SnapshotStageZero, "groupId" | "stimulus" | "word" | "kind">[],
): string[] {
  const groupWords = words.filter((w) => w.groupId === groupId);
  const groupStage0 = stage0.filter((row) => row.groupId === groupId);
  const bases = new Set<string>();
  const ids = new Set<string>();

  for (const row of groupStage0) {
    if (row.kind === "pseudoword" || !row.word || row.stimulus !== row.word) {
      bases.add(syllableAudioBase(row.stimulus));
    } else {
      const matched = groupWords.find((w) => w.word === row.word);
      bases.add(matched ? snapshotWordAudioBase(matched) : `word-0-${row.word}`);
    }
  }
  for (const word of groupWords) {
    bases.add(snapshotWordAudioBase(word));
    if (word.example) bases.add(snapshotSentenceAudioBase(word));
    if (groupId === "j_ch_jj" && word.stage === "Stage 1" && word.entryId !== null) {
      ids.add(`word-Stage1-${word.entryId}-${word.word}`);
      if (word.example) ids.add(`sentence-Stage1-${word.entryId}-${word.word}`);
    }
  }
  for (const base of bases) {
    ids.add(base);
    for (const voice of PRACTICE_VOICES) {
      ids.add(voicedAudioId(base, voice.key));
      if (base.startsWith("sentence-")) ids.add(turnsAudioId(voicedAudioId(base, voice.key)));
    }
  }
  return [...ids];
}

export function summarizeGroupAudio(
  words: readonly Pick<SnapshotWord, "id" | "entryId" | "word" | "example" | "groupId" | "stage">[],
  stage0: readonly Pick<SnapshotStageZero, "groupId" | "stimulus" | "word" | "kind">[],
  presentIds: ReadonlySet<string> | readonly string[],
): GroupAudioSummary[] {
  const present = presentIds instanceof Set ? presentIds : new Set(presentIds);
  return COURSE_ORDER.map((groupId) => {
    const ids = groupAudioIds(groupId, words, stage0);
    return {
      groupId,
      total: ids.length,
      present: ids.filter((id) => present.has(id)).length,
    };
  });
}

export function buildUploadAssetInputs(input: {
  items: readonly Pick<ContentItemRow, "id" | "entryId" | "word" | "example">[];
  entries: readonly UploadCandidateEntry[];
  approve: boolean;
  nowIso: string;
}): { assets: NewAudioAssetInput[]; onConflict: "ignore" | "merge" } {
  const baseToItemIds = new Map<string, string[]>();
  const linkBase = (base: string, itemId: string) => {
    const list = baseToItemIds.get(base);
    if (list) list.push(itemId);
    else baseToItemIds.set(base, [itemId]);
  };
  for (const item of input.items) {
    linkBase(snapshotWordAudioBase(item), item.id);
    if (item.example) linkBase(snapshotSentenceAudioBase(item), item.id);
  }

  const assets: NewAudioAssetInput[] = input.entries.map(({ audioId, objectKey, bytes, durationMs, meta }) => {
    const parsed = parseR2AudioMeta(audioId, {
      file: objectKey,
      bytes,
      durationMs,
      type: "audio/mp4",
      meta,
    });
    const linked = baseToItemIds.get(parsed.normalizedBase);
    const itemId = linked && linked.length === 1 ? (linked[0] ?? null) : null;
    return {
      audioId,
      itemId,
      kind: parsed.kind,
      voiceKey: parsed.voiceKey,
      storage: "r2",
      objectKey,
      mime: "audio/mp4",
      bytes,
      durationMs,
      sha256: meta?.sha256 ?? "",
      status: input.approve ? "approved" : "draft",
      stale: false,
      source: "pc_batch",
      model: meta?.model ?? "",
      stylePrompt: meta?.stylePrompt ?? null,
      text: meta?.text ?? "",
      generatedAt: meta?.generatedAt || null,
      reviewedBy: null,
      reviewedAt: input.approve ? input.nowIso : null,
    };
  });

  return {
    assets,
    onConflict: input.approve ? "merge" : "ignore",
  };
}

function readKeyFile(filename: string): string {
  try {
    const path = join(KEYS_DIR, filename);
    if (!existsSync(path)) return "";
    return readFileSync(path, "utf8").replace(/^\uFEFF/, "").trim();
  } catch {
    return "";
  }
}

function resolveRepo(): ContentRepo | null {
  const dbUrl = (process.env.LEARN_DB_URL ?? "").trim() || readKeyFile("supabase_url.txt");
  const secretKey = (process.env.LEARN_DB_SECRET_KEY ?? "").trim() || readKeyFile("supabase_secret_key.txt");
  return dbUrl && secretKey ? createSupabaseContentRepo({ url: dbUrl, secretKey }) : null;
}

const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

function wrangler(params: string[], quiet = true) {
  const run = spawnSync(process.platform === "win32" ? "npx.cmd" : "npx", ["wrangler", ...params], {
    cwd: appRoot,
    encoding: "utf8",
    shell: process.platform === "win32",
  });
  if (run.status !== 0 && !quiet) process.stderr.write(run.stderr ?? "");
  return run;
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const dryRun = args.has("--dry-run");
  const approve = args.has("--approve");
  const rawDir = process.env.LEARN_AUDIO_DIR?.trim() || join(appRoot, "audio", "raw");
  const cacheDir = join(appRoot, "audio", "packed");
  mkdirSync(cacheDir, { recursive: true });

  let repo = resolveRepo();
  let dbItems: ContentItemRow[] = [];
  let words: SnapshotWord[] = [];
  let stage0: SnapshotStageZero[] = [];
  const existingR2Keys = new Set<string>();

  if (repo) {
    try {
      const [items, s0, assets] = await Promise.all([
        repo.listItems({ includeHidden: false }),
        repo.listStageZero(),
        repo.listAudioAssets(),
      ]);
      if (items.length > 0 || s0.length > 0) {
        dbItems = items;
        words = items;
        stage0 = s0;
        for (const asset of assets) {
          if (asset.storage === "r2" && asset.objectKey) existingR2Keys.add(asset.objectKey);
        }
      }
    } catch (error) {
      if (!dryRun) throw error;
      console.log(
        isMissingContentTableError(error)
          ? "DB: phoneme content tables not present yet; using reference JSON for dry run"
          : "DB: unavailable in dry run; falling back to reference JSON",
      );
      repo = null;
    }
  }

  if (words.length === 0) {
    const ref = snapshotFromReferenceJson();
    words = ref.items;
    stage0 = ref.stage0;
    if (!dryRun) {
      console.error("DB phoneme_content_items is empty. Run npm run content:seed before live audio upload.");
      process.exit(1);
    }
    if (repo) console.log("DB: 0 items found; dry run fell back to reference JSON");
  }

  const ids = allContentAudioIds(words, stage0);
  const raw = createRawAudio(rawDir, ids, "upload");
  const present = ids.filter((id) => existsSync(join(rawDir, `${id}.wav`)));
  const sourceHash = new Map<string, string>();
  const pending: string[] = [];

  for (const id of present) {
    const hash = sha256(readFileSync(join(rawDir, `${id}.wav`)));
    sourceHash.set(id, hash);
    const cached = join(cacheDir, `${hash}-${BITRATE}.m4a`);
    if (!existsSync(cached)) pending.push(`${join(rawDir, `${id}.wav`)}\t${cached}`);
  }

  const groups = summarizeGroupAudio(words, stage0, present);
  console.log(`audio: ${present.length} of ${ids.length} ids in ${rawDir}; ${pending.length} to encode`);
  console.log(`groups: ${groups.map((g) => `${g.groupId} ${g.present}/${g.total}`).join(", ")}`);
  console.log(`db R2 keys known: ${existingR2Keys.size}; mode: ${approve ? "approved" : "draft"}`);

  if (dryRun) {
    console.log("dry run: nothing encoded, uploaded, or written to DB");
    return;
  }

  if (!repo) {
    console.error("LEARN_DB_URL and LEARN_DB_SECRET_KEY are required for live upload.");
    process.exit(1);
  }

  if (pending.length > 0) {
    if (process.platform !== "win32") {
      console.error("m4a encoding uses the Windows built-in encoder. Run this on Windows.");
      process.exit(1);
    }
    const listPath = join(cacheDir, ".encode-list.txt");
    writeFileSync(listPath, pending.join("\n"), "utf8");
    try {
      const run = spawnSync(
        "powershell",
        ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", join(appRoot, "scripts", "encode-m4a.ps1"), "-List", listPath, "-Bitrate", String(BITRATE)],
        { stdio: "inherit" },
      );
      if (run.status !== 0) {
        console.error("m4a encoding failed");
        process.exit(1);
      }
    } finally {
      rmSync(listPath, { force: true });
    }
  }

  const toUpload = new Map<string, string>();
  const entries: UploadCandidateEntry[] = [];
  for (const id of present) {
    const cached = join(cacheDir, `${sourceHash.get(id)}-${BITRATE}.m4a`);
    const bytes = readFileSync(cached);
    if (bytes.length === 0) throw new Error(`empty m4a for ${id}`);
    const key = `a/${sha256(bytes).slice(0, 32)}.m4a`;
    if (!existingR2Keys.has(key)) toUpload.set(key, cached);
    const info = raw.info(id);
    entries.push({
      audioId: id,
      objectKey: key,
      bytes: bytes.length,
      durationMs: info?.durationMs ?? null,
      meta: raw.meta(id),
    });
  }

  console.log(`upload: ${toUpload.size} new R2 objects`);
  if (toUpload.size > 0) {
    const listPath = join(cacheDir, ".bulk-list.json");
    writeFileSync(listPath, JSON.stringify([...toUpload].map(([key, file]) => ({ key, file }))), "utf8");
    try {
      const bulk = wrangler(["r2", "bulk", "put", BUCKET, "--filename", listPath, "--content-type", "audio/mp4", "--remote"], false);
      if (bulk.status !== 0) {
        console.error("file upload failed. DB was not changed; run again to continue.");
        process.exit(1);
      }
      console.log(`  uploaded ${toUpload.size} files`);
    } finally {
      rmSync(listPath, { force: true });
    }
  }

  const plan = buildUploadAssetInputs({
    items: dbItems,
    entries,
    approve,
    nowIso: new Date().toISOString(),
  });
  const changed = await repo.upsertAudioAssets(plan.assets, plan.onConflict);
  console.log(`db: upserted ${changed} of ${plan.assets.length} asset rows (onConflict=${plan.onConflict})`);
}

const isEntry = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isEntry) {
  void main();
}
