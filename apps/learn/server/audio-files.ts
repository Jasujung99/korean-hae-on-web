import { readFileSync } from "node:fs";
import { join } from "node:path";

export function readApprovedDistribution(appRoot: string, id: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(id)) return null;
  try {
    return new Uint8Array(readFileSync(join(appRoot, "audio", "dist", `${id}.wav`)));
  } catch {
    return null;
  }
}
