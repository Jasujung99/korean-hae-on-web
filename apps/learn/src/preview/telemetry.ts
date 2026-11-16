// 학습 이벤트 전송. 메모리 큐에 쌓았다가 묶어서 보내고, 실패하면 다음에 다시 보낸다.
// 서버는 이벤트 id로 중복을 걸러 낸다. 브라우저에 따로 저장해 두지 않는다.
import type { ClientEvent, ClientEventType } from "../../server/preview/contract.ts";
import { makeId, previewApi } from "./api";

let seq = 0;
let sessionId: string | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let inflight = false;
const queue: ClientEvent[] = [];

export function setTelemetrySession(id: string | null) {
  sessionId = id;
}

export function nextSeq(): number {
  seq += 1;
  return seq;
}

export function track(type: ClientEventType, payload?: ClientEvent["payload"]) {
  queue.push({ id: makeId(), sessionId, seq: nextSeq(), type, clientTime: new Date().toISOString(), payload });
  schedule();
}

function schedule(delay = 1200) {
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    void flushEvents();
  }, delay);
}

export async function flushEvents(keepalive = false): Promise<void> {
  if (inflight || queue.length === 0) return;
  inflight = true;
  const batch = queue.splice(0, 50);
  try {
    await previewApi.events(batch, keepalive);
  } catch {
    queue.unshift(...batch);
    schedule(4000);
  } finally {
    inflight = false;
  }
  if (queue.length > 0) schedule();
}

export function pendingEvents(): number {
  return queue.length;
}

/** 화면 숨김·다시 보임을 기록하고, 숨길 때 남은 기록을 보낸다. */
export function watchVisibility(): () => void {
  const onChange = () => {
    if (document.visibilityState === "hidden") {
      track("visibility_hidden");
      void flushEvents(true);
    } else {
      track("visibility_visible");
    }
  };
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
}
