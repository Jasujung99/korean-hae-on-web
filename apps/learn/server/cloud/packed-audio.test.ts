import { describe, expect, it } from "vitest";
import { createPackedAudio, createR2AudioSource, MANIFEST_KEY, type PackedAudioManifest } from "./packed-audio.ts";

const ID = "pw-아자--erinome";
const manifest = (builtAt: string): PackedAudioManifest => ({
  version: 1,
  builtAt,
  files: {
    [ID]: {
      file: "a/aaaa.m4a",
      bytes: 3,
      durationMs: 900,
      type: "audio/mp4",
      meta: { voice: "Erinome", model: "m", reviewStatus: "draft", generatedAt: "", sha256: "" },
    },
  },
});

const fetchObject = async (key: string) => (key === "a/aaaa.m4a" ? new Uint8Array([1, 2, 3]) : null);

function fakeBucket(objects: Map<string, string | Uint8Array>) {
  let reads = 0;
  return {
    get reads() {
      return reads;
    },
    async get(key: string) {
      if (key === MANIFEST_KEY) reads++;
      const value = objects.get(key);
      if (value === undefined) return null;
      const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
      return {
        arrayBuffer: async () => bytes.slice().buffer as ArrayBuffer,
        text: async () => new TextDecoder().decode(bytes),
      };
    },
  };
}

describe("packed audio (Cloudflare)", () => {
  it("gives the same opaque ref in every instance that shares the secret", () => {
    const a = createPackedAudio(manifest("1"), [ID, "missing"], "s".repeat(32), fetchObject);
    const b = createPackedAudio(manifest("1"), [ID], "s".repeat(32), fetchObject);
    const other = createPackedAudio(manifest("1"), [ID], "t".repeat(32), fetchObject);
    const ref = a.refFor(ID);
    expect(ref).toMatch(/^[0-9a-f]{20}$/);
    expect(b.refFor(ID)).toBe(ref);
    expect(other.refFor(ID)).not.toBe(ref);
    expect(ref).not.toContain("아자");
    expect(a.refFor("missing")).toBeNull();
  });

  it("reads the compressed file with its type", async () => {
    const audio = createPackedAudio(manifest("1"), [ID], "s".repeat(32), fetchObject);
    const body = await audio.read(audio.refFor(ID) ?? "");
    expect(body?.type).toBe("audio/mp4");
    expect([...(body?.bytes ?? [])]).toEqual([1, 2, 3]);
    expect(await audio.read("unknown")).toBeNull();
    expect(audio.info(ID)).toEqual({ bytes: 3, durationMs: 900 });
    expect(audio.meta(ID)?.voice).toBe("Erinome");
    const inventory = audio.inventoryRef(ID);
    expect(inventory).toMatch(/^i[0-9a-f]{19}$/);
    expect((await audio.read(inventory ?? ""))?.bytes.length).toBe(3);
  });

  it("picks up a new manifest from R2 after the cache time without a redeploy", async () => {
    const objects = new Map<string, string | Uint8Array>([["a/aaaa.m4a", new Uint8Array([1, 2, 3])]]);
    const bucket = fakeBucket(objects);
    const source = createR2AudioSource([ID], 60_000);
    const secret = "s".repeat(32);

    const empty = await source(bucket, secret, 0);
    expect(empty.refFor(ID)).toBeNull();

    objects.set(MANIFEST_KEY, JSON.stringify(manifest("2")));
    expect((await source(bucket, secret, 30_000)).refFor(ID)).toBeNull(); // still cached
    const fresh = await source(bucket, secret, 61_000);
    expect(fresh.refFor(ID)).not.toBeNull();
    expect((await fresh.read(fresh.refFor(ID) ?? ""))?.bytes.length).toBe(3);
    expect(bucket.reads).toBe(2);
  });
});
