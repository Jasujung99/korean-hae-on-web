export const VOICE_KEYS = ["male", "female"] as const;
export type VoiceKey = (typeof VOICE_KEYS)[number];

export const VOICE_SET = {
  male: {
    key: "male",
    label: "남성 목소리",
    prebuiltVoice: "Charon",
    tempo: 1,
    atempo: "1.0",
  },
  female: {
    key: "female",
    label: "여성 목소리",
    prebuiltVoice: "Kore",
    tempo: 0.87,
    atempo: "0.87",
  },
} as const;

export const VOICE_CHOICE_DATE = "2026-11-17";

export const FFMPEG_MISSING_MESSAGE =
  "ffmpeg was not found. Tempo post-processing is incomplete. Raw audio was not changed.";

export const VOICE_SET_RECORD = {
  chosenOn: VOICE_CHOICE_DATE,
  learnerSelectable: true,
  listeningApproved: false,
  replacesSingleCandidate: "Iapetus",
  transferClaim: false,
  processor: {
    tool: "ffmpeg",
    filter: "atempo",
    pitch: "preserved",
    note: "Raw WAV stays unchanged. The distribution file is a separate tempo step.",
  },
  voices: {
    male: {
      label: VOICE_SET.male.label,
      prebuiltVoice: VOICE_SET.male.prebuiltVoice,
      tempo: VOICE_SET.male.tempo,
      atempo: VOICE_SET.male.atempo,
    },
    female: {
      label: VOICE_SET.female.label,
      prebuiltVoice: VOICE_SET.female.prebuiltVoice,
      tempo: VOICE_SET.female.tempo,
      atempo: VOICE_SET.female.atempo,
    },
  },
} as const;

export type VoiceFileRecord = {
  voiceKey: VoiceKey;
  label: string;
  prebuiltVoice: string;
  tempo: number;
  processor: "ffmpeg";
  filter: string;
  pitch: "preserved";
  sourceMime: string;
  rawSha256: string;
  rawByteLength: number;
  rawRelativePath: string;
  distributionSha256: string;
  distributionByteLength: number;
  distributionRelativePath: string;
  reviewStatus: "draft";
  audioStatus: "missing" | "draft_raw" | "draft_processed";
  listeningApproved: false;
};

export type VoiceFileSet = Record<VoiceKey, VoiceFileRecord>;

export function isVoiceKey(value: string | null | undefined): value is VoiceKey {
  return value === "male" || value === "female";
}

export function voiceFileId(unitId: string, voice: VoiceKey): string {
  return `${unitId}--${voice}`;
}

export function rawRelativePath(unitId: string, voice: VoiceKey): string {
  return `audio/raw/${voiceFileId(unitId, voice)}.wav`;
}

export function distributionRelativePath(unitId: string, voice: VoiceKey): string {
  return `audio/dist/${voiceFileId(unitId, voice)}.wav`;
}

export function emptyVoiceFile(unitId: string, voice: VoiceKey): VoiceFileRecord {
  const preset = VOICE_SET[voice];
  return {
    voiceKey: voice,
    label: preset.label,
    prebuiltVoice: preset.prebuiltVoice,
    tempo: preset.tempo,
    processor: "ffmpeg",
    filter: `atempo=${preset.atempo}`,
    pitch: "preserved",
    sourceMime: "",
    rawSha256: "",
    rawByteLength: 0,
    rawRelativePath: rawRelativePath(unitId, voice),
    distributionSha256: "",
    distributionByteLength: 0,
    distributionRelativePath: "",
    reviewStatus: "draft",
    audioStatus: "missing",
    listeningApproved: false,
  };
}

export function emptyVoiceSet(unitId: string): VoiceFileSet {
  return {
    male: emptyVoiceFile(unitId, "male"),
    female: emptyVoiceFile(unitId, "female"),
  };
}

export function selectVoiceFile(voices: VoiceFileSet, voice: VoiceKey): VoiceFileRecord {
  return voices[voice];
}

export function chosenFileIsReady(file: VoiceFileRecord | null | undefined): boolean {
  return Boolean(file && file.audioStatus === "draft_processed" && file.distributionRelativePath.length > 0 && file.distributionByteLength > 0);
}

export function distributionPathForChoice(voices: VoiceFileSet, voice: VoiceKey): string | null {
  const file = selectVoiceFile(voices, voice);
  if (!chosenFileIsReady(file)) return null;
  return file.distributionRelativePath;
}

export function applyRawResult(
  file: VoiceFileRecord,
  bytes: Uint8Array,
  mime: string,
  sha256: string,
): VoiceFileRecord {
  return {
    ...file,
    sourceMime: mime,
    rawSha256: sha256,
    rawByteLength: bytes.byteLength,
    audioStatus: "draft_raw",
    reviewStatus: "draft",
    listeningApproved: false,
    distributionSha256: "",
    distributionByteLength: 0,
    distributionRelativePath: "",
  };
}

export function applyProcessedResult(
  file: VoiceFileRecord,
  bytes: Uint8Array,
  sha256: string,
): VoiceFileRecord {
  return {
    ...file,
    distributionSha256: sha256,
    distributionByteLength: bytes.byteLength,
    distributionRelativePath: file.rawRelativePath.replace(/^audio\/raw\//, "audio/dist/"),
    audioStatus: "draft_processed",
    reviewStatus: "draft",
    listeningApproved: false,
  };
}

export function ffmpegAtempoArgs(inputPath: string, outputPath: string, voice: VoiceKey): string[] {
  return [
    "-y",
    "-i",
    inputPath,
    "-filter:a",
    `atempo=${VOICE_SET[voice].atempo}`,
    "-vn",
    "-ac",
    "1",
    "-ar",
    "24000",
    "-c:a",
    "pcm_s16le",
    "-f",
    "wav",
    outputPath,
  ];
}

export function ffmpegFailureReason(stderr: string): string {
  const cleaned = stderr
    .replace(/AIza[0-9A-Za-z_-]+/g, "[redacted]")
    .replace(/https?:\/\/\S+/g, "[url]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
  const lead = "ffmpeg tempo processing failed. Raw audio was not changed.";
  return cleaned ? `${lead} ${cleaned}` : lead;
}

export type GenerationJob = { id: string; text: string; voice: VoiceKey; skip: boolean };

export function selectGenerationJobs(
  units: Array<{ id: string; stage?: string; text: string }>,
  options: { stage: string | null; id: string | null; voices: readonly VoiceKey[] },
  rawExists: (unitId: string, voice: VoiceKey) => boolean,
): GenerationJob[] {
  const chosen = options.id ? units.filter((unit) => unit.id === options.id) : units.filter((unit) => unit.stage === options.stage);
  const jobs: GenerationJob[] = [];
  for (const unit of chosen) {
    for (const voice of options.voices) {
      jobs.push({ id: unit.id, text: unit.text, voice, skip: rawExists(unit.id, voice) });
    }
  }
  return jobs;
}

export function requireFfmpeg(probe: () => boolean): { ok: true } | { ok: false; message: string } {
  if (!probe()) return { ok: false, message: FFMPEG_MISSING_MESSAGE };
  return { ok: true };
}

export type PlaybackAttempt = {
  itemId: string;
  voiceKey: VoiceKey;
  prebuiltVoice: string;
  playback: "missing";
  storedAsScore: false;
};

export function attemptForMissingVoice(itemId: string, voice: VoiceKey): PlaybackAttempt {
  return {
    itemId,
    voiceKey: voice,
    prebuiltVoice: VOICE_SET[voice].prebuiltVoice,
    playback: "missing",
    storedAsScore: false,
  };
}
