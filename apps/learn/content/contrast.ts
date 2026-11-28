// 최소·준최소대립쌍(P-001~P-340) 4단계 분류와 Stage 내부 3단 출제 순서.
// 원천: PR #5 `docs/adult-phoneme-app/content/minimal-pair-groups.json` (초안, 승인 전)와
// `l1-adaptive-tuning-policy.json`의 contrast_tier_progression_and_abx_matching.
// 묶음 번호는 이 JSON 카탈로그를 기준으로 한다(설계서 본문의 번호와 다른 곳이 있다).
// 서버·검증에서만 쓴다. 카탈로그가 커서 브라우저 묶음에 넣지 않는다.
import catalogJson from "./reference/minimal-pair-groups.json" with { type: "json" };
import type { GroupId } from "./course-order.ts";

export const CONTRAST_SOURCE = {
  path: "docs/adult-phoneme-app/content/minimal-pair-groups.json",
  branch: "codex/obstruent-curriculum-and-l1-tuning",
  commit: "d59e569",
  status: "draft",
} as const;

export type ContrastTier = 1 | 2 | 3 | 4;
export type InStageStep = 1 | 2 | 3;
type Slot = "lenis" | "aspirated" | "fortis";

export type PairGroup = {
  pair_group_id: string;
  group_id: GroupId;
  contrast_tier: ContrastTier;
  contrast_type: string;
  position: string;
  position_type: "onset" | "coda";
  recommended_stage: string;
  comparison_frame: string | null;
  slots: Record<Slot, string[]>;
};

const catalog = catalogJson as unknown as { schema_version: string; total_pair_groups: number; pair_groups: PairGroup[] };

/** 묶음별 평음·격음·경음 글자. ㅅ·ㅆ에는 격음이 없다. */
const SLOT_JAMO: Record<GroupId, Record<Slot, string | null>> = {
  j_ch_jj: { lenis: "ㅈ", aspirated: "ㅊ", fortis: "ㅉ" },
  s_ss: { lenis: "ㅅ", aspirated: null, fortis: "ㅆ" },
  g_k_kk: { lenis: "ㄱ", aspirated: "ㅋ", fortis: "ㄲ" },
  b_p_pp: { lenis: "ㅂ", aspirated: "ㅍ", fortis: "ㅃ" },
  d_t_tt: { lenis: "ㄷ", aspirated: "ㅌ", fortis: "ㄸ" },
};

const SLOTS: Slot[] = ["lenis", "aspirated", "fortis"];

export function pairGroups(groupId?: GroupId): PairGroup[] {
  return groupId ? catalog.pair_groups.filter((row) => row.group_id === groupId) : catalog.pair_groups;
}

export function pairGroup(id: string): PairGroup | undefined {
  return catalog.pair_groups.find((row) => row.pair_group_id === id);
}

function slotOf(groupId: GroupId, jamo: string): Slot | null {
  return SLOTS.find((slot) => SLOT_JAMO[groupId][slot] === jamo) ?? null;
}

/** Step 1 기준점 잡기(Tier 1·2) → Step 2 음절 틀 넓히기(Tier 3) → Step 3 실전 어휘 일반화(Tier 4와 짝 없는 맥락 확장 어휘). */
export function inStageStep(tier: ContrastTier | null): InStageStep {
  if (tier === 1 || tier === 2) return 1;
  if (tier === 3) return 2;
  return 3;
}

export const STEP_LABELS: Record<InStageStep, string> = {
  1: "기준점 잡기",
  2: "음절 틀 넓히기",
  3: "실전 어휘 일반화",
};

export type Contrast = {
  pairGroupId: string;
  tier: ContrastTier;
  type: string;
  frame: string | null;
  /** 같은 묶음 안의 상대 낱말(자기 자신은 뺀다). 자음 글자별. */
  partners: Array<{ consonant: string; word: string }>;
};

/**
 * 낱말이 든 대립쌍 묶음. 여러 묶음에 들어 있으면 같은 Stage를 먼저, 그다음 Tier가 낮은(더 순수한) 묶음을 고른다.
 * 목표 자음 칸에 그 낱말이 있는 묶음만 본다.
 */
export function contrastsOf(groupId: GroupId, word: string, target: string, stage?: string): PairGroup[] {
  const slot = slotOf(groupId, target);
  if (!slot) return [];
  return pairGroups(groupId)
    .filter((row) => row.slots[slot].includes(word))
    .sort(
      (a, b) =>
        Number(b.recommended_stage === stage) - Number(a.recommended_stage === stage) ||
        a.contrast_tier - b.contrast_tier ||
        a.pair_group_id.localeCompare(b.pair_group_id),
    );
}

export function contrastOf(groupId: GroupId, word: string, target: string, stage?: string): Contrast | null {
  const row = contrastsOf(groupId, word, target, stage)[0];
  if (!row) return null;
  const partners = SLOTS.flatMap((slot) => {
    const consonant = SLOT_JAMO[groupId][slot];
    if (!consonant) return [];
    return row.slots[slot].filter((other) => other !== word).map((other) => ({ consonant, word: other }));
  });
  return { pairGroupId: row.pair_group_id, tier: row.contrast_tier, type: row.contrast_type, frame: row.comparison_frame, partners };
}

/** Stage 안에서 Step 1 → 2 → 3 순서로 세운다. 같은 Step 안에서는 원래 순서를 지킨다. */
export function orderInStage<T>(items: readonly T[], tierOf: (item: T) => ContrastTier | null): T[] {
  return items
    .map((item, index) => ({ item, index, step: inStageStep(tierOf(item)), tier: tierOf(item) ?? 5 }))
    .sort((a, b) => a.step - b.step || a.tier - b.tier || a.index - b.index)
    .map((row) => row.item);
}

export type Partner = { word: string; consonant: string; tier: ContrastTier; pairGroupId: string };

/**
 * 오답 직후 [정답 소리] vs [내 선택]과 ABX에 쓸 상대 낱말.
 * 같은 묶음 안에서 Tier 1 → 2 → 3 → 4 순으로 찾는다. 없으면 null(부르는 쪽이 Stage 1 의사단어로 대신한다).
 */
export function resolvePartner(input: { groupId: GroupId; word: string; target: string; other: string; stage?: string }): Partner | null {
  const otherSlot = slotOf(input.groupId, input.other);
  if (!otherSlot || input.other === input.target) return null;
  const candidates = contrastsOf(input.groupId, input.word, input.target, input.stage)
    .filter((row) => row.slots[otherSlot].length > 0)
    .sort((a, b) => a.contrast_tier - b.contrast_tier);
  const row = candidates[0];
  const word = row?.slots[otherSlot][0];
  if (!row || !word) return null;
  return { word, consonant: input.other, tier: row.contrast_tier, pairGroupId: row.pair_group_id };
}

/** 평음–경음 비교에서는 경음을 기준음 A로 먼저 들려준다(fortis_first_standard_rule). 그 밖의 짝은 null. */
export function fortisFirst(groupId: GroupId, first: string, second: string): [string, string] | null {
  const lenis = SLOT_JAMO[groupId].lenis;
  const fortis = SLOT_JAMO[groupId].fortis;
  if (first === fortis && second === lenis) return [first, second];
  if (first === lenis && second === fortis) return [second, first];
  return null;
}

/** Tier 2(-다 유무)는 낱말 글자 보기로 내면 길이로 찍을 수 있다. 본 퀴즈 보기는 자음 글자만 쓴다. */
export function choiceStyle(tier: ContrastTier | null): "consonant_only" | "word_or_consonant" {
  return tier === 2 ? "consonant_only" : "word_or_consonant";
}

export type TierBand = "tier12" | "tier34" | "unpaired";

/** 교사 관찰용 구분: Tier 1·2(순수 음향 변별) / Tier 3·4(어휘 맥락 전이) / 짝 없음(의사단어·맥락 확장 어휘). */
export function tierBand(tier: number | null | undefined): TierBand {
  if (tier === 1 || tier === 2) return "tier12";
  if (tier === 3 || tier === 4) return "tier34";
  return "unpaired";
}
