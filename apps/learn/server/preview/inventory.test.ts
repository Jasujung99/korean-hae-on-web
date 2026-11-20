import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createTestAccounts } from "../accounts/test-kit.ts";
import { createFixtureAudio, createRawAudio, wavDurationMs } from "./audio.ts";
import type { AudioInventoryView } from "./contract.ts";
import { buildInventory } from "./inventory.ts";

/** 24kHz 16비트 모노 WAV(초당 48,000바이트) */
function wav(ms: number): Uint8Array {
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

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("audio inventory", () => {
  it("reads the length from the WAV header", () => {
    const clip = wav(1250);
    expect(wavDurationMs(clip.subarray(0, 64), clip.length)).toBe(1250);
    expect(wavDurationMs(new Uint8Array([1, 2, 3]), 3)).toBeNull();
  });

  it("matches expected units to voices, flags length gaps and lists stray files", () => {
    const audio = createFixtureAudio({
      "pw-아자--erinome": wav(1000),
      "pw-아차--erinome": wav(1500),
      "pw-아짜--erinome": wav(1100),
      "pw-아자": wav(700),
      "stray-file": wav(500),
    });
    const view = buildInventory(audio);
    const pseudo = view.groups.find((group) => group.id === "pseudo-s1");
    expect(pseudo).toMatchObject({ total: 9, ready: { charon: 0, erinome: 3, sulafat: 0, legacy: 1 } });
    const frame = view.lengthChecks.find((check) => check.column === "erinome" && check.label.startsWith("아자"));
    expect(frame?.spreadPct).toBe(50);
    expect(view.others.map((cell) => cell.id)).toEqual(["stray-file"]);
    expect(view.totals.files).toBe(5);
    expect(view.totals.durationMs).toBe(4800);
  });

  it("serves files under separate refs from a real folder", async () => {
    const dir = mkdtempSync(join(tmpdir(), "learn-audio-"));
    dirs.push(dir);
    writeFileSync(join(dir, "pw-아자--erinome.wav"), wav(900));
    writeFileSync(
      join(dir, "pw-아자--erinome.meta.json"),
      JSON.stringify({ voice: "Erinome", model: "m", generatedAt: "2026-11-17T08:00:00.000Z", settings: { stylePrompt: "flat" } }),
    );
    const audio = createRawAudio(dir, ["pw-아자--erinome"], "salt");
    const inventoryRef = audio.inventoryRef("pw-아자--erinome");
    expect(inventoryRef).not.toBeNull();
    expect(inventoryRef).not.toBe(audio.refFor("pw-아자--erinome"));
    expect((await audio.read(inventoryRef ?? ""))?.bytes.length).toBe(wav(900).length);
    expect(audio.inventoryRef("../secret")).toBeNull();
    const cell = buildInventory(audio).units.find((unit) => unit.base === "pw-아자")?.cells.erinome;
    expect(cell).toMatchObject({ voice: "Erinome", style: "flat", durationMs: 900 });

    const kit = await createTestAccounts({ audio });
    const app = kit.teacher;
    const response = await app.request("/api/teacher/audio-inventory");
    expect(response.status).toBe(200);
    const body = (await response.json()) as AudioInventoryView;
    expect(body.totals.files).toBe(1);
    expect((await app.request(`/api/sound/${inventoryRef}`)).status).toBe(200);
    expect((await kit.client(null).request("/api/teacher/audio-inventory")).status).toBe(401);
  });
});
