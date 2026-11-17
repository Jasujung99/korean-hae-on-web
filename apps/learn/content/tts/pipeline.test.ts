import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { futureL1SelectorNote } from "../l1-future.ts";
import { SELECTION_POLICY_VERSION } from "../selection.ts";
import {
  NOT_CONFIGURED_MESSAGE,
  VOICE_CANDIDATE,
  VOICE_FIXED,
  applyRawResult,
  FLAT_READING_STYLE,
  buildGenerateContentBody,
  buildInteractionBody,
  interactionsEndpoint,
  parseInteractionAudio,
  classifyPlayback,
  decodeBase64,
  modelEndpoint,
  parseGenerateContentAudio,
  readApiKey,
  retryDelayMs,
  sha256Hex,
  shouldStoreAsScore,
  startsWithRiff,
  type TtsUnit,
} from "./pipeline.ts";

const manifest = JSON.parse(
  readFileSync(fileURLToPath(new URL("./j-ch-jj-draft-manifest.json", import.meta.url)), "utf8"),
) as {
  voiceFixed: boolean;
  core60Approved?: boolean;
  units: Array<{
    id: string;
    kind: string;
    text: string;
    reviewStatus: string;
    audioStatus: string;
    voiceFixed: boolean;
    core60Approved: boolean;
    distributionRelativePath: string;
    gloss?: string;
    editReason?: string;
  }>;
};

describe("tts pipeline", () => {
  it("builds a generateContent request without putting the key in the URL", () => {
    const body = buildGenerateContentBody("아자", VOICE_CANDIDATE);
    expect(modelEndpoint()).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash-tts:generateContent",
    );
    expect(JSON.stringify(body)).not.toMatch(/AIza|api[_-]?key/i);
    expect(body.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName).toBe("Iapetus");
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
    const source = manifest.units[0];
    if (!source) throw new Error("missing unit");
    const unit = {
      ...source,
      kind: source.kind as TtsUnit["kind"],
      sourceMime: "",
      sha256: "",
      byteLength: 0,
      rawRelativePath: "audio/raw/fixture.wav",
      voiceCandidate: "Iapetus",
    };
    if (!unit) throw new Error("missing unit");
    const updated = applyRawResult(unit, bytes, "audio/wav", await sha256Hex(bytes));
    expect(updated.reviewStatus).toBe("draft");
    expect(updated.voiceFixed).toBe(false);
    expect(updated.core60Approved).toBe(false);
    expect(updated.distributionRelativePath).toBe("");
    expect(updated.sha256).toHaveLength(64);
    expect(updated.rawRelativePath.startsWith("audio/raw/")).toBe(true);
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

  it("imports the draft manifest with corrected glosses and no approval", () => {
    expect(manifest.voiceFixed).toBe(false);
    expect(manifest.units.every((unit) => unit.reviewStatus === "draft" && unit.core60Approved === false)).toBe(true);
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
});

describe("flat reading style", () => {
  it("sends the style apart from the spoken text", () => {
    const body = buildInteractionBody("아자", "Charon", FLAT_READING_STYLE);
    expect(interactionsEndpoint()).toBe("https://generativelanguage.googleapis.com/v1beta/interactions");
    expect(body.model).toBe("gemini-3.8-flash-tts");
    expect(body.input[0]?.content[0]?.text).toBe("아자");
    expect(body.input[0]?.content[0]?.annotations).toEqual([{ type: "speech_metadata", style: FLAT_READING_STYLE }]);
    expect(body.generation_config.speech_config).toEqual([{ voice: "Charon" }]);
    expect(JSON.stringify(body)).not.toMatch(/AIza|api[_-]?key/i);
    expect(buildInteractionBody("아자", "Kore", null).input[0]?.content[0]?.annotations).toBeUndefined();
  });

  it("reads the last audio block from model output steps", () => {
    const payload = {
      steps: [
        { type: "user_input", content: [{ type: "text", text: "아자" }] },
        { type: "model_output", content: [{ type: "audio", data: "AAAA" }, { type: "audio", data: "UklGRg==", mime_type: "audio/wav" }] },
      ],
    };
    expect(parseInteractionAudio(payload)).toEqual({ mime: "audio/wav", base64: "UklGRg==" });
    expect(parseInteractionAudio({ steps: [] })).toBeNull();
    expect(parseInteractionAudio(null)).toBeNull();
  });
});


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
