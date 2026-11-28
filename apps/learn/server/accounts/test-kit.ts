// 시험 도구: 메모리 저장소로 학습 앱을 띄우고, 교사 로그인·학습자 연결을 실제 API로 거친다.
import { createLearnApp } from "../app.ts";
import type { LearnConfig } from "../config.ts";
import type { PreviewAudio } from "../preview/audio.ts";
import { memoryTeacherAuth } from "./auth.ts";
import { createMemoryRepo } from "./memory-repo.ts";
import { DEVICE_COOKIE, TEACHER_COOKIE } from "./routes.ts";

export const TEST_ORIGIN = "http://127.0.0.1:4174";
const SECRET = "test-session-secret-0123456789abcdef-0123456789";

export type TestApp = { request: (path: string, init?: RequestInit) => Promise<Response> };

export function cookieFrom(response: Response, name: string): string | null {
  const header = response.headers.get("set-cookie") ?? "";
  const match = header.match(new RegExp(`${name}=([^;]*)`));
  return match && match[1] ? match[1] : null;
}

export async function createTestAccounts(options: { audio: PreviewAudio; now?: () => Date }) {
  const now = options.now ?? (() => new Date());
  const repo = createMemoryRepo({
    now,
    teachers: [
      { userId: "teacher-1", displayName: "김해온" },
      { userId: "teacher-2", displayName: "다른 교사" },
    ],
  });
  const auth = memoryTeacherAuth([
    { email: "teacher@example.test", password: "correct horse", userId: "teacher-1" },
    { email: "other@example.test", password: "other pass", userId: "teacher-2" },
    { email: "student@example.test", password: "not teacher", userId: "user-3" },
  ]);
  const config: LearnConfig = { origin: TEST_ORIGIN, screenPreview: false, host: "127.0.0.1", port: 4174 };
  const app = createLearnApp(config, {}, {
    repo,
    auth,
    sessionSecret: SECRET,
    audio: options.audio,
    inviteOrigin: TEST_ORIGIN,
    secureCookies: false,
    now,
  });

  const client = (cookie: string | null): TestApp => ({
    request(path, init = {}) {
      const headers = new Headers(init.headers);
      if (cookie) headers.set("cookie", cookie);
      return Promise.resolve(app.request(path, { ...init, headers }));
    },
  });

  const postJson = (target: TestApp, path: string, body: unknown) =>
    target.request(path, {
      method: "POST",
      headers: { origin: TEST_ORIGIN, "content-type": "application/json" },
      body: JSON.stringify(body),
    });

  async function loginAs(email: string, password: string): Promise<TestApp> {
    const response = await postJson(client(null), "/api/teacher/login", { email, password });
    if (response.status !== 200) throw new Error(`login failed ${response.status}`);
    return client(`${TEACHER_COOKIE}=${cookieFrom(response, TEACHER_COOKIE)}`);
  }

  const teacher = await loginAs("teacher@example.test", "correct horse");

  async function invite(learnerId: string): Promise<string> {
    const response = await postJson(teacher, `/api/teacher/learners/${learnerId}/invitations`, {});
    const body = (await response.json()) as { url: string };
    return new URL(body.url).hash.replace("#token=", "");
  }

  async function addLearner(nickname: string, extra: Record<string, unknown> = {}): Promise<string> {
    const response = await postJson(teacher, "/api/teacher/learners", { nickname, dictLanguage: "ru", ...extra });
    return ((await response.json()) as { id: string }).id;
  }

  async function claim(token: string, claimKey = crypto.randomUUID(), from: TestApp = client(null)) {
    const response = await postJson(from, "/api/invitations/claim", { token, claimKey });
    const cookie = cookieFrom(response, DEVICE_COOKIE);
    return { response, cookie, app: client(cookie ? `${DEVICE_COOKIE}=${cookie}` : null) };
  }

  return {
    repo,
    app,
    teacher,
    client,
    postJson,
    loginAs,
    addLearner,
    invite,
    claim,
    otherTeacher: () => loginAs("other@example.test", "other pass"),
    async addConnectedLearner(nickname: string) {
      const id = await addLearner(nickname);
      const token = await invite(id);
      const claimed = await claim(token);
      if (!claimed.cookie) throw new Error("claim failed");
      return { id, app: claimed.app, cookie: claimed.cookie };
    },
  };
}
