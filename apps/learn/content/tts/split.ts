// 여러 소리를 한 번에 읽힌 WAV를 쉼(무음) 자리에서 잘라 소리 하나씩의 WAV로 나눈다.
// 예: "아자, 아차, 아짜." 한 파일 → 아자 / 아차 / 아짜 세 파일.
// PCM 16비트 모노 WAV만 다룬다. 나눌 자리를 못 찾으면 null을 돌려준다(억지로 자르지 않는다).
import { pcmToWav } from "./pipeline.ts";

export type Pcm16 = { sampleRate: number; channels: number; samples: Int16Array };

export function readPcm16Wav(bytes: Uint8Array): Pcm16 | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (offset: number) => String.fromCharCode(...bytes.subarray(offset, offset + 4));
  if (bytes.byteLength < 12 || tag(0) !== "RIFF" || tag(8) !== "WAVE") return null;
  let offset = 12;
  let sampleRate = 0;
  let channels = 0;
  let bits = 0;
  while (offset + 8 <= bytes.byteLength) {
    const id = tag(offset);
    const size = view.getUint32(offset + 4, true);
    if (id === "fmt ") {
      channels = view.getUint16(offset + 10, true);
      sampleRate = view.getUint32(offset + 12, true);
      bits = view.getUint16(offset + 22, true);
    }
    if (id === "data") {
      if (bits !== 16 || !sampleRate || !channels) return null;
      const start = offset + 8;
      const end = Math.min(bytes.byteLength, start + size);
      const count = Math.floor((end - start) / 2);
      const samples = new Int16Array(count);
      for (let index = 0; index < count; index += 1) samples[index] = view.getInt16(start + index * 2, true);
      return { sampleRate, channels, samples };
    }
    offset += 8 + size + (size % 2);
  }
  return null;
}

export type SplitOptions = {
  /** 분석 단위(ms) */
  frameMs?: number;
  /** 가장 큰 소리 대비 이보다 작으면 쉼으로 본다(0~1) */
  silenceRatio?: number;
  /** 이보다 짧은 쉼은 소리 안의 멈춤(예: ㅉ·ㅊ의 막힘)으로 보고 자르지 않는다 */
  minGapMs?: number;
  /** 자른 소리 앞뒤에 남길 여유 */
  padMs?: number;
};

export type SplitResult = { parts: Uint8Array[]; cuts: Array<{ startMs: number; endMs: number }> };

/** 소리 count개로 나눈다. 쉼 가운데 가장 긴 count-1곳을 자른다. */
export function splitWavBySilence(bytes: Uint8Array, count: number, options: SplitOptions = {}): SplitResult | null {
  const pcm = readPcm16Wav(bytes);
  if (!pcm || pcm.channels !== 1 || count < 1) return null;
  const frameMs = options.frameMs ?? 10;
  const frameSize = Math.max(1, Math.round((pcm.sampleRate * frameMs) / 1000));
  const frames = Math.floor(pcm.samples.length / frameSize);
  const rms: number[] = [];
  for (let frame = 0; frame < frames; frame += 1) {
    let sum = 0;
    for (let index = frame * frameSize; index < (frame + 1) * frameSize; index += 1) {
      const value = pcm.samples[index] ?? 0;
      sum += value * value;
    }
    rms.push(Math.sqrt(sum / frameSize));
  }
  const peak = rms.reduce((max, value) => Math.max(max, value), 0);
  if (peak === 0) return null;
  const threshold = peak * (options.silenceRatio ?? 0.04);
  const voiced = rms.map((value) => value >= threshold);
  const first = voiced.indexOf(true);
  const last = voiced.lastIndexOf(true);
  if (first < 0) return null;

  const minGap = Math.ceil((options.minGapMs ?? 120) / frameMs);
  const gaps: Array<{ start: number; end: number }> = [];
  let runStart = -1;
  for (let frame = first; frame <= last; frame += 1) {
    if (!voiced[frame]) {
      if (runStart < 0) runStart = frame;
    } else if (runStart >= 0) {
      if (frame - runStart >= minGap) gaps.push({ start: runStart, end: frame });
      runStart = -1;
    }
  }
  if (gaps.length < count - 1) return null;
  const chosen = [...gaps]
    .sort((a, b) => b.end - b.start - (a.end - a.start))
    .slice(0, count - 1)
    .sort((a, b) => a.start - b.start);

  const pad = Math.round((options.padMs ?? 60) / frameMs);
  const parts: Uint8Array[] = [];
  const cuts: SplitResult["cuts"] = [];
  for (let index = 0; index < count; index += 1) {
    const gapBefore = chosen[index - 1];
    const gapAfter = chosen[index];
    const voicedStart = gapBefore ? gapBefore.end : first;
    const voicedEnd = gapAfter ? gapAfter.start : last + 1;
    // 여유는 이웃한 쉼의 가운데를 넘지 않게 붙인다.
    const lowest = gapBefore ? Math.floor((gapBefore.start + gapBefore.end) / 2) : 0;
    const highest = gapAfter ? Math.ceil((gapAfter.start + gapAfter.end) / 2) : frames;
    const startFrame = Math.max(lowest, voicedStart - pad);
    const endFrame = Math.min(highest, voicedEnd + pad);
    const slice = pcm.samples.slice(startFrame * frameSize, endFrame * frameSize);
    parts.push(pcmToWav(new Uint8Array(slice.buffer), pcm.sampleRate, 1));
    cuts.push({ startMs: startFrame * frameMs, endMs: endFrame * frameMs });
  }
  return { parts, cuts };
}
