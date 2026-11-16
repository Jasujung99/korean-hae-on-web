// 미리보기 기록 저장소. 덧붙이기만 하고, 같은 이벤트 id는 한 번만 받는다.
// 파일 저장소는 apps/learn/.preview-data/ 에 JSON Lines로 남는다(.gitignore). 운영 DB가 아니다.
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export type StoredEvent = {
  id: string;
  learnerId: string;
  sessionId: string | null;
  seq: number;
  type: string;
  clientTime: string;
  receivedAt: string;
  payload: Record<string, unknown>;
};

export type PreviewStore = {
  append(events: StoredEvent[]): { accepted: number; duplicates: number };
  all(): StoredEvent[];
  byId(id: string): StoredEvent | undefined;
  clear(): void;
  getSetting(key: string): unknown;
  setSetting(key: string, value: unknown): void;
  location: string;
};

function memoryCore() {
  const events: StoredEvent[] = [];
  const index = new Map<string, StoredEvent>();
  const settings = new Map<string, unknown>();
  return {
    events,
    index,
    settings,
    add(event: StoredEvent): boolean {
      if (index.has(event.id)) return false;
      index.set(event.id, event);
      events.push(event);
      return true;
    },
    reset() {
      events.length = 0;
      index.clear();
      settings.clear();
    },
  };
}

export function createMemoryStore(): PreviewStore {
  const core = memoryCore();
  return {
    location: "memory",
    append(events) {
      let accepted = 0;
      let duplicates = 0;
      for (const event of events) {
        if (core.add(event)) accepted += 1;
        else duplicates += 1;
      }
      return { accepted, duplicates };
    },
    all: () => [...core.events],
    byId: (id) => core.index.get(id),
    clear: () => core.reset(),
    getSetting: (key) => core.settings.get(key),
    setSetting: (key, value) => {
      core.settings.set(key, value);
    },
  };
}

export function createFileStore(directory: string): PreviewStore {
  const core = memoryCore();
  const eventsPath = join(directory, "events.jsonl");
  const settingsPath = join(directory, "settings.json");
  mkdirSync(directory, { recursive: true });

  if (existsSync(eventsPath)) {
    for (const line of readFileSync(eventsPath, "utf8").split("\n")) {
      if (!line.trim()) continue;
      try {
        core.add(JSON.parse(line) as StoredEvent);
      } catch {
        // 잘린 마지막 줄은 건너뛴다.
      }
    }
  }
  if (existsSync(settingsPath)) {
    try {
      const saved = JSON.parse(readFileSync(settingsPath, "utf8")) as Record<string, unknown>;
      for (const [key, value] of Object.entries(saved)) core.settings.set(key, value);
    } catch {
      // 설정 파일이 깨졌으면 비운 상태로 시작한다.
    }
  }

  const saveSettings = () => {
    writeFileSync(settingsPath, `${JSON.stringify(Object.fromEntries(core.settings), null, 2)}\n`);
  };

  return {
    location: directory,
    append(events) {
      let accepted = 0;
      let duplicates = 0;
      const lines: string[] = [];
      for (const event of events) {
        if (core.add(event)) {
          accepted += 1;
          lines.push(JSON.stringify(event));
        } else duplicates += 1;
      }
      if (lines.length > 0) appendFileSync(eventsPath, `${lines.join("\n")}\n`);
      return { accepted, duplicates };
    },
    all: () => [...core.events],
    byId: (id) => core.index.get(id),
    clear() {
      core.reset();
      rmSync(eventsPath, { force: true });
      rmSync(settingsPath, { force: true });
    },
    getSetting: (key) => core.settings.get(key),
    setSetting(key, value) {
      core.settings.set(key, value);
      saveSettings();
    },
  };
}
