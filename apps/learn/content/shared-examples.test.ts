import { describe, expect, it } from "vitest";
import { moreExamplesFor, practiceWords } from "./practice.ts";
import { snapshotFromReferenceJson, snapshotSentenceAudioBase, type ContentSnapshot } from "./snapshot.ts";

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
});
