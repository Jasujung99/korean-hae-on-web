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
