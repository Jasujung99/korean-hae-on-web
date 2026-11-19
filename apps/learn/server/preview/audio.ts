// 미리보기 음원 목록. 화면에는 정답이 드러나지 않는 불투명한 ref만 준다.
// 파일은 apps/learn/audio/raw/ 의 검수 전 초안이다. 승인 배포본(audio/dist)과 섞지 않는다.
import { createHash, randomUUID } from "node:crypto";
import { closeSync, existsSync, openSync, readdirSync, readFileSync, readSync, statSync } from "node:fs";
import { join } from "node:path";

export type AudioMeta = {
  voice: string;
  model: string;
  reviewStatus: string;
  generatedAt: string;
  sha256: string;
  kind?: string;
  text?: string;
  /** 톤 지시. null이면 지시 없이 만든 것 */
  stylePrompt?: string | null;
};

export type AudioFileInfo = { bytes: number; durationMs: number | null };

/** 들려줄 음원 내용과 형식. 로컬은 wav, Cloudflare 배포본은 압축(m4a)이다. */
export type AudioBody = { bytes: Uint8Array; type: string };

export type PreviewAudio = {
  refFor(audioId: string): string | null;
  read(ref: string): Promise<AudioBody | null>;
  meta(audioId: string): AudioMeta | null;
  /** 음원 폴더에 있는 모든 파일 id(.wav 앞부분) */
  listIds(): string[];
  /** 파일 크기와 WAV 머리에서 읽은 길이 */
  info(audioId: string): AudioFileInfo | null;
  /** 음원 목록 화면 전용 ref. 연습 화면의 ref와 이어지지 않게 따로 만든다. */
  inventoryRef(audioId: string): string | null;
};

/** WAV 머리(fmt·data 묶음)에서 길이를 읽는다. 읽지 못하면 null. */
export function wavDurationMs(head: Uint8Array, fileBytes: number): number | null {
  const view = new DataView(head.buffer, head.byteOffset, head.byteLength);
  const tag = (offset: number) => String.fromCharCode(...head.subarray(offset, offset + 4));
  if (head.byteLength < 12 || tag(0) !== "RIFF" || tag(8) !== "WAVE") return null;
  let offset = 12;
  let byteRate = 0;
  while (offset + 8 <= head.byteLength) {
    const id = tag(offset);
    const size = view.getUint32(offset + 4, true);
    if (id === "fmt " && offset + 16 <= head.byteLength) byteRate = view.getUint32(offset + 16, true);
    if (id === "data") {
      if (!byteRate) return null;
      const dataBytes = Math.min(size, Math.max(0, fileBytes - offset - 8));
      return Math.round((dataBytes / byteRate) * 1000);
    }
    offset += 8 + size + (size % 2);
  }
  return null;
}

export function createRawAudio(rawDir: string, knownIds: string[], salt: string = randomUUID()): PreviewAudio {
  const idByRef = new Map<string, string>();
  const refById = new Map<string, string>();
  for (const id of knownIds) {
    const ref = createHash("sha256").update(`${salt}:${id}`).digest("hex").slice(0, 20);
    idByRef.set(ref, id);
    refById.set(id, ref);
  }
  const pathOf = (id: string) => join(rawDir, `${id}.wav`);
  const inventoryRefs = new Map<string, string>();

  return {
    refFor(audioId) {
      const ref = refById.get(audioId);
      if (!ref || !existsSync(pathOf(audioId))) return null;
      return ref;
    },
    async read(ref) {
      const id = idByRef.get(ref);
      if (!id) return null;
      try {
        return { bytes: new Uint8Array(readFileSync(pathOf(id))), type: "audio/wav" };
      } catch {
        return null;
      }
    },
    meta(audioId) {
      try {
        const meta = JSON.parse(readFileSync(join(rawDir, `${audioId}.meta.json`), "utf8")) as Partial<AudioMeta>;
        const raw = meta as Partial<AudioMeta> & { settings?: { stylePrompt?: string | null } };
        return {
          voice: meta.voice ?? "",
          model: meta.model ?? "",
          reviewStatus: meta.reviewStatus ?? "draft",
          generatedAt: meta.generatedAt ?? "",
          sha256: meta.sha256 ?? "",
          kind: meta.kind,
          text: meta.text,
          stylePrompt: raw.settings?.stylePrompt ?? null,
        };
      } catch {
        return null;
      }
    },
    listIds() {
      try {
        return readdirSync(rawDir)
          .filter((name) => name.endsWith(".wav"))
          .map((name) => name.slice(0, -4))
          .sort();
      } catch {
        return [];
      }
    },
    info(audioId) {
      const path = pathOf(audioId);
      try {
        const bytes = statSync(path).size;
        const head = new Uint8Array(4096);
        const fd = openSync(path, "r");
        let read = 0;
        try {
          read = readSync(fd, head, 0, head.byteLength, 0);
        } finally {
          closeSync(fd);
        }
        return { bytes, durationMs: wavDurationMs(head.subarray(0, read), bytes) };
      } catch {
        return null;
      }
    },
    inventoryRef(audioId) {
      if (!/^[^/\\]+$/.test(audioId) || audioId.includes("..") || !existsSync(pathOf(audioId))) return null;
      const known = inventoryRefs.get(audioId);
      if (known) return known;
      const ref = `i${createHash("sha256").update(`${salt}:inventory:${audioId}`).digest("hex").slice(0, 19)}`;
      inventoryRefs.set(audioId, ref);
      idByRef.set(ref, audioId);
      return ref;
    },
  };
}

/** 시험용: 주어진 id만 있는 것으로 보는 메모리 음원 */
export function createFixtureAudio(present: Record<string, Uint8Array>): PreviewAudio {
  const ids = Object.keys(present);
  return {
    refFor: (audioId) => (ids.includes(audioId) ? `ref-${ids.indexOf(audioId)}` : null),
    read: async (ref) => {
      const index = Number(ref.replace("ref-", ""));
      const id = ids[index];
      const bytes = id ? present[id] : undefined;
      return bytes ? { bytes, type: "audio/wav" } : null;
    },
    meta: (audioId) =>
      ids.includes(audioId)
        ? { voice: "Fixture", model: "fixture", reviewStatus: "draft", generatedAt: "", sha256: "" }
        : null,
    listIds: () => [...ids].sort(),
    info: (audioId) => {
      const bytes = present[audioId];
      return bytes ? { bytes: bytes.length, durationMs: wavDurationMs(bytes, bytes.length) } : null;
    },
    inventoryRef: (audioId) => (ids.includes(audioId) ? `ref-${ids.indexOf(audioId)}` : null),
  };
}
