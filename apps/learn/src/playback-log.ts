import type { PlaybackAttempt } from "../content/tts/voices.ts";

const attempts: PlaybackAttempt[] = [];

export function playbackAttempts(): readonly PlaybackAttempt[] {
  return attempts;
}

export function notePlayback(attempt: PlaybackAttempt): void {
  attempts.push(attempt);
}

export function resetPlaybackLog(): void {
  attempts.length = 0;
}
