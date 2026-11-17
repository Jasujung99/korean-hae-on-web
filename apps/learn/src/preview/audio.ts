// 고정 음원 재생. 한 번에 하나만 재생하고, 시작·끝·실패를 학습 이벤트로 남긴다.
// 실시간 음성 합성은 하지 않는다. 재생 실패·재생 중 응답은 정답·오답과 따로 기록한다.
import { audioUrl } from "./api";
import { track } from "./telemetry";

export type PlayRole = "listen" | "stimulus" | "answer" | "chosen" | "abx_a" | "abx_b" | "abx_x" | "word" | "example" | "voice";

export type PlayOutcome = { ok: boolean; completed: boolean; playedMs: number; reason: string | null };

type Current = { element: HTMLAudioElement; finish: (outcome: PlayOutcome) => void };

let current: Current | null = null;
let playingRole: PlayRole | null = null;
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

export function subscribeAudio(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function currentPlayingRole(): PlayRole | null {
  return playingRole;
}

export function stopAudio() {
  if (!current) return;
  const { element, finish } = current;
  element.pause();
  finish({ ok: true, completed: false, playedMs: 0, reason: "stopped" });
}

export function playRef(ref: string | null, role: PlayRole, context: { itemId?: string; label?: string } = {}): Promise<PlayOutcome> {
  stopAudio();
  const base = { role, itemId: context.itemId ?? null, label: context.label ?? null };
  if (!ref) {
    track("audio_error", { ...base, reason: "missing" });
    return Promise.resolve({ ok: false, completed: false, playedMs: 0, reason: "missing" });
  }

  const element = new Audio(audioUrl(ref));
  element.preload = "auto";

  return new Promise((resolve) => {
    let startedAt = 0;
    let settled = false;

    const finish = (outcome: PlayOutcome) => {
      if (settled) return;
      settled = true;
      element.removeEventListener("playing", onPlaying);
      element.removeEventListener("ended", onEnded);
      element.removeEventListener("error", onError);
      if (current?.element === element) current = null;
      playingRole = null;
      notify();
      if (outcome.ok) {
        track("audio_play_end", { ...base, playedMs: Math.round(outcome.playedMs), completed: outcome.completed });
      } else {
        track("audio_error", { ...base, reason: outcome.reason ?? "error" });
      }
      resolve(outcome);
    };

    const onPlaying = () => {
      if (!startedAt) {
        startedAt = performance.now();
        track("audio_play_start", base);
      }
      playingRole = role;
      notify();
    };
    const onEnded = () =>
      finish({ ok: true, completed: true, playedMs: startedAt ? performance.now() - startedAt : 0, reason: null });
    const onError = () => finish({ ok: false, completed: false, playedMs: 0, reason: "load_error" });

    element.addEventListener("playing", onPlaying);
    element.addEventListener("ended", onEnded);
    element.addEventListener("error", onError);
    current = {
      element,
      finish: (outcome) =>
        finish({ ...outcome, playedMs: startedAt ? performance.now() - startedAt : 0 }),
    };
    try {
      const started = element.play() as Promise<void> | undefined;
      started?.catch(() => finish({ ok: false, completed: false, playedMs: 0, reason: "play_rejected" }));
    } catch {
      finish({ ok: false, completed: false, playedMs: 0, reason: "play_rejected" });
    }
  });
}
