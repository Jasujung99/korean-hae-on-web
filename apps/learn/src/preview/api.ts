// 미리보기 API 호출. 같은 origin의 /api/preview/* 만 부른다. 키나 외부 주소를 쓰지 않는다.
import type {
  AbxAnswerRequest,
  AbxAnswerResult,
  AbxTrialView,
  AnswerRequest,
  AnswerResult,
  ClientEvent,
  CourseView,
  LearnerDetail,
  LearnerSummary,
  SessionView,
  VoicesView,
  WordView,
} from "../../server/preview/contract.ts";

export class PreviewApiError extends Error {
  constructor(public status: number) {
    super(`preview api ${status}`);
  }
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(path, { headers: { accept: "application/json" } });
  if (!response.ok) throw new PreviewApiError(response.status);
  return (await response.json()) as T;
}

async function postJson<T>(path: string, body: unknown, keepalive = false): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(body),
    keepalive,
  });
  if (!response.ok) throw new PreviewApiError(response.status);
  return (await response.json()) as T;
}

export const previewApi = {
  course: () => getJson<CourseView>("/api/preview/course"),
  currentSession: () => getJson<{ session: SessionView | null }>("/api/preview/sessions/current"),
  newSession: () => postJson<{ session: SessionView }>("/api/preview/sessions", {}),
  answer: (request: AnswerRequest) => postJson<{ result: AnswerResult; duplicate: boolean }>("/api/preview/answers", request),
  abxTrial: (sessionId: string, itemId: string, partner: string | null) =>
    postJson<{ trial: AbxTrialView }>("/api/preview/abx/trials", { sessionId, itemId, partner }),
  abxAnswer: (request: AbxAnswerRequest) =>
    postJson<{ result: AbxAnswerResult; duplicate: boolean }>("/api/preview/abx/answers", request),
  events: (events: ClientEvent[], keepalive = false) =>
    postJson<{ accepted: number; duplicates: number }>("/api/preview/events", { events }, keepalive),
  words: () => getJson<{ words: WordView[] }>("/api/preview/words"),
  voices: () => getJson<VoicesView>("/api/preview/voices"),
  chooseVoice: (voice: string) => postJson<VoicesView>("/api/preview/voice-choice", { voice }),
  learners: () => getJson<{ learners: LearnerSummary[] }>("/api/preview/teacher/learners"),
  learner: (id: string) => getJson<{ detail: LearnerDetail }>(`/api/preview/teacher/learners/${encodeURIComponent(id)}`),
  reset: () => postJson<{ ok: boolean }>("/api/preview/reset", {}),
};

export function audioUrl(ref: string): string {
  return `/api/preview/audio/${encodeURIComponent(ref)}`;
}

export function makeId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const hex = () => Math.floor(Math.random() * 0x100000000).toString(16).padStart(8, "0");
  return `${hex()}-${hex().slice(0, 4)}-${hex().slice(0, 4)}-${hex().slice(0, 4)}-${hex()}${hex().slice(0, 4)}`;
}
