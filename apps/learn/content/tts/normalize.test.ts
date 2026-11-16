import { describe, expect, it } from "vitest";
import { normalizeToWav, parsePcmMime, pcmToWav, startsWithRiff } from "./pipeline.ts";

describe("audio normalization", () => {
  it("keeps a RIFF file as it is", () => {
    const wav = pcmToWav(new Uint8Array([1, 0, 2, 0]), 24000);
    const normalized = normalizeToWav(wav, "audio/wav");
    expect(normalized?.wrappedFromPcm).toBe(false);
    expect(normalized?.bytes).toBe(wav);
  });

  it("wraps PCM only when the MIME says it is PCM", () => {
    expect(parsePcmMime("audio/L16;codec=pcm;rate=24000")).toEqual({ sampleRate: 24000, channels: 1 });
    expect(parsePcmMime("audio/pcm; rate=16000; channels=2")).toEqual({ sampleRate: 16000, channels: 2 });
    expect(parsePcmMime("audio/mpeg")).toBeNull();
    expect(parsePcmMime("audio/L16")).toBeNull();

    const pcm = new Uint8Array([1, 0, 2, 0, 3, 0]);
    const wrapped = normalizeToWav(pcm, "audio/L16;codec=pcm;rate=24000");
    expect(wrapped?.wrappedFromPcm).toBe(true);
    expect(startsWithRiff(wrapped?.bytes ?? new Uint8Array())).toBe(true);
    expect(wrapped?.bytes.length).toBe(44 + pcm.length);
    const view = new DataView((wrapped?.bytes ?? new Uint8Array(44)).buffer);
    expect(view.getUint32(24, true)).toBe(24000);
    expect(view.getUint32(40, true)).toBe(pcm.length);

    expect(normalizeToWav(pcm, "audio/ogg")).toBeNull();
    expect(normalizeToWav(pcm, "")).toBeNull();
  });
});
