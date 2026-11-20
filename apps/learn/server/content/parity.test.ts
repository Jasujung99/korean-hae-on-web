import { describe, expect, it, vi } from "vitest";
import { courseGroups } from "../../content/course.ts";
import { planPracticeSession, practiceWords } from "../../content/practice.ts";
import { snapshotSentenceAudioBase, snapshotWordAudioBase, type SnapshotWord } from "../../content/snapshot.ts";
import { runContentSeed } from "../../scripts/content-seed.ts";
import type { PackedAudioManifest } from "../cloud/packed-audio.ts";
import { createMemoryAudioStore } from "./audio-store.ts";
import { createMemoryContentRepo } from "./memory-repo.ts";
import { createAssetsInventoryAudio, createSnapshotAudio, createSnapshotCache } from "./runtime.ts";
import { createSupabaseContentRepo } from "./supabase-repo.ts";
import { createRawAudio } from "../preview/audio.ts";
import { previewAudioIds } from "../preview/audio-ids.ts";
import { buildInventory } from "../preview/inventory.ts";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function wavBytes(ms: number): Uint8Array {
  const dataBytes = Math.round((48_000 * ms) / 1000);
  const out = new Uint8Array(44 + dataBytes);
  const view = new DataView(out.buffer);
  const put = (offset: number, text: string) => [...text].forEach((ch, index) => (out[offset + index] = ch.charCodeAt(0)));
  put(0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  put(8, "WAVE");
  put(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 24_000, true);
  view.setUint32(28, 48_000, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  put(36, "data");
  view.setUint32(40, dataBytes, true);
  return out;
}

describe("DB content parity & idempotent seed (stage 2)", () => {
  it("produces identical courseGroups, practiceWords, quiz plans, previewAudioIds, and inventory before and after seeding", async () => {
    const rawDir = mkdtempSync(join(tmpdir(), "learn-parity-"));
    try {
      const sampleIds = [
        "pw-아자--erinome",
        "pw-아차--erinome",
        "pw-아짜--erinome",
        "word-1871-모자--erinome",
        "sentence-1871-모자--erinome",
        "word-Stage1-807-기차",
        "audition-charon-flat",
      ];
      const manifest: PackedAudioManifest = {
        version: 1,
        builtAt: "2026-11-19T10:00:00.000Z",
        files: {},
      };
      for (const id of sampleIds) {
        const clip = wavBytes(800);
        writeFileSync(join(rawDir, `${id}.wav`), clip);
        writeFileSync(
          join(rawDir, `${id}.meta.json`),
          JSON.stringify({
            voice: id.includes("erinome") ? "Erinome" : id.includes("charon") ? "Charon" : "Iapetus",
            model: "gemini-3.8-flash-tts",
            generatedAt: "2026-11-19T10:00:00.000Z",
            sha256: "abc",
            settings: { stylePrompt: id.startsWith("sentence-") ? null : "flat" },
          }),
        );
        manifest.files[id] = {
          file: `a/${id}.m4a`,
          bytes: clip.length,
          durationMs: 800,
          type: "audio/mp4",
          meta: {
            voice: id.includes("erinome") ? "Erinome" : id.includes("charon") ? "Charon" : "Iapetus",
            model: "gemini-3.8-flash-tts",
            reviewStatus: "draft",
            generatedAt: "2026-11-19T10:00:00.000Z",
            sha256: "abc",
            stylePrompt: id.startsWith("sentence-") ? null : "flat",
          },
        };
      }

      const repo = createMemoryContentRepo();
      const first = await runContentSeed(repo, manifest, { nowIso: "2026-11-19T10:00:00.000Z" });
      expect(first).toMatchObject({
        itemsInserted: 325,
        itemsTotal: 325,
        stage0Total: 84,
        assetsUpserted: sampleIds.length,
        releaseSeq: 1,
        releaseCreated: true,
        releaseItemCount: 325,
        releaseAudioCount: sampleIds.length,
      });

      // 두 번째 실행도 멱등해야 한다.
      const second = await runContentSeed(repo, manifest, { nowIso: "2026-11-19T10:05:00.000Z" });
      expect(second).toMatchObject({
        itemsInserted: 0,
        itemsTotal: 325,
        stage0Inserted: 0,
        stage0Total: 84,
        assetsUpserted: 0,
        releaseSeq: 1,
        releaseCreated: false,
      });

      const cache = createSnapshotCache(repo, 60_000);
      const { snapshot, fromRelease } = await cache.get();
      expect(fromRelease).toBe(true);

      expect(previewAudioIds(snapshot)).toEqual(previewAudioIds());
      expect(courseGroups(snapshot)).toEqual(courseGroups());
      expect(practiceWords(snapshot)).toEqual(practiceWords());
      expect(planPracticeSession("seed-x", "pseudo", snapshot)).toEqual(planPracticeSession("seed-x", "pseudo"));
      expect(planPracticeSession("seed-x", "word", snapshot)).toEqual(planPracticeSession("seed-x", "word"));

      const rawAudio = createRawAudio(rawDir, previewAudioIds(), "salt");
      const beforeInv = buildInventory(rawAudio, "raw");

      const dbAssets = await repo.listAudioAssets();
      const dbInv = buildInventory(createAssetsInventoryAudio(dbAssets), "raw", snapshot);
      expect(dbInv.totals).toEqual(beforeInv.totals);
      expect(dbInv.groups).toEqual(beforeInv.groups);
      expect(dbInv.units.length).toBe(beforeInv.units.length);
      expect(dbInv.auditions.map((a) => a.voice)).toEqual(beforeInv.auditions.map((a) => a.voice));
      expect(dbInv.lengthChecks).toEqual(beforeInv.lengthChecks);

      // 스냅샷 음원 재생도 같은 HMAC ref 규칙과 바이트 읽기를 제공한다.
      const memStore = createMemoryAudioStore({ "a/word-1871-모자--erinome.m4a": new Uint8Array([9, 8, 7]) });
      const snapAudio = createSnapshotAudio(snapshot, "s".repeat(32), memStore);
      const ref = snapAudio.refFor("word-1871-모자--erinome");
      expect(ref).toMatch(/^[0-9a-f]{20}$/);
      const body = await snapAudio.read(ref ?? "");
      expect([...(body?.bytes ?? [])]).toEqual([9, 8, 7]);
      expect(body?.type).toBe("audio/mp4");
    } finally {
      rmSync(rawDir, { recursive: true, force: true });
    }
  });

  it("assigns collision-free audio IDs to teacher-created words without entryId", () => {
    const teacherWord: SnapshotWord = {
      id: "550e8400-e29b-41d4-a716-446655440000",
      legacyId: null,
      groupId: "j_ch_jj",
      stage: "Stage 1",
      substage: "1-A",
      consonant: "ㅈ",
      word: "모자",
      entryId: null,
      pos: "명",
      gloss: "새 뜻",
      scene: "",
      example: "새 예문",
      related: "",
      note: "",
      sortOrder: 99,
    };
    const wordId = snapshotWordAudioBase(teacherWord);
    const sentenceId = snapshotSentenceAudioBase(teacherWord);
    expect(wordId).toBe("word-c550e8400-모자");
    expect(sentenceId).toBe("sentence-c550e8400-모자");
    const existing = new Set(previewAudioIds());
    expect(existing.has(wordId)).toBe(false);
    expect(existing.has(sentenceId)).toBe(false);
  });

  it("paginates Supabase list calls and formats inList filters safely", async () => {
    const requests: Array<{ method: string; url: string; body?: unknown }> = [];
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      requests.push({ method: init?.method ?? "GET", url, body: init?.body });
      if (url.includes("phoneme_audio_assets") && (init?.method ?? "GET") === "GET") {
        const offset = Number(new URL(url).searchParams.get("offset") ?? "0");
        const count = offset === 0 ? 1000 : 12;
        const rows = Array.from({ length: count }, (_, idx) => ({
          id: `00000000-0000-4000-8000-${String(offset + idx).padStart(12, "0")}`,
          audio_id: `word-${offset + idx}-가`,
          item_id: null,
          kind: "word",
          voice_key: "erinome",
          storage: "r2",
          object_key: `a/${offset + idx}.m4a`,
          mime: "audio/mp4",
          bytes: 100,
          duration_ms: 500,
          sha256: "",
          status: "approved",
          stale: false,
          source: "import",
          model: "",
          style_prompt: null,
          text: "",
          generated_at: null,
          reviewed_by: null,
          reviewed_at: null,
          created_at: "2026-11-19T00:00:00.000Z",
        }));
        return new Response(JSON.stringify(rows), { status: 200 });
      }
      return new Response(JSON.stringify([]), { status: 200 });
    });

    const repo = createSupabaseContentRepo({ url: "https://example.supabase.co", secretKey: "secret" }, fetcher as typeof fetch);
    const all = await repo.listAudioAssets();
    expect(all).toHaveLength(1012);

    await repo.markAudioStale({
      itemIds: ["11111111-1111-4111-8111-111111111111"],
      audioIds: ["word-1871-모자--erinome"],
      kinds: ["word"],
      attachItemId: "11111111-1111-4111-8111-111111111111",
    });
    const patchUrls = requests.filter((r) => r.method === "PATCH").map((r) => r.url);
    expect(patchUrls.some((u) => u.includes("kind=in.("))).toBe(true);
    expect(patchUrls.some((u) => u.includes("audio_id=in.("))).toBe(true);
  });
});
