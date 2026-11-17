import { describe, expect, it } from "vitest";
import {
  choiceStyle,
  contrastOf,
  fortisFirst,
  inStageStep,
  orderInStage,
  pairGroups,
  resolvePartner,
  tierBand,
} from "./contrast.ts";
import { makeAbxTrial, practiceItem, practiceWords, stageWordPlan } from "./practice.ts";

describe("minimal pair catalog", () => {
  it("holds 340 pair groups across the five consonant groups", () => {
    expect(pairGroups()).toHaveLength(340);
    expect(pairGroups("j_ch_jj")).toHaveLength(109);
    expect(pairGroups("s_ss").every((row) => row.slots.aspirated.length === 0)).toBe(true);
  });

  it("maps tiers to the three in-stage steps", () => {
    expect([1, 2, 3, 4].map((tier) => inStageStep(tier as 1 | 2 | 3 | 4))).toEqual([1, 1, 2, 3]);
    expect(inStageStep(null)).toBe(3);
    expect(orderInStage([4, null, 3, 1, 2] as Array<1 | 2 | 3 | 4 | null>, (tier) => tier)).toEqual([1, 2, 3, 4, null]);
  });

  it("finds the pair group and partners of a word", () => {
    const sleep = contrastOf("j_ch_jj", "자다", "ㅈ", "Stage 4");
    expect(sleep).toMatchObject({ pairGroupId: "P-001", tier: 1 });
    expect(sleep?.partners).toEqual([
      { consonant: "ㅊ", word: "차다" },
      { consonant: "ㅉ", word: "짜다" },
    ]);
    expect(contrastOf("j_ch_jj", "모자", "ㅈ", "Stage 1")).toBeNull();
  });

  it("resolves the comparison partner from the purest tier first and falls back to null", () => {
    expect(resolvePartner({ groupId: "j_ch_jj", word: "자다", target: "ㅈ", other: "ㅊ" })).toMatchObject({ word: "차다", tier: 1 });
    expect(resolvePartner({ groupId: "j_ch_jj", word: "공장", target: "ㅈ", other: "ㅉ" })).toMatchObject({ word: "공짜", tier: 3 });
    expect(resolvePartner({ groupId: "j_ch_jj", word: "모자", target: "ㅈ", other: "ㅉ" })).toBeNull();
    expect(resolvePartner({ groupId: "j_ch_jj", word: "자다", target: "ㅈ", other: "ㅈ" })).toBeNull();
  });

  it("plays the tense sound first in a plain–tense comparison", () => {
    expect(fortisFirst("j_ch_jj", "ㅈ", "ㅉ")).toEqual(["ㅉ", "ㅈ"]);
    expect(fortisFirst("j_ch_jj", "ㅉ", "ㅈ")).toEqual(["ㅉ", "ㅈ"]);
    expect(fortisFirst("j_ch_jj", "ㅈ", "ㅊ")).toBeNull();
    const item = practiceItem("jcj-s1-아자");
    if (!item) throw new Error("missing item");
    for (const seed of ["a", "b", "c", "d", "e", "f"]) {
      expect(makeAbxTrial(item, "ㅉ", seed).a).toBe("ㅉ");
    }
  });

  it("keeps ending-difference pairs to consonant-only choices", () => {
    expect(choiceStyle(2)).toBe("consonant_only");
    expect(choiceStyle(1)).toBe("word_or_consonant");
  });

  it("splits observation into pure-contrast, context-transfer and unpaired bands", () => {
    expect([1, 2, 3, 4, null].map((tier) => tierBand(tier))).toEqual(["tier12", "tier12", "tier34", "tier34", "unpaired"]);
  });
});

describe("in-stage order of the first group", () => {
  it("orders stage words by step inside each block", () => {
    const words = practiceWords();
    for (const block of ["1-A", "1-B"]) {
      const steps = words.filter((word) => word.substage === block).map((word) => word.step);
      expect(steps).toEqual([...steps].sort((a, b) => a - b));
    }
    expect(words.find((word) => word.word === "가지")).toMatchObject({ step: 1 });
    expect(words.find((word) => word.word === "가장")).toMatchObject({ step: 2 });
    expect(words.find((word) => word.word === "모자")).toMatchObject({ step: 3, contrast: null });
  });

  it("places the coda pairs in Stage 5", () => {
    const stage5 = stageWordPlan("Stage 5");
    expect(stage5.slice(0, 2).map((word) => word.word).sort()).toEqual(["빚", "빛"]);
    expect(stage5.find((word) => word.word === "빚")?.contrast?.partners).toEqual([{ consonant: "ㅊ", word: "빛" }]);
  });
});
