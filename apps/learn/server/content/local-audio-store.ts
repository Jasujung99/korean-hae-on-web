// Node 전용 음원 파일 저장소(audio/raw). 기존 파일을 덮어쓰지 않고 새 파일로 쓴다.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import type { AudioObjectStore, StoredAudioObject } from "./audio-store.ts";

function safeJoin(rootDir: string, relativeKey: string): string | null {
  if (!relativeKey || relativeKey.includes("..")) return null;
  const root = resolve(rootDir);
  const full = resolve(root, relativeKey);
  if (full !== root && !full.startsWith(`${root}${sep}`)) return null;
  return full;
}

export function createLocalAudioStore(rawDir: string): AudioObjectStore {
  return {
    async putDraft(audioId, assetId, bytes) {
      mkdirSync(rawDir, { recursive: true });
      const safeId = audioId.replace(/[^A-Za-z0-9가-힣_-]/g, "_");
      const objectKey = `${safeId}--draft-${assetId.slice(0, 8)}.wav`;
      const path = safeJoin(rawDir, objectKey);
      if (!path) throw new Error("invalid draft path");
      writeFileSync(path, bytes);
      return { storage: "local", objectKey };
    },
    async get(storage, objectKey, audioId): Promise<StoredAudioObject | null> {
      if (storage === "local") {
        const path = safeJoin(rawDir, objectKey);
        if (!path || !existsSync(path)) return null;
        return { bytes: new Uint8Array(readFileSync(path)), mime: "audio/wav" };
      }
      if (audioId && /^[^/\\]+$/.test(audioId) && !audioId.includes("..")) {
        const wavPath = join(rawDir, `${audioId}.wav`);
        if (existsSync(wavPath)) {
          return { bytes: new Uint8Array(readFileSync(wavPath)), mime: "audio/wav" };
        }
      }
      return null;
    },
  };
}
