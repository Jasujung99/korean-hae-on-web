import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { COURSE_ORDER, GROUP_CHOICES, GROUP_LABELS, MIX_GROUPS } from "./course-order.ts";
import { courseGroups, roadmapPriority } from "./course.ts";
import { PRACTICE_ITEMS, makeAbxTrial, planPracticeSession, practiceItem, practiceWords } from "./practice.ts";

describe("course order", () => {
  it("follows the 2026-11-17 order instead of the roadmap priority", () => {
    expect(COURSE_ORDER).toEqual(["j_ch_jj", "s_ss", "g_k_kk", "b_p_pp", "d_t_tt"]);
    expect(roadmapPriority()).toEqual(["j_ch_jj", "b_p_pp", "g_k_kk", "d_t_tt", "s_ss"]);
    const groups = courseGroups();
    expect(groups.map((group) => group.label)).toEqual(COURSE_ORDER.map((id) => GROUP_LABELS[id]));
    expect(groups.map((group) => group.status)).toEqual(["practice", "planned", "planned", "planned", "planned"]);
    expect(groups[1]?.choices).toEqual(["ㅅ", "ㅆ"]);
    expect(groups[0]?.stages.map((stage) => stage.stage)).toEqual([
      "Stage 0",
      "Stage 1-A",
      "Stage 1-B",
      "Stage 2",
      "Stage 3",
      "Stage 4",
      "Stage 5",
    ]);
  });
});

describe("j-ch-jj preview practice", () => {
  it("builds nine intervocalic items with three choices each", () => {
    expect(PRACTICE_ITEMS).toHaveLength(9);
    for (const item of PRACTICE_ITEMS) {
      expect(item.choices.map((choice) => choice.key)).toEqual(["ㅈ", "ㅊ", "ㅉ"]);
      expect(item.choices.some((choice) => choice.text === item.stimulus)).toBe(true);
      expect(item.position).toBe("medial");
    }
  });

  it("plans balanced, reproducible, shuffled sessions", () => {
    const one = planPracticeSession("seed-a");
    const again = planPracticeSession("seed-a");
    const other = planPracticeSession("seed-b");
    expect(one).toEqual(again);
    expect(one.slots).toHaveLength(9);
    const targets = one.slots.map((slot) => practiceItem(slot.itemId)?.target);
    expect(new Set(targets)).toEqual(new Set(["ㅈ", "ㅊ", "ㅉ"]));
    for (const consonant of ["ㅈ", "ㅊ", "ㅉ"]) expect(targets.filter((target) => target === consonant)).toHaveLength(3);
    expect(other.slots.map((slot) => slot.itemId)).not.toEqual(one.slots.map((slot) => slot.itemId));
  });

  it("pairs the item sound with the chosen sound in ABX", () => {
    const item = practiceItem("jcj-s1-오짜");
    if (!item) throw new Error("missing item");
    const trial = makeAbxTrial(item, "ㅈ", "seed");
    expect(new Set([trial.a, trial.b])).toEqual(new Set(["ㅉ", "ㅈ"]));
    expect(trial.audio.x).toBe(trial.x === "A" ? trial.audio.a : trial.audio.b);
    const fallback = makeAbxTrial(item, null, "seed");
    expect(new Set([fallback.a, fallback.b])).toEqual(new Set(["ㅉ", "ㅈ"]));
  });

  it("uses the 22 Stage 1 words of the Core 60 table and keeps legacy audio ids", () => {
    const manifest = JSON.parse(
      readFileSync(fileURLToPath(new URL("./tts/j-ch-jj-draft-manifest.json", import.meta.url)), "utf8"),
    ) as { units: Array<{ id: string }> };
    const ids = new Set(manifest.units.map((unit) => unit.id));
    const words = practiceWords();
    expect(words).toHaveLength(22);
    expect(words.filter((word) => word.substage === "1-A").map((word) => word.word)).toEqual([
      "모자", "바지", "어제", "의자", "가족", "사장", "사진", "기차", "아침", "가짜", "이쪽",
    ]);
    expect(words.filter((word) => word.substage === "1-B")).toHaveLength(11);
    for (const word of words) {
      expect(word.wordAudioId).toBe(`word-${word.sourceEntryId}-${word.word}`);
      if (word.example) {
        expect(word.exampleAudioId).toBe(`sentence-${word.sourceEntryId}-${word.word}`);
        expect(ids.has(word.legacyExampleAudioId)).toBe(true);
      } else {
        expect(word.exampleAudioId).toBe("");
      }
    }
    // 예문이 없는 단어는 새로 만들지 않고 비워 둔다.
    expect(words.filter((word) => !word.example).map((word) => word.word).sort()).toEqual(["부치다", "시장", "어쩌다", "저쪽"].sort());
    for (const item of PRACTICE_ITEMS) expect(ids.has(item.audioId)).toBe(true);
  });

});

describe("groups are not mixed", () => {
  it("keeps every practice choice and item inside one group", () => {
    expect(MIX_GROUPS).toBe(false);
    const allowed = GROUP_CHOICES.j_ch_jj;
    for (const item of PRACTICE_ITEMS) {
      for (const choice of item.choices) expect(allowed).toContain(choice.key);
    }
    expect(courseGroups().find((group) => group.id === "j_ch_jj")?.stages.find((row) => row.stage === "Stage 5")?.title).not.toMatch(/교차/);
  });
});


describe("core 60 table", () => {
  it("has 95 candidate words in seven stage blocks", async () => {
    const { coreWords, coreStageKey, stageZeroCells } = await import("./core-table.ts");
    const words = coreWords();
    expect(words).toHaveLength(95);
    const count = (key: string) => words.filter((word) => coreStageKey(word) === key).length;
    expect([count("Stage 1-A"), count("Stage 1-B"), count("Stage 2"), count("Stage 3"), count("Stage 4"), count("Stage 5")]).toEqual([
      11, 11, 21, 21, 19, 12,
    ]);
    expect(stageZeroCells()).toHaveLength(9);
    expect(new Set(words.map((word) => word.id)).size).toBe(95);
  });
});
