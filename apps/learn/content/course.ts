// 공통 커리큘럼의 자음 묶음 순서와 단계 요약.
// 원천: PR #5 `docs/adult-phoneme-app/content/consonant-groups-roadmap.json` (초안, 승인 전).
// 그 파일의 macro_sequence 순서는 ㅈ·ㅊ·ㅉ → ㅂ·ㅍ·ㅃ → ㄱ·ㅋ·ㄲ → ㄷ·ㅌ·ㄸ → ㅅ·ㅆ 이지만,
// 2026-11-17 사용자 결정으로 아래 COURSE_ORDER를 따른다.
import { COURSE_ORDER, PRACTICE_READY_GROUPS, type GroupId } from "./course-order.ts";
import roadmapJson from "./reference/consonant-groups-roadmap.json" with { type: "json" };
import { stageZeroCells, wordsInStage, type CoreStageKey } from "./core-table.ts";
import { contrastOf, orderInStage } from "./contrast.ts";

export { COURSE_ORDER, COURSE_ORDER_NOTE, PRACTICE_READY_GROUPS, type GroupId } from "./course-order.ts";

export const COURSE_SOURCE = {
  path: "docs/adult-phoneme-app/content/consonant-groups-roadmap.json",
  branch: "codex/obstruent-curriculum-and-l1-tuning",
  commit: "d59e569",
  status: "draft",
} as const;

export type RoadmapWord = {
  source_entry_id?: number;
  word?: string;
  pos?: string;
  substage?: string;
  syllable_index?: number;
  written_jamo?: string;
  surface_phoneme?: string;
  word_position?: string;
  previous_segment?: string;
  following_vowel?: string;
  phonological_process?: string;
  pill_label?: string;
  gloss?: string;
  scene?: string;
  example?: string;
  related?: string;
  stimulus?: string;
  target?: string;
  context?: string;
  note?: string;
};

type Roadmap = {
  macro_sequence: Array<{
    order: number;
    group_id: string;
    label: string;
    phonetic_category: string;
    choices: string[];
    rationale: string;
  }>;
  stage_definitions: Array<{ stage: string; title: string; ux_mode: string; description: string }>;
  consonant_groups: Record<
    string,
    { group_id: string; label: string; pseudowords_stage1: string[]; stages: Record<string, RoadmapWord[]> }
  >;
};

const roadmap = roadmapJson as unknown as Roadmap;

export type CourseStage = {
  stage: string;
  title: string;
  count: number;
  samples: string[];
};

export type CourseGroup = {
  id: GroupId;
  order: number;
  label: string;
  choices: string[];
  category: string;
  rationale: string;
  pseudowords: string[];
  stages: CourseStage[];
  status: "practice" | "planned";
};

// 묶음끼리 섞지 않기로 해서(MIX_GROUPS = false) Stage 5 제목에서 치찰음 교차를 뺀다.
const STAGE_TITLE_OVERRIDES: Record<string, string> = {
  "Stage 5": "받침·음운 변동(경음화·격음화)과 새 목소리",
  "Stage 1-A": "모음 사이 — 울리는 ㅈ을 ㅊ·ㅉ와 떼어 듣기",
  "Stage 1-B": "모음 사이 — ㅊ(긴 바람)과 ㅉ(긴 멈춤) 집중 비교",
};

const CORE_STAGE_KEYS: CoreStageKey[] = ["Stage 1-A", "Stage 1-B", "Stage 2", "Stage 3", "Stage 4", "Stage 5"];

/** ㅈ·ㅊ·ㅉ는 Core 60 배치표(후보 103개)를 쓴다. */
function coreStages(): CourseStage[] {
  const zero = stageZeroCells();
  return [
    {
      stage: "Stage 0",
      title: stageTitle("Stage 0"),
      count: zero.length,
      samples: zero.slice(0, 4).map((cell) => (cell.word ? `${cell.stimulus}/${cell.word}` : cell.stimulus)),
    },
    ...CORE_STAGE_KEYS.map((key) => {
      const words = orderInStage(wordsInStage(key), (word) => contrastOf("j_ch_jj", word.word, word.consonant, word.stage)?.tier ?? null);
      return { stage: key, title: stageTitle(key), count: words.length, samples: words.slice(0, 4).map((word) => word.word) };
    }),
  ];
}

function stageTitle(stage: string): string {
  return STAGE_TITLE_OVERRIDES[stage] ?? roadmap.stage_definitions.find((row) => row.stage === stage)?.title ?? stage;
}

export function courseGroups(): CourseGroup[] {
  return COURSE_ORDER.map((id, index) => {
    const macro = roadmap.macro_sequence.find((row) => row.group_id === id);
    const group = roadmap.consonant_groups[id];
    if (!macro || !group) throw new Error(`roadmap has no group ${id}`);
    const stages = id === "j_ch_jj" ? coreStages() : Object.entries(group.stages).map(([stage, rows]) => ({
      stage,
      title: stageTitle(stage),
      count: rows.length,
      samples: rows
        .map((row) => row.word ?? row.stimulus ?? "")
        .filter(Boolean)
        .slice(0, 4),
    }));
    return {
      id,
      order: index + 1,
      label: macro.label,
      choices: macro.choices,
      category: macro.phonetic_category,
      rationale: macro.rationale,
      pseudowords: group.pseudowords_stage1,
      stages,
      status: PRACTICE_READY_GROUPS.includes(id) ? "practice" : "planned",
    };
  });
}

/** 로드맵의 원래 우선순위(비교용) */
export function roadmapPriority(): string[] {
  return [...roadmap.macro_sequence].sort((a, b) => a.order - b.order).map((row) => row.group_id);
}

export function stageWords(groupId: GroupId, stage: string): RoadmapWord[] {
  return roadmap.consonant_groups[groupId]?.stages[stage] ?? [];
}
