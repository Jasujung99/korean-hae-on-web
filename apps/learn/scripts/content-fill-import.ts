// drafts-2026-11-20.jsonl 초안·뜻 정리를 운영 DB phoneme_content_proposals 표에 넣는다.
// 기본은 --dry-run 이며 --apply 를 줄 때만 실제로 DB에 쓴다. 키는 출력하지 않는다.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { ContentItemRow, ContentRepo, NewContentProposalInput } from "../server/content/repo.ts";
import { createSupabaseContentRepo } from "../server/content/supabase-repo.ts";

const KEYS_DIR = "I:/내 드라이브/_keys";
const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const defaultDraftsPath = join(appRoot, "content", "fill", "drafts-2026-11-20.jsonl");

export type DraftFillEntry = {
  id: string;
  legacy_id?: string | null;
  word: string;
  kind?: "fill";
  sense?: string;
  gloss: string;
  scene: string;
  example: string;
  related: string[] | string;
  pos?: string;
  flags?: string[];
  model: string;
  prompt_version: string;
};

export type DraftCleanupEntry = {
  id: string;
  legacy_id?: string | null;
  word: string;
  kind: "cleanup";
  gloss: string;
  note: string;
  flags?: string[];
  model: string;
  prompt_version: string;
};

export type DraftEntry = DraftFillEntry | DraftCleanupEntry;

export function parseDraftsJsonl(raw: string): DraftEntry[] {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as DraftEntry);
}

export function buildProposalInputs(
  entries: readonly DraftEntry[],
  itemsById: ReadonlyMap<string, Pick<ContentItemRow, "id" | "pos" | "word" | "status">>,
): { inputs: NewContentProposalInput[]; missingIds: string[]; hiddenIds: string[] } {
  const inputs: NewContentProposalInput[] = [];
  const missingIds: string[] = [];
  const hiddenIds: string[] = [];

  for (const row of entries) {
    const item = itemsById.get(row.id);
    if (!item) {
      missingIds.push(`${row.id} (${row.word})`);
      continue;
    }
    if (item.status === "hidden") {
      hiddenIds.push(`${row.id} (${row.word})`);
      continue;
    }

    if (row.kind === "cleanup") {
      inputs.push({
        itemId: row.id,
        kind: "cleanup",
        fields: {
          gloss: row.gloss,
          note: row.note,
        },
        sense: "출제 위치 표시를 뜻에서 메모로 분리",
        flags: Array.isArray(row.flags) ? [...row.flags] : [],
        source: "ai_draft",
        model: String(row.model),
        promptVersion: String(row.prompt_version),
      });
    } else {
      const relatedStr = Array.isArray(row.related) ? row.related.join(", ") : String(row.related ?? "");
      const includePos = !item.pos.trim() && Boolean(row.pos && row.pos.trim());
      inputs.push({
        itemId: row.id,
        kind: "fill",
        fields: {
          gloss: row.gloss,
          scene: row.scene,
          example: row.example,
          related: relatedStr,
          ...(includePos && row.pos ? { pos: row.pos.trim() } : {}),
        },
        sense: String(row.sense ?? ""),
        flags: Array.isArray(row.flags) ? [...row.flags] : [],
        source: "ai_draft",
        model: String(row.model),
        promptVersion: String(row.prompt_version),
      });
    }
  }

  return { inputs, missingIds, hiddenIds };
}

export async function importProposals(
  repo: ContentRepo,
  entries: readonly DraftEntry[],
  options: { apply?: boolean } = {},
): Promise<{
  mode: "dry-run" | "apply";
  total: number;
  fillCount: number;
  cleanupCount: number;
  missingIds: string[];
  hiddenIds: string[];
  wouldInsert: number;
  wouldSkip: number;
  inserted: number;
  skipped: number;
}> {
  const allItems = await repo.listItems({ includeHidden: true });
  const itemsById = new Map(allItems.map((item) => [item.id, item]));
  const { inputs, missingIds, hiddenIds } = buildProposalInputs(entries, itemsById);

  const pending = await repo.listProposals({ status: "pending" });
  const existingKeys = new Set(pending.map((row) => `${row.itemId}:${row.promptVersion}`));

  let wouldInsert = 0;
  let wouldSkip = 0;
  const seenInBatch = new Set<string>();
  for (const input of inputs) {
    const key = `${input.itemId}:${input.promptVersion}`;
    if (existingKeys.has(key) || seenInBatch.has(key)) {
      wouldSkip += 1;
    } else {
      seenInBatch.add(key);
      wouldInsert += 1;
    }
  }

  const fillCount = inputs.filter((input) => input.kind === "fill").length;
  const cleanupCount = inputs.filter((input) => input.kind === "cleanup").length;

  if (!options.apply || missingIds.length > 0) {
    return {
      mode: "dry-run",
      total: entries.length,
      fillCount,
      cleanupCount,
      missingIds,
      hiddenIds,
      wouldInsert,
      wouldSkip,
      inserted: 0,
      skipped: 0,
    };
  }

  const result = await repo.insertProposals(inputs);
  return {
    mode: "apply",
    total: entries.length,
    fillCount,
    cleanupCount,
    missingIds,
    hiddenIds,
    wouldInsert,
    wouldSkip,
    inserted: result.inserted,
    skipped: result.skipped,
  };
}

function readKeyFile(filename: string): string {
  const path = join(KEYS_DIR, filename);
  if (!existsSync(path)) return "";
  return readFileSync(path, "utf8").replace(/^\uFEFF/, "").trim();
}

function parseCliArgs(argv: readonly string[]): { apply: boolean; filePath: string } {
  let apply = false;
  let filePath = defaultDraftsPath;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--apply") apply = true;
    else if (arg === "--dry-run") apply = false;
    else if (arg === "--file" && argv[i + 1]) {
      filePath = resolve(argv[i + 1] as string);
      i += 1;
    }
  }
  return { apply, filePath };
}

async function main() {
  const { apply, filePath } = parseCliArgs(process.argv.slice(2));
  const dbUrl = (process.env.LEARN_DB_URL ?? "").trim() || readKeyFile("supabase_url.txt");
  const secretKey = (process.env.LEARN_DB_SECRET_KEY ?? "").trim() || readKeyFile("supabase_secret_key.txt");
  if (!dbUrl || !secretKey) {
    console.error("LEARN_DB_URL and LEARN_DB_SECRET_KEY are required.");
    process.exit(1);
  }
  if (!existsSync(filePath)) {
    console.error(`Draft file not found: ${filePath}`);
    process.exit(1);
  }

  const entries = parseDraftsJsonl(readFileSync(filePath, "utf8"));
  const repo = createSupabaseContentRepo({ url: dbUrl, secretKey });
  const summary = await importProposals(repo, entries, { apply });

  if (summary.missingIds.length > 0) {
    console.error(`missing_items (${summary.missingIds.length}): ${summary.missingIds.join(", ")}`);
    process.exit(1);
  }

  console.log(
    `mode=${summary.mode} total=${summary.total} fill=${summary.fillCount} cleanup=${summary.cleanupCount}` +
      ` wouldInsert=${summary.wouldInsert} wouldSkip=${summary.wouldSkip}` +
      (summary.hiddenIds.length > 0 ? ` hiddenSkipped=${summary.hiddenIds.length}` : "") +
      (summary.mode === "apply" ? ` inserted=${summary.inserted} skipped=${summary.skipped}` : ""),
  );
}

const isEntry = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isEntry) {
  void main();
}
