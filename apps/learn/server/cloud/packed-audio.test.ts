import { describe, expect, it } from "vitest";
import { createPackedAudio, type PackedAudioManifest } from "./packed-audio.ts";

const manifest: PackedAudioManifest = {
  version: 1,
  builtAt: "2026-11-18T00:00:00.000Z",
  files: {
    "pw-아자--erinome": {
      file: "/_a/aaaa.m4a",
      bytes: 3,
      durationMs: 900,
      type: "audio/mp4",
      meta: { voice: "Erinome", model: "m", reviewStatus: "draft", generatedAt: "", sha256: "" },
    },
  },
};

const fetched: string[] = [];
const fetchAsset = async (path: string) => {
  fetched.push(path);
  return path === "/_a/aaaa.m4a" ? new Response(new Uint8Array([1, 2, 3])) : new Response("", { status: 404 });
};

describe("packed audio (Cloudflare)", () => {
  it("gives the same opaque ref in every instance that shares the secret", () => {
    const a = createPackedAudio(manifest, ["pw-아자--erinome", "missing"], "s".repeat(32), fetchAsset);
    const b = createPackedAudio(manifest, ["pw-아자--erinome"], "s".repeat(32), fetchAsset);
    const other = createPackedAudio(manifest, ["pw-아자--erinome"], "t".repeat(32), fetchAsset);
    const ref = a.refFor("pw-아자--erinome");
    expect(ref).toMatch(/^[0-9a-f]{20}$/);
    expect(b.refFor("pw-아자--erinome")).toBe(ref);
    expect(other.refFor("pw-아자--erinome")).not.toBe(ref);
    expect(ref).not.toContain("아자");
    expect(a.refFor("missing")).toBeNull();
  });

  it("reads the compressed file through the asset fetcher with its type", async () => {
    const audio = createPackedAudio(manifest, ["pw-아자--erinome"], "s".repeat(32), fetchAsset);
    const body = await audio.read(audio.refFor("pw-아자--erinome") ?? "");
    expect(body?.type).toBe("audio/mp4");
    expect([...(body?.bytes ?? [])]).toEqual([1, 2, 3]);
    expect(await audio.read("unknown")).toBeNull();
    expect(audio.info("pw-아자--erinome")).toEqual({ bytes: 3, durationMs: 900 });
    expect(audio.meta("pw-아자--erinome")?.voice).toBe("Erinome");
    const inventory = audio.inventoryRef("pw-아자--erinome");
    expect(inventory).toMatch(/^i[0-9a-f]{19}$/);
    expect((await audio.read(inventory ?? ""))?.bytes.length).toBe(3);
  });
});
