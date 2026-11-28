import { describe, expect, it } from "vitest";
import { pcmToWav } from "./pipeline.ts";
import { groupPlans, splitAudioId } from "./groups.ts";
import { readPcm16Wav, splitWavBySilence } from "./split.ts";

const RATE = 24_000;

/** 소리(사인파)와 쉼을 이어 붙인 WAV. 소리 안의 짧은 막힘도 넣을 수 있다. */
function clip(pieces: Array<{ tone?: number; silence?: number }>): Uint8Array {
  const samples: number[] = [];
  for (const piece of pieces) {
    const count = Math.round(((piece.tone ?? piece.silence ?? 0) * RATE) / 1000);
    for (let index = 0; index < count; index += 1) samples.push(piece.tone ? Math.round(8000 * Math.sin(index / 6)) : 0);
  }
  return pcmToWav(new Uint8Array(new Int16Array(samples).buffer), RATE, 1);
}

const ms = (bytes: Uint8Array | undefined) => {
  const pcm = bytes ? readPcm16Wav(bytes) : null;
  return pcm ? Math.round((pcm.samples.length / pcm.sampleRate) * 1000) : 0;
};

describe("split grouped pseudowords", () => {
  it("cuts at the longest pauses and keeps short closures inside a sound", () => {
    // 아짜처럼 소리 안에 80ms 막힘이 있어도 그 자리는 자르지 않는다.
    const wav = clip([
      { silence: 100 },
      { tone: 300 },
      { silence: 80 },
      { tone: 200 },
      { silence: 400 },
      { tone: 500 },
      { silence: 350 },
      { tone: 450 },
      { silence: 100 },
    ]);
    const result = splitWavBySilence(wav, 3);
    expect(result?.parts).toHaveLength(3);
    expect(ms(result?.parts[0])).toBe(700); // 300 + 80 + 200 + 앞뒤 여유 60·60
    expect(ms(result?.parts[1])).toBe(620);
    expect(ms(result?.parts[2])).toBe(570); // 450 + 앞뒤 여유
  });

  it("refuses to cut when there are not enough pauses", () => {
    expect(splitWavBySilence(clip([{ tone: 500 }, { silence: 300 }, { tone: 500 }]), 3)).toBeNull();
    expect(splitWavBySilence(new Uint8Array([1, 2, 3]), 2)).toBeNull();
  });

  it("plans three-sound and nine-sound readings with separate file names", () => {
    expect(groupPlans("trio").map((plan) => plan.text)).toEqual(["아자, 아차, 아짜.", "이자, 이차, 이짜.", "오자, 오차, 오짜."]);
    expect(groupPlans("all")[0]?.parts).toHaveLength(9);
    expect(splitAudioId("pw-아자", "erinome", "trio")).toBe("pw-아자--erinome--trio");
  });
});
