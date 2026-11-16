export const FLASH_TTS_MODEL = "gemini-3.8-flash-tts";
export const VOICE_CANDIDATE = "Iapetus";
export const VOICE_FIXED = false;

export const NOT_CONFIGURED_MESSAGE =
  "GEMINI_API_KEY is not configured. Live TTS generation is incomplete.";

export type TtsUnit = {
  id: string;
  kind: "pseudoword" | "word" | "sentence";
  text: string;
  reviewStatus: string;
  audioStatus: string;
  sourceMime: string;
  sha256: string;
  byteLength: number;
  rawRelativePath: string;
  distributionRelativePath: string;
  voiceCandidate: string;
  voiceFixed: boolean;
  core60Approved: boolean;
};

export type GenerateContentBody = {
  contents: Array<{ role: "user"; parts: Array<{ text: string }> }>;
  generationConfig: {
    responseModalities: ["AUDIO"];
    speechConfig: {
      voiceConfig: {
        prebuiltVoiceConfig: { voiceName: string };
      };
    };
  };
};

export function readApiKey(env: Record<string, string | undefined>): string | null {
  const value = env.GEMINI_API_KEY?.trim() ?? "";
  return value ? value : null;
}

export function notConfiguredResult(): { ok: false; code: "not_configured"; message: string } {
  return { ok: false, code: "not_configured", message: NOT_CONFIGURED_MESSAGE };
}

export function modelEndpoint(model = FLASH_TTS_MODEL): string {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
}

export function buildGenerateContentBody(text: string, voice = VOICE_CANDIDATE): GenerateContentBody {
  return {
    contents: [{ role: "user", parts: [{ text }] }],
    generationConfig: {
      responseModalities: ["AUDIO"],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: voice },
        },
      },
    },
  };
}

export function authHeaders(apiKey: string): Record<string, string> {
  return {
    "content-type": "application/json",
    "x-goog-api-key": apiKey,
  };
}

type AudioPart = {
  inlineData?: { mimeType?: string; data?: string };
  inline_data?: { mime_type?: string; mimeType?: string; data?: string };
};

export function parseGenerateContentAudio(payload: unknown): { mime: string; base64: string } | null {
  if (!payload || typeof payload !== "object") return null;
  const candidates = (payload as { candidates?: unknown }).candidates;
  if (!Array.isArray(candidates)) return null;
  for (const candidate of candidates) {
    const parts = (candidate as { content?: { parts?: AudioPart[] } }).content?.parts;
    if (!Array.isArray(parts)) continue;
    for (const part of parts) {
      const inline = part.inlineData ?? part.inline_data;
      const data = inline?.data;
      if (!data) continue;
      const mime =
        part.inlineData?.mimeType ??
        part.inline_data?.mimeType ??
        part.inline_data?.mime_type ??
        "";
      return { mime, base64: data };
    }
  }
  return null;
}

export function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export function startsWithRiff(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46;
}

/**
 * 응답 MIME이 PCM이라고 밝힌 경우에만 rate·channel을 읽는다.
 * 예: "audio/L16;codec=pcm;rate=24000", "audio/pcm;rate=24000".
 * RIFF가 아니라는 이유만으로 PCM이라고 가정하지 않는다.
 */
export function parsePcmMime(mime: string): { sampleRate: number; channels: number } | null {
  const parts = mime
    .toLowerCase()
    .split(";")
    .map((part) => part.trim());
  const type = parts[0] ?? "";
  const isPcm = type === "audio/l16" || type === "audio/pcm" || parts.includes("codec=pcm");
  if (!isPcm) return null;
  const rate = Number(parts.find((part) => part.startsWith("rate="))?.slice(5));
  const channels = Number(parts.find((part) => part.startsWith("channels="))?.slice(9) ?? "1");
  if (!Number.isInteger(rate) || rate <= 0) return null;
  return { sampleRate: rate, channels: Number.isInteger(channels) && channels > 0 ? channels : 1 };
}

/** 16비트 little-endian PCM에 WAV 머리말을 붙인다. */
export function pcmToWav(pcm: Uint8Array, sampleRate: number, channels = 1): Uint8Array {
  const bitsPerSample = 16;
  const blockAlign = (channels * bitsPerSample) / 8;
  const header = new ArrayBuffer(44);
  const view = new DataView(header);
  const ascii = (offset: number, text: string) => {
    for (let index = 0; index < text.length; index += 1) view.setUint8(offset + index, text.charCodeAt(index));
  };
  ascii(0, "RIFF");
  view.setUint32(4, 36 + pcm.length, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  ascii(36, "data");
  view.setUint32(40, pcm.length, true);
  const out = new Uint8Array(44 + pcm.length);
  out.set(new Uint8Array(header), 0);
  out.set(pcm, 44);
  return out;
}

export type NormalizedAudio = { bytes: Uint8Array; mime: "audio/wav"; wrappedFromPcm: boolean };

/** 저장할 수 있는 WAV로 맞춘다. 형식을 알 수 없으면 null을 돌려 저장하지 않게 한다. */
export function normalizeToWav(bytes: Uint8Array, sourceMime: string): NormalizedAudio | null {
  if (startsWithRiff(bytes)) return { bytes, mime: "audio/wav", wrappedFromPcm: false };
  const pcm = parsePcmMime(sourceMime);
  if (!pcm) return null;
  return { bytes: pcmToWav(bytes, pcm.sampleRate, pcm.channels), mime: "audio/wav", wrappedFromPcm: true };
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function applyRawResult(
  unit: TtsUnit,
  bytes: Uint8Array,
  mime: string,
  sha256: string,
): TtsUnit {
  return {
    ...unit,
    sourceMime: mime,
    sha256,
    byteLength: bytes.length,
    audioStatus: "draft_raw",
    reviewStatus: "draft",
    voiceFixed: false,
    core60Approved: false,
    distributionRelativePath: "",
  };
}

export type PlaybackClass =
  | "missing"
  | "playback_failure"
  | "silence"
  | "truncated"
  | "answered_during_playback"
  | "playable";

export function classifyPlayback(input: {
  bytes: Uint8Array | null;
  mime: string;
  loadError: boolean;
  answeredWhilePlaying: boolean;
}): PlaybackClass {
  if (input.loadError) return "playback_failure";
  if (!input.bytes || input.bytes.length === 0) return input.bytes ? "silence" : "missing";
  if (input.answeredWhilePlaying) return "answered_during_playback";
  if (input.mime.includes("wav") || startsWithRiff(input.bytes)) {
    if (wavIsTruncated(input.bytes)) return "truncated";
    if (wavIsSilent(input.bytes)) return "silence";
  }
  return "playable";
}

export function shouldStoreAsScore(kind: PlaybackClass): boolean {
  switch (kind) {
    case "missing":
    case "playback_failure":
    case "silence":
    case "truncated":
    case "answered_during_playback":
    case "playable":
      return false;
  }
}

export function retryDelayMs(attempt: number, retryAfterHeader: string | null): number {
  const headerSeconds = retryAfterHeader ? Number(retryAfterHeader) : Number.NaN;
  if (Number.isFinite(headerSeconds) && headerSeconds >= 0) {
    return Math.min(headerSeconds * 1000, 8000);
  }
  return Math.min(200 * 2 ** Math.max(0, attempt), 8000);
}

function wavIsSilent(bytes: Uint8Array): boolean {
  const data = pcmBytes(bytes);
  if (!data || data.length === 0) return true;
  return data.every((value) => value === 0);
}

function wavIsTruncated(bytes: Uint8Array): boolean {
  if (bytes.length < 12 || !startsWithRiff(bytes)) return false;
  const declared = bytes[4] + (bytes[5] << 8) + (bytes[6] << 16) + (bytes[7] << 24);
  return bytes.length < declared + 8;
}

function pcmBytes(bytes: Uint8Array): Uint8Array | null {
  if (!startsWithRiff(bytes)) return null;
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const id = String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
    const size = bytes[offset + 4] + (bytes[offset + 5] << 8) + (bytes[offset + 6] << 16) + (bytes[offset + 7] << 24);
    const start = offset + 8;
    if (id === "data") return bytes.slice(start, Math.min(bytes.length, start + size));
    offset = start + size + (size % 2);
  }
  return null;
}
