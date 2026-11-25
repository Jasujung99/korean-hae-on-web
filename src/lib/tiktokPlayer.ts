export type TikTokCommandType = "play" | "pause" | "mute" | "unMute" | "seekTo";

export interface TikTokCurrentTime {
  currentTime: number;
  duration: number;
}

export interface TikTokPlayerMessage {
  type: "onPlayerReady" | "onStateChange" | "onCurrentTime" | "onPlayerError" | string;
  value?: unknown;
  errorCode?: number;
  "x-tiktok-player"?: boolean;
}

export function sendPlayerCommand(
  frame: HTMLIFrameElement | null,
  type: TikTokCommandType,
  value?: number,
): void {
  if (!frame?.contentWindow) return;
  const payload: Record<string, unknown> = {
    type,
    "x-tiktok-player": true,
  };
  if (value !== undefined) {
    payload.value = value;
  }
  frame.contentWindow.postMessage(payload, "*");
}

export function parseTikTokMessage(rawData: unknown): TikTokPlayerMessage | null {
  if (typeof rawData !== "string") return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawData);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const record = parsed as Record<string, unknown>;
  if (record["x-tiktok-player"] !== true) return null;
  if (typeof record.type !== "string") return null;
  return record as unknown as TikTokPlayerMessage;
}

export function extractErrorCode(msg: TikTokPlayerMessage): number | null {
  if (typeof msg.errorCode === "number") return msg.errorCode;
  if (typeof msg.value === "number") return msg.value;
  if (msg.value && typeof msg.value === "object") {
    const val = msg.value as Record<string, unknown>;
    if (typeof val.errorCode === "number") return val.errorCode;
    if (typeof val.code === "number") return val.code;
  }
  return null;
}

export function extractCurrentTime(msg: TikTokPlayerMessage): TikTokCurrentTime | null {
  if (!msg.value || typeof msg.value !== "object") return null;
  const val = msg.value as Record<string, unknown>;
  const currentTime = Number(val.currentTime);
  const duration = Number(val.duration);
  if (!Number.isFinite(currentTime) || !Number.isFinite(duration)) return null;
  return { currentTime, duration };
}

export function bindPosterFallbacks(root: ParentNode): void {
  const imgs = root.querySelectorAll<HTMLImageElement>("img[data-poster-img]");
  for (const img of imgs) {
    const hide = () => {
      img.hidden = true;
    };
    if (img.complete && img.naturalWidth === 0) {
      hide();
    } else {
      img.addEventListener("error", hide, { once: true });
    }
  }
}

export const STATE_LABELS: Record<number, string> = {
  [-1]: "재생 준비 중이에요",
  0: "영상이 끝났어요",
  1: "재생 중이에요",
  2: "잠시 멈췄어요",
  3: "영상을 불러오고 있어요",
};
