import { describe, expect, it } from "vitest";
import { moreExamplesFor, practiceWords } from "./practice.ts";
import { exampleSlots, exampleTextHash, snapshotFromReferenceJson, snapshotSentenceAudioBase, type ContentSnapshot } from "./snapshot.ts";
import { batchPlan } from "./tts/batch-plan.ts";

describe("words shared by two consonant groups keep one example per group", () => {
  const base = { id: "x", entryId: 2615, word: "사진" };

  it("keeps ㅈ·ㅊ·ㅉ example ids as they were and gives other groups their own id", () => {
    expect(snapshotSentenceAudioBase({ ...base, groupId: "j_ch_jj" })).toBe("sentence-2615-사진");
    expect(snapshotSentenceAudioBase({ ...base, groupId: "s_ss" })).toBe("sentence-2615-사진-s_ss");
    expect(snapshotSentenceAudioBase({ ...base, groupId: "b_p_pp" })).not.toBe(
      snapshotSentenceAudioBase({ ...base, groupId: "d_t_tt" }),
    );
  });

  it("shows the other group's example, with its own audio id, on the word card", () => {
    const ref = snapshotFromReferenceJson();
    const jWord = ref.items.find((item) => item.groupId === "j_ch_jj" && item.example);
    expect(jWord).toBeDefined();
    const other = { ...jWord!, id: "other-id", legacyId: "s_ss-1", groupId: "s_ss" as const, example: "다른 묶음의 예문이에요." };
    const same = { ...jWord!, id: "same-id", legacyId: "b_p_pp-1", groupId: "b_p_pp" as const };
    const snapshot: ContentSnapshot = { ...ref, items: [...ref.items, other, same] };

    const more = moreExamplesFor(jWord!, snapshot);
    expect(more).toEqual([
      { groupId: "s_ss", text: "다른 묶음의 예문이에요.", audioId: `${snapshotSentenceAudioBase(jWord!)}-s_ss` },
    ]);
    // 같은 글자의 예문은 한 번만 보인다.
    expect(more.some((row) => row.groupId === "b_p_pp")).toBe(false);
  });

  it("word cards built from the reference tables carry moreExamples", () => {
    for (const card of practiceWords(snapshotFromReferenceJson())) expect(Array.isArray(card.moreExamples)).toBe(true);
  });

  it("gives examples 2-5 ids from their text, so reordering keeps each audio", () => {
    const word = { id: "x", entryId: 1871, word: "모자", groupId: "j_ch_jj" as const, example: "하나", extraExamples: ["둘", "셋"] };
    const slots = exampleSlots(word);
    expect(slots.map((slot) => slot.index)).toEqual([1, 2, 3]);
    expect(slots[0]!.audioBase).toBe("sentence-1871-모자");
    expect(slots[1]!.audioBase).toBe(`sentence-1871-모자-x${exampleTextHash("둘")}`);
    const swapped = exampleSlots({ ...word, extraExamples: ["셋", "둘"] });
    expect(swapped.find((slot) => slot.text === "둘")!.audioBase).toBe(slots[1]!.audioBase);
    expect(exampleTextHash("둘")).toMatch(/^[0-9a-z]{6}$/);
  });

  it("plans spoken and slow-reading audio for every example of a word", () => {
    const ref = snapshotFromReferenceJson();
    const target = ref.items.find((item) => item.groupId === "j_ch_jj" && item.example)!;
    const snapshot: ContentSnapshot = {
      ...ref,
      items: ref.items.map((item) => (item.id === target.id ? { ...item, extraExamples: ["추가 예문 하나예요."] } : item)),
    };
    const extraId = `${snapshotSentenceAudioBase(target)}-x${exampleTextHash("추가 예문 하나예요.")}--erinome`;
    const plan = batchPlan("erinome", ["sentences", "turns"], (id) => id !== extraId && id !== `${extraId}--turns`, "j_ch_jj", new Set(), {}, snapshot);
    const ids = plan.flatMap((group) => group.items.map((item) => item.id));
    expect(ids).toContain(extraId);
    expect(ids).toContain(`${extraId}--turns`);
  });
});
