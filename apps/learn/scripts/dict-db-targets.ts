// 사전 수집(scripts/dict-fetch.ts)이 읽을 낱말을 운영 DB(phoneme_content_items)에서 가져오는 도우미.
// content/dict.ts는 Cloudflare 워커에 묶여 들어가므로 DB·파일 접근은 여기(scripts/)에만 둔다.
// DB는 읽기만 한다(listItems 한 번). 키는 resolveContentRepo()가 환경 변수나 _keys 파일에서 읽고, 출력하지 않는다.
import type { DictTarget } from "../content/dict.ts";
import type { ContentItemRow } from "../server/content/repo.ts";
import { resolveContentRepo } from "./tts-usage-log.ts";

/** legacy_id가 없어 이번 사전 자료에 넣지 않은 DB 낱말(보고용) */
export type DbSkippedWord = { id: string; word: string; group: string; stage: string };

export type DbDictTargets = { targets: DictTarget[]; skipped: DbSkippedWord[]; hidden: number };

export class DictDbError extends Error {}

/**
 * 숨김(hidden)이 아닌 DB 낱말을 사전 대상으로 바꾼다. 항목 키는 legacy_id(학습자 카드가 legacyId ?? id로 찾는다).
 * legacy_id가 없는 낱말은 넣지 않고 skipped로 돌려준다. 같은 legacy_id가 둘 이상이면 멈춘다.
 */
export function dictTargetsFromRows(rows: ContentItemRow[]): DbDictTargets {
  const targets: DictTarget[] = [];
  const skipped: DbSkippedWord[] = [];
  const seen = new Set<string>();
  let hidden = 0;
  for (const row of rows) {
    if (row.status === "hidden") {
      hidden += 1;
      continue;
    }
    const legacyId = row.legacyId?.trim() ?? "";
    if (!legacyId) {
      skipped.push({ id: row.id, word: row.word, group: row.groupId, stage: row.stage });
      continue;
    }
    if (seen.has(legacyId)) throw new DictDbError(`DB에 같은 legacy_id(${legacyId})가 둘 이상 있어요.`);
    seen.add(legacyId);
    targets.push({ id: legacyId, word: row.word.trim(), pos: row.pos.trim(), gloss: row.gloss.trim(), group: row.groupId });
  }
  return { targets, skipped, hidden };
}

/** DB에서 사전 대상을 읽는다. 연결 설정이 없거나 읽기가 실패하면 DictDbError로 멈춘다(JSON으로 넘어가지 않는다). */
export async function dictTargetsFromDb(): Promise<DbDictTargets> {
  const repo = resolveContentRepo();
  if (!repo) {
    throw new DictDbError("DB 연결 설정(LEARN_DB_URL·LEARN_DB_SECRET_KEY 또는 _keys 파일)을 찾지 못했어요. 옛 단어표로 돌리려면 --source json을 붙여요.");
  }
  let rows: ContentItemRow[];
  try {
    rows = await repo.listItems({ includeHidden: true });
  } catch (error) {
    throw new DictDbError(`DB에서 낱말을 읽지 못했어요(${error instanceof Error ? error.message : String(error)}).`);
  }
  if (rows.length === 0) throw new DictDbError("DB phoneme_content_items에 낱말이 없어요.");
  return dictTargetsFromRows(rows);
}