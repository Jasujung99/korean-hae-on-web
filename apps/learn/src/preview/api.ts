// 학습 API 호출. 같은 origin의 /api/* 만 부른다. 키나 외부 주소를 쓰지 않는다.
// 학습자·교사 구분은 서버가 HttpOnly 쿠키로 한다. 화면은 쿠키를 읽거나 저장하지 않는다.
import type {
  AudioInventoryView,
  AbxAnswerRequest,
  AbxAnswerResult,
  AbxTrialView,
  AnswerRequest,
  AnswerResult,
  ClientEvent,
  ContentItemView,
  ContentReleaseStatusView,
  ContentVersionRow,
  CourseView,
  DictLanguage,
  InviteInspectView,
  InviteIssued,
  ItemKind,
  LearnerDetail,
  LearnerSettings,
  ListenView,
  MeView,
  SessionView,
  TeacherContentView,
  TeacherView,
  TtsUsageView,
  VoicesView,
  WordView,
} from "../../server/preview/contract.ts";

export class PreviewApiError extends Error {
  constructor(
    public status: number,
    public code: string | null = null,
    public serverMessage: string | null = null,
  ) {
    super(`learn api ${status}`);
  }
}

async function fail(response: Response): Promise<never> {
  let code: string | null = null;
  let serverMessage: string | null = null;
  try {
    const body = (await response.json()) as { error?: unknown; status?: unknown; message?: unknown };
    code = typeof body.status === "string" ? body.status : typeof body.error === "string" ? body.error : null;
    serverMessage = typeof body.message === "string" ? body.message : null;
  } catch {
    // 본문이 없으면 상태 코드만 쓴다.
  }
  throw new PreviewApiError(response.status, code, serverMessage);
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(path, { headers: { accept: "application/json" }, credentials: "same-origin" });
  if (!response.ok) return fail(response);
  return (await response.json()) as T;
}

async function sendJson<T>(method: "POST" | "PATCH", path: string, body: unknown, keepalive = false): Promise<T> {
  const response = await fetch(path, {
    method,
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(body),
    credentials: "same-origin",
    keepalive,
  });
  if (!response.ok) return fail(response);
  return (await response.json()) as T;
}

async function postJson<T>(path: string, body: unknown, keepalive = false): Promise<T> {
  return sendJson<T>("POST", path, body, keepalive);
}

async function patchJson<T>(path: string, body: unknown): Promise<T> {
  return sendJson<T>("PATCH", path, body);
}

export const previewApi = {
  course: () => getJson<CourseView>("/api/learn/course"),
  currentSession: () => getJson<{ session: SessionView | null }>("/api/learn/sessions/current"),
  newSession: (itemKind?: ItemKind) =>
    postJson<{ session: SessionView }>("/api/learn/sessions", itemKind ? { itemKind } : {}),
  answer: (request: AnswerRequest) => postJson<{ result: AnswerResult; duplicate: boolean }>("/api/learn/answers", request),
  abxTrial: (sessionId: string, itemId: string, partner: string | null) =>
    postJson<{ trial: AbxTrialView }>("/api/learn/abx/trials", { sessionId, itemId, partner }),
  abxAnswer: (request: AbxAnswerRequest) =>
    postJson<{ result: AbxAnswerResult; duplicate: boolean }>("/api/learn/abx/answers", request),
  events: (events: ClientEvent[], keepalive = false) =>
    postJson<{ accepted: number; duplicates: number }>("/api/learn/events", { events }, keepalive),
  words: () => getJson<{ words: WordView[] }>("/api/learn/words"),
  listen: () => getJson<ListenView>("/api/learn/listen"),
};

export const accountApi = {
  me: () => getJson<MeView>("/api/me"),
  saveSettings: (next: Partial<Pick<LearnerSettings, "style" | "dictLanguage" | "practiceVoice" | "exampleReading">>) =>
    postJson<MeView>("/api/me/settings", next),
  leave: () => postJson<{ ok: boolean }>("/api/me/leave", {}),
  inspect: (token: string) => postJson<InviteInspectView>("/api/invitations/inspect", { token }),
  claim: (token: string, claimKey: string, dictLanguage: DictLanguage) =>
    postJson<MeView>("/api/invitations/claim", { token, claimKey, dictLanguage }),
};

export type NewLearnerInput = {
  nickname: string;
  classLabel: string;
  homeLanguage: "ru" | null;
  dictLanguage: DictLanguage;
  isTest: boolean;
};

export const teacherApi = {
  login: (email: string, password: string) =>
    postJson<{ teacher: { displayName: string } }>("/api/teacher/login", { email, password }),
  logout: () => postJson<{ ok: boolean }>("/api/teacher/logout", {}),
  learners: () => getJson<TeacherView>("/api/teacher/learners"),
  addLearner: (input: NewLearnerInput) => postJson<{ id: string }>("/api/teacher/learners", input),
  learner: (id: string) => getJson<{ detail: LearnerDetail }>(`/api/teacher/learners/${encodeURIComponent(id)}`),
  updateLearner: (
    id: string,
    patch: Partial<{ nickname: string; classLabel: string; homeLanguage: "ru" | null; dictLanguage: DictLanguage; itemKind: ItemKind }>,
  ) => postJson<{ ok: boolean }>(`/api/teacher/learners/${encodeURIComponent(id)}/settings`, patch),
  invite: (id: string) => postJson<InviteIssued>(`/api/teacher/learners/${encodeURIComponent(id)}/invitations`, {}),
  revokeInvites: (id: string) =>
    postJson<{ revoked: number }>(`/api/teacher/learners/${encodeURIComponent(id)}/invitations/revoke`, {}),
  revokeDevices: (id: string) =>
    postJson<{ revoked: number }>(`/api/teacher/learners/${encodeURIComponent(id)}/devices/revoke`, {}),
  voices: () => getJson<VoicesView>("/api/teacher/voices"),
  chooseVoice: (voice: string) => postJson<VoicesView>("/api/teacher/voice-choice", { voice }),
  audioInventory: () => getJson<AudioInventoryView>("/api/teacher/audio-inventory"),
  content: (group: string) => getJson<TeacherContentView>(`/api/teacher/content?group=${encodeURIComponent(group)}`),
  ttsUsage: () => getJson<TtsUsageView>("/api/teacher/content/usage"),
  createContentItem: (input: {
    groupId: string;
    stage: string;
    substage?: string | null;
    consonant: string;
    word: string;
    gloss?: string;
    example?: string;
  }) => postJson<{ item: ContentItemView }>("/api/teacher/content/items", input),
  updateContentItem: (
    id: string,
    patch: Partial<{
      word: string;
      consonant: string;
      pos: string;
      gloss: string;
      scene: string;
      example: string;
      related: string;
      note: string;
      reason: string;
    }>,
  ) =>
    patchJson<{ item: ContentItemView; version: ContentVersionRow | null; changedFields: string[]; staleMarked: number }>(
      `/api/teacher/content/items/${encodeURIComponent(id)}`,
      patch,
    ),
  itemVersions: (id: string) =>
    getJson<{ versions: ContentVersionRow[] }>(`/api/teacher/content/items/${encodeURIComponent(id)}/versions`),
  approveContentItem: (id: string) =>
    postJson<{ item: ContentItemView }>(`/api/teacher/content/items/${encodeURIComponent(id)}/approve`, {}),
  hideContentItem: (id: string, reason?: string) =>
    postJson<{ item: ContentItemView }>(`/api/teacher/content/items/${encodeURIComponent(id)}/hide`, { reason }),
  generateContentAudio: (itemId: string, body: { kind: "word" | "sentence"; voice: string }) =>
    postJson<{
      asset: { id: string; audioId: string; status: string; durationMs: number | null; playUrl: string };
      usage: TtsUsageView;
    }>(`/api/teacher/content/items/${encodeURIComponent(itemId)}/audio`, body),
  approveContentAudio: (assetId: string) =>
    postJson<{ asset: { id: string; status: string } }>(`/api/teacher/content/audio/${encodeURIComponent(assetId)}/approve`, {}),
  rejectContentAudio: (assetId: string) =>
    postJson<{ asset: { id: string; status: string } }>(`/api/teacher/content/audio/${encodeURIComponent(assetId)}/reject`, {}),
  releaseStatus: () => getJson<ContentReleaseStatusView>("/api/teacher/content/release-status"),
  publishRelease: (note?: string) =>
    postJson<{
      release: { seq: number; releasedAt: string; note: string | null; itemCount: number; audioCount: number };
      status: ContentReleaseStatusView;
    }>("/api/teacher/content/releases", { note }),
};

export function audioUrl(ref: string): string {
  if (ref.startsWith("/api/")) return ref;
  return `/api/sound/${encodeURIComponent(ref)}`;
}

export function makeId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const hex = () => Math.floor(Math.random() * 0x100000000).toString(16).padStart(8, "0");
  return `${hex()}-${hex().slice(0, 4)}-${hex().slice(0, 4)}-${hex().slice(0, 4)}-${hex()}${hex().slice(0, 4)}`;
}
