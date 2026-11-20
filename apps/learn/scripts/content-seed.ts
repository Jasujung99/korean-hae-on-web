// 기준 JSON 두 개와 R2 manifest.json을 Supabase 콘텐츠 표(phoneme_content_*, phoneme_audio_assets)로 들여오고
// 첫 게시본(seq=1)을 만든다. 여러 번 실행해도 같은 결과가 나와야 한다(멱등).
//   npm run content:seed -- --dry-run
//   npm run content:seed
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  buildReleaseSnapshot,
  snapshotFromReferenceJson,
  snapshotSentenceAudioBase,
  snapshotWordAudioBase,
  type ReleaseCandidateAsset,
  type ReleaseCandidateItem,
} from "../content/snapshot.ts";
import type { PackedAudioEntry, PackedAudioManifest } from "../server/cloud/packed-audio.ts";
import { EMPTY_MANIFEST, MANIFEST_KEY } from "../server/cloud/packed-audio.ts";
import type { AudioAssetKind, ContentRepo, NewAudioAssetInput } from "../server/content/repo.ts";
import { createSupabaseContentRepo } from "../server/content/supabase-repo.ts";

const BUCKET = "haeon-sori-audio";
const KEYS_DIR = "I:/내 드라이브/_keys";
const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export type ParsedAudioMeta = {
  kind: AudioAssetKind;
  voiceKey: string;
  normalizedBase: string;
};

export function parseR2AudioMeta(audioId: string, entry: PackedAudioEntry): ParsedAudioMeta {
  const isTurns = audioId.endsWith("--turns");
  const withoutTurns = isTurns ? audioId.slice(0, -7) : audioId;

  if (withoutTurns.startsWith("audition-")) {
    const fallbackVoice = withoutTurns.replace(/^audition-/, "").replace(/-flat$/, "");
    return {
      kind: "audition",
      voiceKey: (entry.meta?.voice || fallbackVoice).toLowerCase(),
      normalizedBase: withoutTurns,
    };
  }

  const voiceMatch = withoutTurns.match(/--([a-z]+)$/);
  const base = voiceMatch ? withoutTurns.slice(0, -voiceMatch[0].length) : withoutTurns;
  const voiceKey = voiceMatch
    ? (voiceMatch[1] ?? "iapetus")
    : (entry.meta?.voice || "iapetus").toLowerCase();

  let kind: AudioAssetKind = "pseudo";
  let normalizedBase = base;
  if (isTurns) {
    kind = "sentence_turns";
    normalizedBase = base.replace(/^sentence-Stage1-/, "sentence-");
  } else if (base.startsWith("sentence-")) {
    kind = "sentence";
    normalizedBase = base.replace(/^sentence-Stage1-/, "sentence-");
  } else if (base.startsWith("word-")) {
    kind = "word";
    normalizedBase = base.replace(/^word-Stage1-/, "word-");
  } else if (base.startsWith("pw-")) {
    const text = base.slice(3);
    kind = text.length === 1 ? "syllable" : "pseudo";
  }

  return { kind, voiceKey, normalizedBase };
}

export function buildSeedPlan(manifest: PackedAudioManifest) {
  const ref = snapshotFromReferenceJson();
  const itemInputs = ref.items.map((item) => ({
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
    source: "roadmap_seed" as const,
    status: "approved" as const,
    createdBy: null,
  }));

  const stage0Inputs = ref.stage0.map((row) => ({
    groupId: row.groupId,
    consonant: row.consonant,
    stimulus: row.stimulus,
    word: row.word,
    context: row.context,
    kind: row.kind,
    sortOrder: row.sortOrder,
  }));

  const assetEntries = Object.entries(manifest.files).map(([audioId, entry]) => ({
    audioId,
    entry,
    parsed: parseR2AudioMeta(audioId, entry),
  }));

  return { itemInputs, stage0Inputs, assetEntries };
}

export type SeedResult = {
  itemsInserted: number;
  itemsTotal: number;
  stage0Inserted: number;
  stage0Total: number;
  assetsUpserted: number;
  releaseSeq: number;
  releaseCreated: boolean;
  releaseItemCount: number;
  releaseAudioCount: number;
};

export async function runContentSeed(
  repo: ContentRepo,
  manifest: PackedAudioManifest,
  options: { nowIso?: string } = {},
): Promise<SeedResult> {
  const { itemInputs, stage0Inputs, assetEntries } = buildSeedPlan(manifest);
  const itemsInserted = await repo.seedItems(itemInputs);
  const stage0Inserted = await repo.seedStageZero(stage0Inputs);

  const dbItems = await repo.listItems({ includeHidden: true });
  const baseToItemIds = new Map<string, string[]>();
  const linkBase = (base: string, itemId: string) => {
    const list = baseToItemIds.get(base) ?? [];
    list.push(itemId);
    baseToItemIds.set(base, list);
  };
  for (const item of dbItems) {
    linkBase(snapshotWordAudioBase(item), item.id);
    if (item.example) linkBase(snapshotSentenceAudioBase(item), item.id);
  }

  const audioInputs: NewAudioAssetInput[] = assetEntries.map(({ audioId, entry, parsed }) => {
    const linked = baseToItemIds.get(parsed.normalizedBase);
    const itemId = linked && linked.length === 1 ? (linked[0] ?? null) : null;
    return {
      audioId,
      itemId,
      kind: parsed.kind,
      voiceKey: parsed.voiceKey,
      storage: "r2",
      objectKey: entry.file,
      mime: entry.type || "audio/mp4",
      bytes: entry.bytes,
      durationMs: entry.durationMs,
      sha256: entry.meta?.sha256 ?? "",
      status: "approved",
      stale: false,
      source: "import",
      model: entry.meta?.model ?? "",
      stylePrompt: entry.meta?.stylePrompt ?? null,
      text: entry.meta?.text ?? "",
      generatedAt: entry.meta?.generatedAt || null,
      reviewedBy: null,
      reviewedAt: options.nowIso ?? null,
    };
  });

  const assetsUpserted = await repo.upsertAudioAssets(audioInputs, "ignore");

  const existingRelease = await repo.latestRelease();
  if (existingRelease) {
    return {
      itemsInserted,
      itemsTotal: dbItems.length,
      stage0Inserted,
      stage0Total: (await repo.listStageZero()).length,
      assetsUpserted,
      releaseSeq: existingRelease.seq,
      releaseCreated: false,
      releaseItemCount: existingRelease.itemCount,
      releaseAudioCount: existingRelease.audioCount,
    };
  }

  const [allAssets, stage0Rows] = await Promise.all([repo.listAudioAssets(), repo.listStageZero()]);
  const releasedAt = options.nowIso ?? new Date().toISOString();
  const { snapshot, itemCount, audioCount } = buildReleaseSnapshot(
    dbItems as ReleaseCandidateItem[],
    stage0Rows,
    allAssets as ReleaseCandidateAsset[],
    1,
    releasedAt,
  );
  const created = await repo.createRelease({
    releasedBy: null,
    note: "초기 들여오기",
    snapshot,
    itemCount,
    audioCount,
  });

  return {
    itemsInserted,
    itemsTotal: dbItems.length,
    stage0Inserted,
    stage0Total: stage0Rows.length,
    assetsUpserted,
    releaseSeq: created.seq,
    releaseCreated: true,
    releaseItemCount: created.itemCount,
    releaseAudioCount: created.audioCount,
  };
}

function argValue(flag: string): string | null {
  const idx = process.argv.indexOf(flag);
  return idx < 0 ? null : (process.argv[idx + 1] ?? null);
}

function readKeyFile(filename: string): string {
  const path = join(KEYS_DIR, filename);
  if (!existsSync(path)) return "";
  return readFileSync(path, "utf8").replace(/^\uFEFF/, "").trim();
}

function loadManifestFromR2(): PackedAudioManifest {
  const explicit = argValue("--manifest");
  if (explicit) {
    return JSON.parse(readFileSync(explicit, "utf8")) as PackedAudioManifest;
  }
  const tmpFile = join(tmpdir(), `haeon-seed-manifest-${Date.now()}.json`);
  try {
    const run = spawnSync(
      process.platform === "win32" ? "npx.cmd" : "npx",
      ["wrangler", "r2", "object", "get", `${BUCKET}/${MANIFEST_KEY}`, "--file", tmpFile, "--remote"],
      { cwd: appRoot, encoding: "utf8", shell: process.platform === "win32" },
    );
    if (run.status === 0 && existsSync(tmpFile)) {
      return JSON.parse(readFileSync(tmpFile, "utf8")) as PackedAudioManifest;
    }
    console.error("warning: failed to download manifest.json from R2; continuing with empty manifest");
    return EMPTY_MANIFEST;
  } finally {
    rmSync(tmpFile, { force: true });
  }
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const manifest = loadManifestFromR2();
  const plan = buildSeedPlan(manifest);

  const byGroup = new Map<string, number>();
  for (const item of plan.itemInputs) {
    byGroup.set(item.groupId, (byGroup.get(item.groupId) ?? 0) + 1);
  }
  const pseudoCount = plan.stage0Inputs.filter((r) => r.kind === "pseudoword").length;
  const cellCount = plan.stage0Inputs.filter((r) => r.kind === "cell").length;
  const byKind = new Map<string, number>();
  for (const row of plan.assetEntries) {
    byKind.set(row.parsed.kind, (byKind.get(row.parsed.kind) ?? 0) + 1);
  }

  console.log(
    `seed plan: ${plan.itemInputs.length} words (${[...byGroup.entries()].map(([k, v]) => `${k}=${v}`).join(", ")}), stage0=${cellCount} cells + ${pseudoCount} pseudowords, manifest audio=${plan.assetEntries.length} (${[...byKind.entries()].map(([k, v]) => `${k}=${v}`).join(", ")})`,
  );

  if (dryRun) {
    console.log("dry run: nothing written to DB. Planned initial release seq=1.");
    return;
  }

  const dbUrl = process.env.LEARN_DB_URL?.trim() || readKeyFile("supabase_url.txt");
  const secretKey = process.env.LEARN_DB_SECRET_KEY?.trim() || readKeyFile("supabase_secret_key.txt");
  if (!dbUrl || !secretKey) {
    console.error("LEARN_DB_URL and LEARN_DB_SECRET_KEY are required for live seed.");
    process.exit(1);
  }

  const repo = createSupabaseContentRepo({ url: dbUrl, secretKey });
  const result = await runContentSeed(repo, manifest);
  console.log(
    `seed done: items +${result.itemsInserted} (total ${result.itemsTotal}), stage0 +${result.stage0Inserted} (total ${result.stage0Total}), assets inserted=${result.assetsUpserted}, release seq=${result.releaseSeq} (${result.releaseCreated ? "created" : "existing"}, ${result.releaseItemCount} items, ${result.releaseAudioCount} audio)`,
  );
}

const isEntry = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isEntry) {
  void main();
}
