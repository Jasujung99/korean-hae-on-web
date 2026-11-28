import { describe, expect, it } from "vitest";
import { audioPicker, VOICE_LABELS } from "./practice.ts";
import type { PreviewAudio } from "../preview/audio.ts";

describe("dictionary voice columns", () => {
  it("maps 남성 to Charon, 여성(1) to Erinome and 여성(2) to Sulafat", () => {
    expect(VOICE_LABELS).toEqual({ charon: "남성", erinome: "여성(1)", sulafat: "여성(2)" });
  });

  it("gives each column only its own voice file, never another voice's", () => {
    const files = new Set(["word-x--charon", "word-x--sulafat"]);
    const audio = {
      refFor: (id: string) => (files.has(id) ? `ref:${id}` : null),
      meta: () => null,
    } as unknown as PreviewAudio;
    const { voiceRefs } = audioPicker(audio, "erinome");
    expect(voiceRefs("word-x")).toEqual([
      { key: "charon", ref: "ref:word-x--charon" },
      { key: "erinome", ref: null },
      { key: "sulafat", ref: "ref:word-x--sulafat" },
    ]);
  });
});
