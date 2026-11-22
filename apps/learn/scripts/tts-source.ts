// TTS 생성·업로드 스크립트가 쓸 콘텐츠 원본을 고른다.
// 기본은 운영 DB 작업 표(숨김 제외, draft·approved). 예전 기준 JSON은 `--source json`으로만 쓴다.
// DB 연결이 없거나 실패하면 JSON으로 조용히 넘어가지 않고 멈춘다(생성 대상이 어긋나지 않게).
import { snapshotFromReferenceJson, workingSnapshot, type ContentSnapshot, type ReleaseCandidateItem } from "../content/snapshot.ts";
import type { AudioAssetRow, ContentItemRow, ContentRepo } from "../server/content/repo.ts";
import { resolveContentRepo } from "./tts-usage-log.ts";

export type TtsSourceKind = "db" | "json";

export type TtsSource = {
  kind: TtsSourceKind;
  snapshot: ContentSnapshot;
  /** DB 단어 행(업로드 때 item_id 연결용). JSON이면 빈 배열 */
  items: ContentItemRow[];
  /** DB 음원 자산. JSON이면 빈 배열 */
  assets: AudioAssetRow[];
  repo: ContentRepo | null;
};

export class TtsSourceError extends Error {}

export function sourceKindFromArgs(argv: readonly string[]): TtsSourceKind {
  const index = argv.indexOf("--source");
  const value = index < 0 ? "db" : (argv[index + 1] ?? "").trim().toLowerCase();
  if (value !== "db" && value !== "json") throw new TtsSourceError("--source accepts db or json.");
  return value;
}

export async function loadTtsSource(
  kind: TtsSourceKind,
  repo: ContentRepo | null = kind === "db" ? resolveContentRepo() : null,
): Promise<TtsSource> {
  if (kind === "json") {
    return { kind, snapshot: snapshotFromReferenceJson(), items: [], assets: [], repo: null };
  }
  if (!repo) {
    throw new TtsSourceError(
      "DB settings were not found (LEARN_DB_URL / LEARN_DB_SECRET_KEY or the key files). Stopping; use --source json only if you really want the old JSON table.",
    );
  }
  let items: ContentItemRow[];
  let assets: AudioAssetRow[];
  let stage0;
  try {
    [items, stage0, assets] = await Promise.all([repo.listItems({ includeHidden: false }), repo.listStageZero(), repo.listAudioAssets()]);
  } catch {
    throw new TtsSourceError("Could not read the content DB. Stopping so the target list does not drift from the DB.");
  }
  if (items.length === 0) {
    throw new TtsSourceError("The content DB has no words. Stopping; run npm run content:seed first or use --source json.");
  }
  const snapshot = workingSnapshot(items as ReleaseCandidateItem[], stage0);
  return { kind, snapshot, items, assets, repo };
}

/** draft·approved이고 stale이 아닌 음원 자산의 audio_id → 글자들 */
export function activeAssetTexts(assets: readonly AudioAssetRow[]): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const asset of assets) {
    if ((asset.status !== "draft" && asset.status !== "approved") || asset.stale) continue;
    const texts = out.get(asset.audioId) ?? new Set<string>();
    texts.add(asset.text.trim());
    out.set(asset.audioId, texts);
  }
  return out;
}
