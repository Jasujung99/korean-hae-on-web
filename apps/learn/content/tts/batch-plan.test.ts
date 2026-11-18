import { describe, expect, it } from "vitest";
import { createFixtureAudio } from "../../server/preview/audio.ts";
import { audioPicker } from "../../server/learn/practice.ts";
import { batchPlan, groupContents, groupPartCount, turnsAudioId } from "./batch-plan.ts";
import { FLAT_READING_STYLE, pcmToWav } from "./pipeline.ts";
import { splitChecked } from "./split.ts";

describe("batch plan", () => {
  const none = () => false;

  it("groups pseudowords with fillers, words per content without fillers, and two example versions", () => {
    const groups = batchPlan("sulafat", ["pseudo", "stage0", "words", "sentences", "turns"], none);
    const pseudo = groups.find((group) => group.kind === "pseudo");
    expect(pseudo?.items).toHaveLength(9);
    expect(pseudo && groupPartCount(pseudo)).toBe(11);
    const pseudoText = pseudo ? groupContents(pseudo) : [];
    expect(pseudoText).toHaveLength(1);
    expect(pseudoText[0]?.text.startsWith("네. <long pause> ")).toBe(true);
    expect(pseudoText[0]?.annotations).toEqual([{ type: "speech_metadata", style: FLAT_READING_STYLE }]);
    // ㅉ가 늘 끝에 오지 않게 섞는다.
    expect(pseudo?.items.map((item) => item.text)).not.toEqual(["아자", "아차", "아짜", "이자", "이차", "이짜", "오자", "오차", "오짜"]);

    const words = groups.filter((group) => group.kind === "words");
    expect(words.every((group) => group.method === "per_content_group" && !group.fillers && group.items.length <= 10)).toBe(true);
    const first = words[0];
    expect(first && groupContents(first)).toHaveLength(first?.items.length ?? 0);

    const spoken = groups.filter((group) => group.kind === "sentences");
    const turns = groups.filter((group) => group.kind === "turns");
    expect(spoken.every((group) => group.method === "pause_group" && group.style === null)).toBe(true);
    expect(turns.every((group) => group.method === "per_content_group")).toBe(true);
    expect(turns[0]?.items[0]?.id.endsWith("--sulafat--turns")).toBe(true);
    expect(spoken.reduce((sum, group) => sum + group.items.length, 0)).toBe(turns.reduce((sum, group) => sum + group.items.length, 0));
  });

  it("skips sounds already made in grouped form", () => {
    const all = batchPlan("erinome", ["words"], none);
    const firstId = all[0]?.items[0]?.id ?? "";
    const rest = batchPlan("erinome", ["words"], (id) => id === firstId);
    const count = (list: typeof all) => list.reduce((sum, group) => sum + group.items.length, 0);
    expect(count(rest)).toBe(count(all) - 1);
  });
});

describe("checked split", () => {
  const RATE = 24_000;
  const clip = (pieces: Array<{ tone?: number; silence?: number }>) => {
    const samples: number[] = [];
    for (const piece of pieces) {
      const count = Math.round(((piece.tone ?? piece.silence ?? 0) * RATE) / 1000);
      for (let index = 0; index < count; index += 1) samples.push(piece.tone ? Math.round(8000 * Math.sin(index / 6)) : 0);
    }
    return pcmToWav(new Uint8Array(new Int16Array(samples).buffer), RATE, 1);
  };

  it("cuts when the pauses between sounds are clearly longer", () => {
    const wav = clip([{ silence: 100 }, { tone: 400 }, { silence: 1000 }, { tone: 300 }, { silence: 150 }, { tone: 200 }, { silence: 1000 }, { tone: 400 }]);
    const result = splitChecked(wav, 3, 300);
    expect(result?.ok).toBe(true);
    expect(result?.parts).toHaveLength(3);
  });

  it("refuses to cut when pauses are not distinct", () => {
    const wav = clip([{ tone: 400 }, { silence: 400 }, { tone: 300 }, { silence: 350 }, { tone: 400 }]);
    const result = splitChecked(wav, 2, 300);
    expect(result?.ok).toBe(false);
    expect(result?.reason).toBe("pauses_not_distinct");
  });
});

describe("example reading", () => {
  it("plays the turns version when chosen and falls back to the spoken one", () => {
    const wav = new Uint8Array([0x52, 0x49, 0x46, 0x46]);
    const base = "sentence-1871-모자";
    const audio = createFixtureAudio({ [`${base}--erinome`]: wav, [turnsAudioId(`${base}--erinome`)]: wav, "sentence-807-기차--erinome": wav });
    const turns = audioPicker(audio, "erinome", "turns");
    expect(turns.exampleRefOf(base)).toBe(audio.refFor(turnsAudioId(`${base}--erinome`)));
    expect(turns.exampleRefOf("sentence-807-기차")).toBe(audio.refFor("sentence-807-기차--erinome"));
    expect(audioPicker(audio, "erinome", "spoken").exampleRefOf(base)).toBe(audio.refFor(`${base}--erinome`));
  });
});
