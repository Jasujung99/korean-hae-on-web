// 미리보기 음원 목록. 화면에는 정답이 드러나지 않는 불투명한 ref만 준다.
// 파일은 apps/learn/audio/raw/ 의 검수 전 초안이다. 승인 배포본(audio/dist)과 섞지 않는다.
import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export type AudioMeta = {
  voice: string;
  model: string;
  reviewStatus: string;
  generatedAt: string;
  sha256: string;
};

export type PreviewAudio = {
  refFor(audioId: string): string | null;
  read(ref: string): Uint8Array | null;
  meta(audioId: string): AudioMeta | null;
};

export function createRawAudio(rawDir: string, knownIds: string[], salt: string = randomUUID()): PreviewAudio {
  const idByRef = new Map<string, string>();
  const refById = new Map<string, string>();
  for (const id of knownIds) {
    const ref = createHash("sha256").update(`${salt}:${id}`).digest("hex").slice(0, 20);
    idByRef.set(ref, id);
    refById.set(id, ref);
  }
  const pathOf = (id: string) => join(rawDir, `${id}.wav`);

  return {
    refFor(audioId) {
      const ref = refById.get(audioId);
      if (!ref || !existsSync(pathOf(audioId))) return null;
      return ref;
    },
    read(ref) {
      const id = idByRef.get(ref);
      if (!id) return null;
      try {
        return new Uint8Array(readFileSync(pathOf(id)));
      } catch {
        return null;
      }
    },
    meta(audioId) {
      try {
        const meta = JSON.parse(readFileSync(join(rawDir, `${audioId}.meta.json`), "utf8")) as Partial<AudioMeta>;
        return {
          voice: meta.voice ?? "",
          model: meta.model ?? "",
          reviewStatus: meta.reviewStatus ?? "draft",
          generatedAt: meta.generatedAt ?? "",
          sha256: meta.sha256 ?? "",
        };
      } catch {
        return null;
      }
    },
  };
}

/** 시험용: 주어진 id만 있는 것으로 보는 메모리 음원 */
export function createFixtureAudio(present: Record<string, Uint8Array>): PreviewAudio {
  const ids = Object.keys(present);
  return {
    refFor: (audioId) => (ids.includes(audioId) ? `ref-${ids.indexOf(audioId)}` : null),
    read: (ref) => {
      const index = Number(ref.replace("ref-", ""));
      const id = ids[index];
      return id ? (present[id] ?? null) : null;
    },
    meta: (audioId) =>
      ids.includes(audioId)
        ? { voice: "Fixture", model: "fixture", reviewStatus: "draft", generatedAt: "", sha256: "" }
        : null,
  };
}
