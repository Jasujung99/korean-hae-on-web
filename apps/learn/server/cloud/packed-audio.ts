// Cloudflare 배포본의 음원. 압축(m4a) 파일과 목록(manifest.json)은 R2 버킷에 있고, 앱 배포와 따로 올린다
// (npm run audio:upload). 파일 이름은 내용 해시라서 정답을 드러내지 않고, 버킷은 공개하지 않는다.
// 학습자는 로그인한 뒤 /api/sound/:ref 로만 듣는다.
// ref는 서버 비밀값으로 만든 HMAC이라 여러 인스턴스(isolate)가 같은 ref를 같은 음원으로 읽는다.
import { createHmac } from "node:crypto";
import type { AudioMeta, PreviewAudio } from "../preview/audio.ts";

export type PackedAudioEntry = {
  /** R2 객체 키. 예: a/3f9c….m4a */
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

export const MANIFEST_KEY = "manifest.json";
export const EMPTY_MANIFEST: PackedAudioManifest = { version: 1, builtAt: "", files: {} };

export function createPackedAudio(
  manifest: PackedAudioManifest,
  knownIds: string[],
  secret: string,
  fetchObject: (key: string) => Promise<Uint8Array | null>,
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
      const bytes = await fetchObject(entry.file);
      return bytes && bytes.length > 0 ? { bytes, type: entry.type } : null;
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

type R2Like = {
  get(key: string): Promise<{ arrayBuffer(): Promise<ArrayBuffer>; text(): Promise<string>; etag?: string } | null>;
};

/**
 * R2에서 목록을 읽어 음원을 만든다. 목록은 인스턴스마다 잠시(ttlMs) 기억했다가 다시 읽는다.
 * 그래서 새 음원을 올리면 배포 없이 길어야 ttlMs 안에 반영된다.
 */
export function createR2AudioSource(knownIds: string[], ttlMs = 60_000) {
  let cached: { at: number; secret: string; builtAt: string; audio: PreviewAudio } | null = null;
  return async (bucket: R2Like, secret: string, now = Date.now()): Promise<PreviewAudio> => {
    if (cached && cached.secret === secret && now - cached.at < ttlMs) return cached.audio;
    let manifest = EMPTY_MANIFEST;
    try {
      const object = await bucket.get(MANIFEST_KEY);
      if (object) manifest = JSON.parse(await object.text()) as PackedAudioManifest;
    } catch {
      // 목록을 못 읽으면 직전 목록을 계속 쓴다. 처음이면 음원 없이 연다.
      if (cached && cached.secret === secret) return cached.audio;
    }
    if (cached && cached.secret === secret && cached.builtAt === manifest.builtAt) {
      cached.at = now;
      return cached.audio;
    }
    const audio = createPackedAudio(manifest, knownIds, secret, async (key) => {
      const object = await bucket.get(key);
      return object ? new Uint8Array(await object.arrayBuffer()) : null;
    });
    cached = { at: now, secret, builtAt: manifest.builtAt, audio };
    return audio;
  };
}
