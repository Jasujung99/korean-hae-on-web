let memoryToken: string | null = null;

export function resetInviteTokenMemory() {
  memoryToken = null;
}

export function peekInviteToken(): string | null {
  return memoryToken;
}

export function captureInviteToken(): { present: boolean } {
  if (typeof window === "undefined") return { present: false };

  const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : "";
  const token = new URLSearchParams(hash).get("token");
  if (window.location.hash) {
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${window.location.search}`);
  }
  if (token) memoryToken = token;
  return { present: Boolean(memoryToken) };
}
