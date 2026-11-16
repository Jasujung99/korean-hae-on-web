import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { futureL1SelectorNote } from "../l1-future.ts";
import { SELECTION_POLICY_VERSION } from "../selection.ts";
import {
  NOT_CONFIGURED_MESSAGE,
  VOICE_FIXED,
  buildGenerateContentBody,
  classifyPlayback,
  decodeBase64,
  modelEndpoint,
  parseGenerateContentAudio,
  readApiKey,
  retryDelayMs,
  sha256Hex,
  shouldStoreAsScore,
  startsWithRiff,
} from "./pipeline.ts";
import {
  FFMPEG_MISSING_MESSAGE,
  VOICE_SET,
  applyProcessedResult,
  applyRawResult,
  distributionPathForChoice,
  emptyVoiceFile,
  emptyVoiceSet,
  ffmpegAtempoArgs,
  requireFfmpeg,
} from "./voices.ts";

const manifest = JSON.parse(
  readFileSync(fileURLToPath(new URL("./j-ch-jj-draft-manifest.json", import.meta.url)), "utf8"),
) as {
  voiceSet: {
    chosenOn: string;
    listeningApproved: boolean;
    transferClaim: boolean;
    voices: { male: { prebuiltVoice: string; tempo: number }; female: { prebuiltVoice: string; atempo: string } };
  };
  units: Array<{
    id: string;
    kind: string;
    text: string;
    reviewStatus: string;
    core60Approved: boolean;
    gloss?: string;
    voices: {
      male: { prebuiltVoice: string; tempo: number; listeningApproved: boolean; audioStatus: string };
      female: { prebuiltVoice: string; filter: string; listeningApproved: boolean; audioStatus: string };
    };
  }>;
};

describe("tts pipeline", () => {
  it("builds a generateContent request without putting the key in the URL", () => {
    const body = buildGenerateContentBody("아자", VOICE_SET.male.prebuiltVoice);
    expect(modelEndpoint()).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash-tts:generateContent",
    );
    expect(JSON.stringify(body)).not.toMatch(/AIza|api[_-]?key/i);
    expect(body.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName).toBe("Charon");
    expect(body.generationConfig.responseModalities).toEqual(["AUDIO"]);
    expect(VOICE_FIXED).toBe(false);
  });

  it("reports a missing key without echoing secrets", () => {
    expect(readApiKey({})).toBeNull();
    expect(readApiKey({ GEMINI_API_KEY: "   " })).toBeNull();
    expect(NOT_CONFIGURED_MESSAGE).not.toMatch(/AIza/);
    expect(NOT_CONFIGURED_MESSAGE).toContain("not configured");
  });

  it("stores fixture audio as raw bytes and does not approve it", async () => {
    const wav = new Uint8Array([
      0x52, 0x49, 0x46, 0x46, 0x24, 0, 0, 0, 0x57, 0x41, 0x56, 0x45, 0x64, 0x61, 0x74, 0x61, 0x04, 0, 0, 0, 1, 2, 3,
      4,
    ]);
    const parsed = parseGenerateContentAudio({
      candidates: [{ content: { parts: [{ inlineData: { mimeType: "audio/wav", data: btoa(String.fromCharCode(...wav)) } }] } }],
    });
    expect(parsed?.mime).toBe("audio/wav");
    const bytes = decodeBase64(parsed?.base64 ?? "");
    expect(startsWithRiff(bytes)).toBe(true);
    expect(Array.from(bytes)).toEqual(Array.from(wav));
    const file = emptyVoiceFile("fixture", "female");
    const updated = applyRawResult(file, bytes, "audio/wav", await sha256Hex(bytes));
    expect(updated.reviewStatus).toBe("draft");
    expect(updated.listeningApproved).toBe(false);
    expect(updated.prebuiltVoice).toBe("Kore");
    expect(updated.distributionRelativePath).toBe("");
    expect(updated.rawSha256).toHaveLength(64);
    expect(updated.rawRelativePath).toBe("audio/raw/fixture--female.wav");
  });

  it("does not add a RIFF header when the response is not RIFF", () => {
    const raw = new Uint8Array([1, 2, 3, 4]);
    const parsed = parseGenerateContentAudio({
      candidates: [{ content: { parts: [{ inline_data: { mime_type: "application/octet-stream", data: btoa("\u0001\u0002\u0003\u0004") } }] } }],
    });
    const bytes = decodeBase64(parsed?.base64 ?? "");
    expect(Array.from(bytes)).toEqual(Array.from(raw));
    expect(startsWithRiff(bytes)).toBe(false);
  });

  it("keeps silence, truncation, failure, and in-playback answers out of scores", () => {
    const silent = wavWithPcm(new Uint8Array([0, 0, 0, 0]));
    const sound = wavWithPcm(new Uint8Array([0, 1, 0, 1]));
    const truncated = sound.slice(0, 20);
    expect(classifyPlayback({ bytes: null, mime: "", loadError: false, answeredWhilePlaying: false })).toBe("missing");
    expect(classifyPlayback({ bytes: sound, mime: "audio/wav", loadError: true, answeredWhilePlaying: false })).toBe(
      "playback_failure",
    );
    expect(classifyPlayback({ bytes: silent, mime: "audio/wav", loadError: false, answeredWhilePlaying: false })).toBe(
      "silence",
    );
    expect(classifyPlayback({ bytes: truncated, mime: "audio/wav", loadError: false, answeredWhilePlaying: false })).toBe(
      "truncated",
    );
    expect(classifyPlayback({ bytes: sound, mime: "audio/wav", loadError: false, answeredWhilePlaying: true })).toBe(
      "answered_during_playback",
    );
    for (const kind of [
      "missing",
      "playback_failure",
      "silence",
      "truncated",
      "answered_during_playback",
      "playable",
    ] as const) {
      expect(shouldStoreAsScore(kind)).toBe(false);
    }
    expect(retryDelayMs(0, "1")).toBe(1000);
    expect(retryDelayMs(3, null)).toBe(1600);
  });

  it("keeps a missing chosen voice from playing the other voice", () => {
    const voices = emptyVoiceSet("item");
    const raw = wavWithPcm(new Uint8Array([0, 1, 0, 1]));
    const male = applyProcessedResult(
      applyRawResult(voices.male, raw, "audio/wav", "a".repeat(64)),
      raw,
      "b".repeat(64),
    );
    const readyMale = { ...voices, male };
    expect(distributionPathForChoice(readyMale, "male")).toBe("audio/dist/item--male.wav");
    expect(distributionPathForChoice(readyMale, "female")).toBeNull();
    expect(male.listeningApproved).toBe(false);
  });

  it("describes ffmpeg tempo as a separate mocked step and leaves the raw bytes unchanged", () => {
    const raw = wavWithPcm(new Uint8Array([0, 1, 0, 1]));
    const before = Array.from(raw);
    const processed = mockAtempo(raw, "female");
    expect(before).toEqual(Array.from(raw));
    expect(Array.from(processed)).not.toEqual(before);
    const file = applyProcessedResult(applyRawResult(emptyVoiceFile("fixture", "female"), raw, "audio/wav", "c".repeat(64)), processed, "d".repeat(64));
    expect(file.filter).toBe("atempo=0.87");
    expect(file.pitch).toBe("preserved");
    expect(file.listeningApproved).toBe(false);
    expect(file.rawRelativePath).toBe("audio/raw/fixture--female.wav");
    expect(file.distributionRelativePath).toBe("audio/dist/fixture--female.wav");
    expect(ffmpegAtempoArgs("in.wav", "out.wav", "female")).toEqual([
      "-y",
      "-i",
      "in.wav",
      "-filter:a",
      "atempo=0.87",
      "-vn",
      "-c:a",
      "pcm_s16le",
      "out.wav",
    ]);
    expect(ffmpegAtempoArgs("in.wav", "out.wav", "male")).toContain("atempo=1.0");
    expect(ffmpegAtempoArgs("in.wav", "out.wav", "female").join(" ")).not.toMatch(/asetrate|rubberband/);
    expect(requireFfmpeg(() => false)).toEqual({ ok: false, message: FFMPEG_MISSING_MESSAGE });
    expect(FFMPEG_MISSING_MESSAGE).not.toMatch(/AIza/);
  });

  it("imports the draft manifest with corrected glosses and no approval", () => {
    expect(manifest.voiceSet.chosenOn).toBe("2026-11-17");
    expect(manifest.voiceSet.listeningApproved).toBe(false);
    expect(manifest.voiceSet.transferClaim).toBe(false);
    expect(manifest.voiceSet.voices.male).toMatchObject({ prebuiltVoice: "Charon", tempo: 1 });
    expect(manifest.voiceSet.voices.female).toMatchObject({ prebuiltVoice: "Kore", atempo: "0.87" });
    expect(
      manifest.units.every(
        (unit) =>
          unit.reviewStatus === "draft" &&
          unit.core60Approved === false &&
          unit.voices.male.prebuiltVoice === "Charon" &&
          unit.voices.male.listeningApproved === false &&
          unit.voices.male.audioStatus === "missing" &&
          unit.voices.female.filter === "atempo=0.87" &&
          unit.voices.female.listeningApproved === false &&
          unit.voices.female.audioStatus === "missing",
      ),
    ).toBe(true);
    expect(JSON.stringify(manifest.units)).not.toContain("Iapetus");
    expect(manifest.units.find((unit) => unit.kind === "word" && unit.text === "모자")?.gloss).toBe("머리에 쓰는 물건.");
    expect(manifest.units.find((unit) => unit.kind === "word" && unit.text === "지금")?.gloss).toBe(
      "말하고 있는 바로 이때.",
    );
    expect(manifest.units.find((unit) => unit.kind === "word" && unit.text === "차")?.gloss).toContain("찻잎");
    expect(manifest.units.filter((unit) => unit.kind === "pseudoword").length).toBeGreaterThanOrEqual(9);
    expect(manifest.units.filter((unit) => unit.kind === "sentence")).toHaveLength(66);
  });

  it("leaves the balanced selector unchanged while describing a later L1 policy", () => {
    const note = futureL1SelectorNote();
    expect(note.applied).toBe(false);
    expect(note.currentPolicy).toBe(SELECTION_POLICY_VERSION);
    expect(note.slotMap).toEqual({ common: 6, weak_candidate: 3, spaced_review: 3 });
    expect(note.laterPolicy).not.toBe(SELECTION_POLICY_VERSION);
  });

  it("exits the audition command before any network call when the key is absent", async () => {
    const script = fileURLToPath(new URL("../../scripts/tts.ts", import.meta.url));
    const env = { ...process.env };
    delete env.GEMINI_API_KEY;
    const child = spawn(process.execPath, ["--experimental-strip-types", script, "audition"], {
      env,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    const code = await new Promise<number>((resolve) => child.on("exit", (exitCode) => resolve(exitCode ?? 1)));
    expect(code).toBe(2);
    expect(stderr).toContain("not configured");
    expect(stderr).not.toMatch(/AIza/);
  });

  it("fails tempo processing clearly when ffmpeg is absent and does not call it", async () => {
    const script = fileURLToPath(new URL("../../scripts/tts.ts", import.meta.url));
    const env = { ...process.env };
    env.PATH = "";
    delete env.GEMINI_API_KEY;
    const child = spawn(process.execPath, ["--experimental-strip-types", script, "process", "--voice", "female", "--id", "audition"], {
      env,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    const code = await new Promise<number>((resolve) => child.on("exit", (exitCode) => resolve(exitCode ?? 1)));
    expect(code).toBe(1);
    expect(stderr).toContain("ffmpeg was not found");
    expect(stderr).not.toContain("not configured");
    expect(stderr).not.toMatch(/AIza/);
  });
});

function mockAtempo(raw: Uint8Array, voice: "male" | "female"): Uint8Array {
  const tempo = voice === "female" ? 87 : 100;
  const out = new Uint8Array(raw.length + 1);
  out.set(raw);
  out[raw.length] = tempo;
  return out;
}

function wavWithPcm(pcm: Uint8Array): Uint8Array {
  const bytes = new Uint8Array(12 + 8 + pcm.length);
  bytes.set([0x52, 0x49, 0x46, 0x46], 0);
  const declared = bytes.length - 8;
  bytes[4] = declared & 0xff;
  bytes[5] = (declared >> 8) & 0xff;
  bytes[6] = (declared >> 16) & 0xff;
  bytes[7] = (declared >> 24) & 0xff;
  bytes.set([0x57, 0x41, 0x56, 0x45, 0x64, 0x61, 0x74, 0x61], 8);
  bytes[16] = pcm.length & 0xff;
  bytes[17] = (pcm.length >> 8) & 0xff;
  const body = bytes.length >= declared + 8 ? bytes : bytes;
  body.set(pcm, 20);
  return bytes;
}
