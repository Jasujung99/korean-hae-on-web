// Cloudflare R2 전용 음원 저장소. node:* 모듈을 쓰지 않는다.
import type { AudioObjectStore, StoredAudioObject } from "../content/audio-store.ts";

export type R2AudioBucket = {
  get(key: string): Promise<{ arrayBuffer(): Promise<ArrayBuffer>; text(): Promise<string>; etag?: string } | null>;
  put(key: string, value: ArrayBuffer | ArrayBufferView, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown>;
};

export function createR2AudioStore(bucket: R2AudioBucket): AudioObjectStore {
  return {
    async putDraft(_audioId, assetId, bytes) {
      const objectKey = `draft/${assetId}.wav`;
      await bucket.put(objectKey, bytes, { httpMetadata: { contentType: "audio/wav" } });
      return { storage: "r2", objectKey };
    },
    async get(_storage, objectKey): Promise<StoredAudioObject | null> {
      const object = await bucket.get(objectKey);
      if (!object) return null;
      return { bytes: new Uint8Array(await object.arrayBuffer()) };
    },
  };
}
