// 음원 바이트 저장소 추상화.
// 로컬(Node)에서는 audio/raw/ 파일을, Cloudflare에서는 R2 버킷을 쓴다.
export type StoredAudioObject = {
  bytes: Uint8Array;
  /** 로컬 개발에서 R2용 메타데이터를 대신 읽을 때 실제 파일 형식을 알려 준다. */
  mime?: string;
};

export type AudioObjectStore = {
  putDraft(
    audioId: string,
    assetId: string,
    bytes: Uint8Array,
    meta?: Record<string, unknown>,
  ): Promise<{ storage: "r2" | "local"; objectKey: string }>;
  get(storage: "r2" | "local", objectKey: string, audioId?: string): Promise<StoredAudioObject | null>;
};

export function createMemoryAudioStore(initial: Record<string, Uint8Array> = {}): AudioObjectStore & {
  objects: Map<string, Uint8Array>;
} {
  const objects = new Map<string, Uint8Array>(Object.entries(initial));
  return {
    objects,
    async putDraft(audioId, assetId, bytes) {
      const objectKey = `draft/${audioId}--${assetId.slice(0, 8)}.wav`;
      objects.set(objectKey, bytes);
      return { storage: "local", objectKey };
    },
    async get(storage, objectKey, audioId) {
      const direct = objects.get(objectKey);
      if (direct) return { bytes: direct };
      if (storage === "r2" && audioId) {
        const byAudioId = objects.get(audioId) ?? objects.get(`${audioId}.wav`);
        if (byAudioId) return { bytes: byAudioId, mime: "audio/wav" };
      }
      return null;
    },
  };
}
