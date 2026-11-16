import { isVoiceKey, type VoiceKey } from "../content/tts/voices.ts";

export const VOICE_PREFERENCE_KEY = "haeon.learn.voice";

type PreferenceStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function readVoicePreference(storage: PreferenceStorage | null): VoiceKey {
  try {
    const value = storage?.getItem(VOICE_PREFERENCE_KEY);
    return isVoiceKey(value) ? value : "male";
  } catch {
    return "male";
  }
}

export function writeVoicePreference(storage: PreferenceStorage | null, voice: VoiceKey): void {
  try {
    storage?.setItem(VOICE_PREFERENCE_KEY, voice);
  } catch {
    return;
  }
}

export function readStoredVoice(): VoiceKey {
  if (typeof window === "undefined") return "male";
  return readVoicePreference(window.localStorage);
}

export function storeVoice(voice: VoiceKey): void {
  if (typeof window === "undefined") return;
  writeVoicePreference(window.localStorage, voice);
}

export function resetVoicePreference(storage: PreferenceStorage | null): void {
  try {
    storage?.removeItem(VOICE_PREFERENCE_KEY);
  } catch {
    return;
  }
}
