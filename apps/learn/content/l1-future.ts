import policy from "./reference/l1-adaptive-tuning-policy.json";
import { SELECTION_POLICY_VERSION } from "./selection.ts";

type L1Policy = {
  selection_policy_version: string;
  session_composition: {
    default_item_count: number;
    slots: {
      common_core_balanced: number;
      adaptive_vulnerable_target: number;
      spaced_review: number;
    };
  };
};

const typedPolicy = policy as L1Policy;

export function futureL1SelectorNote(source: L1Policy = typedPolicy) {
  return {
    applied: false as const,
    currentPolicy: SELECTION_POLICY_VERSION,
    laterPolicy: source.selection_policy_version,
    slotMap: {
      common: source.session_composition.slots.common_core_balanced,
      weak_candidate: source.session_composition.slots.adaptive_vulnerable_target,
      spaced_review: source.session_composition.slots.spaced_review,
    },
    defaultItemCount: source.session_composition.default_item_count,
    note: "balanced-v1은 이 정책 파일을 아직 읽지 않는다. 취약 표본이 생기기 전에는 지금처럼 균형 문항으로 칸을 채운다.",
  };
}
