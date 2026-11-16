import type { ItemVersion, PracticeSlot, SelectionSlotKind } from "./types.ts";

export const SELECTION_POLICY_VERSION = "balanced-v1";

const DEFAULT_COUNTS = { common: 6, weak: 3, review: 3 };

export type SelectableItem = {
  id: string;
  consonant: string;
};

export function selectPracticeSet(
  items: SelectableItem[],
  options?: {
    policyVersion?: string;
    weakIds?: string[];
    reviewIds?: string[];
    counts?: { common: number; weak: number; review: number };
  },
): { policyVersion: string; slots: PracticeSlot[] } {
  const policyVersion = options?.policyVersion ?? SELECTION_POLICY_VERSION;
  const counts = options?.counts ?? DEFAULT_COUNTS;
  const weakIds = new Set(options?.weakIds ?? []);
  const reviewIds = new Set(options?.reviewIds ?? []);
  const used = new Set<string>();
  const slots: PracticeSlot[] = [];

  for (const item of takeBalanced(items, counts.common, used)) {
    slots.push({ kind: "common", itemId: item.id, reason: "balanced_common" });
  }

  const weakPool = items.filter((item) => weakIds.has(item.id));
  if (weakPool.length === 0) {
    for (const item of takeBalanced(items, counts.weak, used)) {
      slots.push({
        kind: "weak_candidate",
        itemId: item.id,
        reason: "no_weak_sample_filled_with_balanced",
      });
    }
  } else {
    for (const item of takeBalanced(weakPool, counts.weak, used)) {
      slots.push({ kind: "weak_candidate", itemId: item.id, reason: "weak_sample" });
    }
  }

  const reviewPool = items.filter((item) => reviewIds.has(item.id));
  if (reviewPool.length === 0) {
    for (const item of takeBalanced(items, counts.review, used)) {
      slots.push({
        kind: "spaced_review",
        itemId: item.id,
        reason: "no_review_sample_filled_with_balanced",
      });
    }
  } else {
    for (const item of takeBalanced(reviewPool, counts.review, used)) {
      slots.push({ kind: "spaced_review", itemId: item.id, reason: "spaced_review_sample" });
    }
  }

  return { policyVersion, slots };
}

export function consonantOfMeaningItem(item: ItemVersion, consonantByLexeme: Map<string, string>): string {
  return consonantByLexeme.get(item.lexemeId) ?? "";
}

function takeBalanced(items: SelectableItem[], count: number, used: Set<string>): SelectableItem[] {
  const consonants: string[] = [];
  for (const item of items) {
    if (!consonants.includes(item.consonant)) consonants.push(item.consonant);
  }
  const picked: SelectableItem[] = [];
  let guard = 0;
  while (picked.length < count && guard < items.length * Math.max(count, 1) + 1) {
    guard += 1;
    let progressed = false;
    for (const consonant of consonants) {
      const next = items.find((item) => item.consonant === consonant && !used.has(item.id));
      if (!next) continue;
      used.add(next.id);
      picked.push(next);
      progressed = true;
      if (picked.length === count) break;
    }
    if (!progressed) break;
  }
  return picked;
}

export function countSlots(slots: PracticeSlot[]): Record<SelectionSlotKind, number> {
  return {
    common: slots.filter((slot) => slot.kind === "common").length,
    weak_candidate: slots.filter((slot) => slot.kind === "weak_candidate").length,
    spaced_review: slots.filter((slot) => slot.kind === "spaced_review").length,
  };
}
