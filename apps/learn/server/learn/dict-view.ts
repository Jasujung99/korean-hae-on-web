// 사전 풀이 자료(content/dict/entries.json)를 화면에 보낼 모양으로 바꾼다.
// 학습자에게는 approved만 보낸다. reviewMode(개발 미리보기·시험 학습자)에서는 검수 전 항목도 보낸다.
import { visibleDictEntry, type DictFile } from "../../content/dict.ts";
import type { WordDictView } from "../preview/contract.ts";

export function wordDictView(tableId: string, reviewMode: boolean, file?: DictFile): WordDictView | null {
  const entry = visibleDictEntry(tableId, reviewMode, file);
  if (!entry || (!entry.krdict && !entry.stdict)) return null;
  const kr = entry.krdict;
  const st = entry.stdict;
  return {
    status: entry.status,
    krdict: kr
      ? {
          targetCode: kr.target_code,
          pos: kr.pos,
          grade: kr.grade,
          definition: kr.definition,
          example: kr.examples[0] ?? null,
          translations: { ru: kr.translations.ru, en: kr.translations.en },
        }
      : null,
    stdict: st ? { targetCode: st.target_code, origin: st.origin, pos: st.pos, pronunciation: st.pronunciation, definition: st.definition } : null,
  };
}
