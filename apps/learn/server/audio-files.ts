import { readFileSync } from "node:fs";
import { join } from "node:path";

const AUDIO_ID = /^[\p{Script=Hangul}A-Za-z0-9_-]+$/u;

export function readApprovedDistribution(appRoot: string, id: string): Uint8Array | null {
  if (!AUDIO_ID.test(id)) return null;
  try {
    return new Uint8Array(readFileSync(join(appRoot, "audio", "dist", `${id}.wav`)));
  } catch {
    return null;
  }
}
