// ㅅ·ㅆ, ㄱ·ㅋ·ㄲ, ㅂ·ㅍ·ㅃ, ㄷ·ㅌ·ㄸ의 단계별 어휘 배치표(PR #5 `08` 문서 3.2~3.5, d59e569).
// ㅈ·ㅊ·ㅉ는 core-table.ts(Core 60 배치표)를 쓴다. 뜻·예문은 로드맵 JSON에 있는 것만 옮겼고, 없으면 비워 둔다.
import tablesJson from "./reference/group-core-tables.json" with { type: "json" };
import type { GroupId } from "./course-order.ts";

export type OtherGroupId = Exclude<GroupId, "j_ch_jj">;

export type GroupWord = {
  id: string;
  word: string;
  entryId: number;
  stage: "Stage 1" | "Stage 2" | "Stage 3" | "Stage 4" | "Stage 5";
  substage: null;
  consonant: string;
  note: string;
  pos: string;
  gloss: string;
  scene: string;
  example: string;
  related: string;
};

export type GroupStageZeroCell = {
  consonant: string;
  /** 들려줄 말. 모음 사이 칸은 의사단어(예: 아바), 나머지는 낱말 */
  stimulus: string;
  word: string | null;
  context: "medial_vcv" | "initial_high" | "initial_nonhigh";
};

type GroupTable = { pseudowords: string[]; stage0: GroupStageZeroCell[]; words: GroupWord[] };
type Tables = { source: { path: string; branch: string; commit: string; status: string }; note: string; groups: Record<OtherGroupId, GroupTable> };

const tables = tablesJson as unknown as Tables;

export const GROUP_TABLE_SOURCE = tables.source;
export const OTHER_GROUP_IDS = Object.keys(tables.groups) as OtherGroupId[];

export function isOtherGroup(id: string): id is OtherGroupId {
  return (OTHER_GROUP_IDS as string[]).includes(id);
}

export function groupWords(id: OtherGroupId): GroupWord[] {
  return tables.groups[id].words;
}

export function groupStageZero(id: OtherGroupId): GroupStageZeroCell[] {
  return tables.groups[id].stage0;
}

export function groupPseudowords(id: OtherGroupId): string[] {
  return tables.groups[id].pseudowords;
}
