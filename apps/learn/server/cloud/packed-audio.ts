// Cloudflare 배포본의 음원. 빌드 때 압축(m4a)해 정적 자산(_a/)에 올리고, 목록(manifest)은 서버 묶음 안에만 둔다.
// 정적 파일 이름은 내용 해시라서 정답을 드러내지 않고, /_a/ 경로는 바깥에서 직접 받지 못하게 워커가 막는다.
// ref는 서버 비밀값으로 만든 HMAC이라 여러 인스턴스(isolate)가 같은 ref를 같은 음원으로 읽는다.
import { createHmac } from "node:crypto";
import type { AudioMeta, PreviewAudio } from "../preview/audio.ts";

export type PackedAudioEntry = {
  /** 정적 자산 경로. 예: /_a/3f9c….m4a */
  file: string;
  /** 압축 파일 크기 */
  bytes: number;
  /** 원본 wav 길이 */
  durationMs: number | null;
  type: string;
  meta: AudioMeta | null;
};

export type PackedAudioManifest = {
  version: 1;
  builtAt: string;
  files: Record<string, PackedAudioEntry>;
};

export const PACKED_AUDIO_PREFIX = "/_a/";

export function createPackedAudio(
  manifest: PackedAudioManifest,
  knownIds: string[],
  secret: string,
  fetchAsset: (path: string) => Promise<Response>,
): PreviewAudio {
  const mac = (label: string) => createHmac("sha256", secret).update(label).digest("hex");
  const idByRef = new Map<string, string>();
  const refById = new Map<string, string>();
  const inventoryRefs = new Map<string, string>();
  for (const id of knownIds) {
    if (!manifest.files[id]) continue;
    const ref = mac(`audio:${id}`).slice(0, 20);
    idByRef.set(ref, id);
    refById.set(id, ref);
  }
  for (const id of Object.keys(manifest.files)) {
    const ref = `i${mac(`audio-inventory:${id}`).slice(0, 19)}`;
    inventoryRefs.set(id, ref);
    idByRef.set(ref, id);
  }

  return {
    refFor: (audioId) => refById.get(audioId) ?? null,
    async read(ref) {
      const id = idByRef.get(ref);
      const entry = id ? manifest.files[id] : undefined;
      if (!entry) return null;
      const response = await fetchAsset(entry.file);
      if (!response.ok) return null;
      return { bytes: new Uint8Array(await response.arrayBuffer()), type: entry.type };
    },
    meta: (audioId) => manifest.files[audioId]?.meta ?? null,
    listIds: () => Object.keys(manifest.files).sort(),
    info(audioId) {
      const entry = manifest.files[audioId];
      return entry ? { bytes: entry.bytes, durationMs: entry.durationMs } : null;
    },
    inventoryRef: (audioId) => inventoryRefs.get(audioId) ?? null,
  };
}
