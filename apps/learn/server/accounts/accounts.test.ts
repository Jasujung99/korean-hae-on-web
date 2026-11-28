import { describe, expect, it } from "vitest";
import { PRACTICE_ITEMS } from "../../content/practice.ts";
import { createFixtureAudio } from "../preview/audio.ts";
import type { SessionView } from "../preview/contract.ts";
import { DEVICE_COOKIE } from "./routes.ts";
import { cookieFrom, createTestAccounts, TEST_ORIGIN, type TestApp } from "./test-kit.ts";

const wav = new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4]);
const audio = () => createFixtureAudio(Object.fromEntries(PRACTICE_ITEMS.map((item) => [item.audioId, wav])));

async function kit(now?: () => Date) {
  return createTestAccounts({ audio: audio(), now });
}

async function json<T>(response: Response | Promise<Response>): Promise<T> {
  return (await (await response).json()) as T;
}

describe("personal invitations", () => {
  it("does not consume an invitation when it is inspected", async () => {
    const k = await kit();
    const id = await k.addLearner("알렉세이");
    const token = await k.invite(id);
    for (let round = 0; round < 3; round += 1) {
      const view = await json<{ status: string; nickname: string }>(k.postJson(k.client(null), "/api/invitations/inspect", { token }));
      expect(view).toMatchObject({ status: "ok", nickname: "알렉세이" });
    }
    const list = await json<{ learners: Array<{ invite: { status: string }; devices: number }> }>(k.teacher.request("/api/teacher/learners"));
    expect(list.learners[0]).toMatchObject({ invite: { status: "open" }, devices: 0 });
    // 초대 페이지 자체는 화면 주소일 뿐 API가 아니다.
    expect((await k.client(null).request(`/api/join?token=${token}`)).status).toBe(404);
  });

  it("connects one device once, and replays the same answer when the same click is retried", async () => {
    const k = await kit();
    const id = await k.addLearner("마리아");
    const token = await k.invite(id);
    const claimKey = crypto.randomUUID();
    const first = await k.claim(token, claimKey);
    expect(first.response.status).toBe(200);
    expect(first.response.headers.get("set-cookie")).toMatch(/HttpOnly/i);
    expect(first.response.headers.get("set-cookie")).toMatch(/SameSite=Lax/i);
    const me = await json<{ learner: { id: string; nickname: string } }>(first.app.request("/api/me"));
    expect(me.learner).toEqual({ id, nickname: "마리아" });

    const retry = await k.claim(token, claimKey);
    expect(retry.response.status).toBe(200);
    expect(retry.cookie).toBe(first.cookie);

    const second = await k.claim(token, crypto.randomUUID());
    expect(second.response.status).toBe(410);
    expect(await second.response.json()).toMatchObject({ status: "used" });
    expect(second.cookie).toBeNull();

    const inspect = await json<{ status: string; nickname: string | null }>(k.postJson(k.client(null), "/api/invitations/inspect", { token }));
    expect(inspect).toEqual({ status: "used", nickname: null, dictLanguage: null });
  });

  it("lets only one of two simultaneous claims connect", async () => {
    const k = await kit();
    const token = await k.invite(await k.addLearner("동시"));
    const results = await Promise.all([k.claim(token, crypto.randomUUID()), k.claim(token, crypto.randomUUID())]);
    expect(results.map((row) => row.response.status).sort()).toEqual([200, 410]);
  });

  it("rejects expired, revoked, and unknown invitations", async () => {
    let clock = Date.parse("2026-11-18T00:00:00.000Z");
    const k = await kit(() => new Date(clock));
    const id = await k.addLearner("기간");
    const old = await k.invite(id);
    clock += 73 * 60 * 60_000;
    expect((await k.claim(old)).response.status).toBe(410);
    expect(await json(k.postJson(k.client(null), "/api/invitations/inspect", { token: old }))).toMatchObject({ status: "expired" });
    // 교사 세션(12시간)도 끝났다.
    expect((await k.teacher.request("/api/teacher/learners")).status).toBe(401);
    const teacher = await k.loginAs("teacher@example.test", "correct horse");
    const issue = async () => {
      const body = await json<{ url: string }>(k.postJson(teacher, `/api/teacher/learners/${id}/invitations`, {}));
      return new URL(body.url).hash.replace("#token=", "");
    };

    const first = await issue();
    const second = await issue();
    const revoked = await k.claim(first);
    expect(await revoked.response.json()).toMatchObject({ status: "revoked" });
    expect((await k.claim(second)).response.status).toBe(200);

    const unknown = await k.claim("a".repeat(43));
    expect(await unknown.response.json()).toMatchObject({ status: "invalid" });
    expect((await k.postJson(k.client(null), "/api/invitations/claim", { token: "x", claimKey: "short" })).status).toBe(400);
  });

  it("keeps the same learner and history when the teacher issues a new link for a new device", async () => {
    const k = await kit();
    const id = await k.addLearner("이어하기");
    const phone = await k.claim(await k.invite(id));
    const started = await json<{ session: SessionView }>(k.postJson(phone.app, "/api/learn/sessions", { itemKind: "pseudo" }));

    const laptop = await k.claim(await k.invite(id));
    const current = await json<{ session: SessionView | null }>(laptop.app.request("/api/learn/sessions/current"));
    expect(current.session?.sessionId).toBe(started.session.sessionId);
    expect((await phone.app.request("/api/me")).status).toBe(200);

    const list = await json<{ learners: Array<{ id: string; devices: number }> }>(k.teacher.request("/api/teacher/learners"));
    expect(list.learners).toHaveLength(1);
    expect(list.learners[0]).toMatchObject({ id, devices: 2 });
  });

  it("asks for the dictionary language at the first visit and keeps settings on the learner", async () => {
    const k = await kit();
    const id = await k.addLearner("사전", { dictLanguage: "ru" });
    const token = await k.invite(id);
    const response = await k.postJson(k.client(null), "/api/invitations/claim", { token, claimKey: crypto.randomUUID(), dictLanguage: "en" });
    const cookie = cookieFrom(response, DEVICE_COOKIE);
    const app = k.client(`${DEVICE_COOKIE}=${cookie}`);
    expect(await json(app.request("/api/me"))).toMatchObject({ settings: { dictLanguage: "en", style: "canvas" } });

    expect(await json(k.postJson(app, "/api/me/settings", { style: "proto" }))).toMatchObject({ settings: { style: "proto" } });
    const other = await k.claim(await k.invite(id));
    expect(await json(other.app.request("/api/me"))).toMatchObject({ settings: { dictLanguage: "en", style: "proto" } });
    expect((await k.postJson(app, "/api/me/settings", { dictLanguage: "vi" })).status).toBe(400);
  });
});

describe("device sessions", () => {
  it("keeps each learner's records apart", async () => {
    const k = await kit();
    const a = await k.addConnectedLearner("가");
    const b = await k.addConnectedLearner("나");
    await k.postJson(a.app, "/api/learn/sessions", { itemKind: "pseudo" });
    expect(await json(b.app.request("/api/learn/sessions/current"))).toEqual({ session: null });
    expect((await k.repo.events(b.id)).length).toBe(0);
    expect((await k.repo.events(a.id)).length).toBe(1);
  });

  it("ends a device session when the learner leaves or the teacher disconnects devices", async () => {
    const k = await kit();
    const a = await k.addConnectedLearner("나가기");
    const left = await k.postJson(a.app, "/api/me/leave", {});
    expect(left.status).toBe(200);
    expect(left.headers.get("set-cookie")).toMatch(new RegExp(`${DEVICE_COOKIE}=;`));
    expect((await a.app.request("/api/me")).status).toBe(401);

    const b = await k.addConnectedLearner("해제");
    const revoked = await json<{ revoked: number }>(k.postJson(k.teacher, `/api/teacher/learners/${b.id}/devices/revoke`, {}));
    expect(revoked.revoked).toBe(1);
    expect((await b.app.request("/api/learn/sessions/current")).status).toBe(401);
  });

  it("connects one learner per browser and ends the previous connection when another invite is used", async () => {
    const k = await kit();
    const a = await k.addConnectedLearner("먼저");
    const otherId = await k.addLearner("나중");
    const switched = await k.claim(await k.invite(otherId), crypto.randomUUID(), a.app);
    expect(switched.response.status).toBe(200);
    expect(await json(switched.app.request("/api/me"))).toMatchObject({ learner: { nickname: "나중" } });
    expect((await a.app.request("/api/me")).status).toBe(401);
  });

  it("does not accept a learner id from the request body", async () => {
    const k = await kit();
    const a = await k.addConnectedLearner("본인");
    const b = await k.addConnectedLearner("남");
    const event = { id: "event-0001-abcd", sessionId: null, seq: 1, type: "visibility_hidden", clientTime: new Date().toISOString(), learnerId: b.id };
    await k.postJson(a.app, "/api/learn/events", { events: [event] });
    expect((await k.repo.events(b.id)).length).toBe(0);
    expect((await k.repo.events(a.id))[0]?.learnerId).toBe(a.id);
  });
});

describe("teacher access", () => {
  it("lets in only teachers with the right password", async () => {
    const k = await kit();
    const wrong = await k.postJson(k.client(null), "/api/teacher/login", { email: "teacher@example.test", password: "nope" });
    expect(wrong.status).toBe(401);
    expect(wrong.headers.get("set-cookie")).toBeNull();
    const notTeacher = await k.postJson(k.client(null), "/api/teacher/login", { email: "student@example.test", password: "not teacher" });
    expect(notTeacher.status).toBe(403);
    expect((await k.client(null).request("/api/teacher/learners")).status).toBe(401);
  });

  it("keeps learner devices out of teacher pages and teachers out of other teachers' learners", async () => {
    const k = await kit();
    const a = await k.addConnectedLearner("학생");
    expect((await a.app.request("/api/teacher/learners")).status).toBe(401);
    expect((await k.postJson(a.app, `/api/teacher/learners/${a.id}/invitations`, {})).status).toBe(401);
    const other: TestApp = await k.otherTeacher();
    expect((await k.postJson(other, `/api/teacher/learners/${a.id}/invitations`, {})).status).toBe(404);
    expect((await k.postJson(other, `/api/teacher/learners/${a.id}/devices/revoke`, {})).status).toBe(404);
  });

  it("returns the invitation link once and never lists the raw token", async () => {
    const k = await kit();
    const id = await k.addLearner("링크");
    const issued = await json<{ url: string; expiresAt: string }>(k.postJson(k.teacher, `/api/teacher/learners/${id}/invitations`, {}));
    expect(issued.url).toMatch(/^http:\/\/127\.0\.0\.1:4174\/join#token=[A-Za-z0-9_-]{40,}$/);
    const token = new URL(issued.url).hash.replace("#token=", "");
    const list = await (await k.teacher.request("/api/teacher/learners")).text();
    expect(list).not.toContain(token);
    expect(JSON.stringify(await k.repo.invitations([id]))).not.toContain(token);
  });

  it("logs a teacher out by ending the teacher session", async () => {
    const k = await kit();
    expect((await k.postJson(k.teacher, "/api/teacher/logout", {})).status).toBe(200);
    expect((await k.teacher.request("/api/teacher/learners")).status).toBe(401);
  });
});

describe("learner lifecycle", () => {
  const remove = (app: TestApp, id: string) =>
    app.request(`/api/teacher/learners/${id}`, {
      method: "DELETE",
      headers: { origin: TEST_ORIGIN, "content-type": "application/json" },
      body: "{}",
    });
  type Row = { id: string; status: string; invite: { status: string }; devices: number };
  const rows = async (k: Awaited<ReturnType<typeof kit>>) =>
    (await json<{ learners: Row[] }>(k.teacher.request("/api/teacher/learners"))).learners;

  it("archives a learner: open links stop working, connected devices are blocked, and records stay", async () => {
    const k = await kit();
    const a = await k.addConnectedLearner("종료");
    await k.postJson(a.app, "/api/learn/sessions", { itemKind: "pseudo" });
    expect((await k.repo.events(a.id)).length).toBe(1);
    const pending = await k.invite(a.id);

    const archived = await k.postJson(k.teacher, `/api/teacher/learners/${a.id}/archive`, {});
    expect(archived.status).toBe(200);
    expect(await archived.json()).toMatchObject({ status: "archived", revokedInvitations: 1, revokedDevices: 1 });

    const me = await a.app.request("/api/me");
    expect(me.status).toBe(401);
    expect(me.headers.get("set-cookie") ?? "").not.toMatch(new RegExp(`${DEVICE_COOKIE}=[A-Za-z0-9_-]{20,}`));
    expect((await a.app.request("/api/learn/sessions/current")).status).toBe(401);
    expect((await k.postJson(a.app, "/api/learn/sessions", { itemKind: "pseudo" })).status).toBe(401);

    const late = await k.claim(pending);
    expect(late.response.status).toBe(410);
    expect(late.cookie).toBeNull();
    expect(await json(k.postJson(k.client(null), "/api/invitations/inspect", { token: pending }))).toMatchObject({ status: "revoked" });

    expect((await k.repo.events(a.id)).length).toBe(1);
    const row = (await rows(k)).find((item) => item.id === a.id);
    expect(row).toMatchObject({ status: "archived", invite: { status: "revoked" }, devices: 0 });
    // 종료한 학습자의 기록 보기는 계속 열린다.
    expect((await k.teacher.request(`/api/teacher/learners/${a.id}`)).status).toBe(200);
  });

  it("clears the device cookie when an archived learner's device comes back", async () => {
    const k = await kit();
    const a = await k.addConnectedLearner("쿠키");
    // 기기 세션은 살아 있지만 학습자만 종료된 경우(종료와 같은 때 들어온 요청)도 막는다.
    await k.repo.setLearnerStatus(a.id, "archived");
    const me = await a.app.request("/api/me");
    expect(me.status).toBe(401);
    expect(me.headers.get("set-cookie")).toMatch(new RegExp(`${DEVICE_COOKIE}=;`));
    expect((await a.app.request("/api/learn/words")).status).toBe(401);
  });

  it("refuses a new link while archived, and reconnects to the same learner after reopening", async () => {
    const k = await kit();
    const a = await k.addConnectedLearner("다시");
    const started = await json<{ session: SessionView }>(k.postJson(a.app, "/api/learn/sessions", { itemKind: "pseudo" }));
    await k.postJson(k.teacher, `/api/teacher/learners/${a.id}/archive`, {});

    const refused = await k.postJson(k.teacher, `/api/teacher/learners/${a.id}/invitations`, {});
    expect(refused.status).toBe(409);
    expect(await refused.json()).toMatchObject({ error: "learner_archived" });

    const reopened = await k.postJson(k.teacher, `/api/teacher/learners/${a.id}/reopen`, {});
    expect(reopened.status).toBe(200);
    expect((await rows(k)).find((item) => item.id === a.id)).toMatchObject({ status: "active", devices: 0 });
    // 다시 열어도 예전 기기는 그대로 끊긴 상태다. 링크는 따로 만든다.
    expect((await a.app.request("/api/me")).status).toBe(401);

    const fresh = await k.claim(await k.invite(a.id));
    expect(fresh.response.status).toBe(200);
    expect(await json(fresh.app.request("/api/me"))).toMatchObject({ learner: { id: a.id, nickname: "다시" } });
    const current = await json<{ session: SessionView | null }>(fresh.app.request("/api/learn/sessions/current"));
    expect(current.session?.sessionId).toBe(started.session.sessionId);
  });

  it("deletes only archived or test learners, together with their records", async () => {
    const k = await kit();
    const a = await k.addConnectedLearner("지우기");
    await k.postJson(a.app, "/api/learn/sessions", { itemKind: "pseudo" });

    const refused = await remove(k.teacher, a.id);
    expect(refused.status).toBe(409);
    expect(await refused.json()).toMatchObject({ error: "archive_first" });
    expect(await k.repo.learner(a.id)).not.toBeNull();

    await k.postJson(k.teacher, `/api/teacher/learners/${a.id}/archive`, {});
    const deleted = await remove(k.teacher, a.id);
    expect(deleted.status).toBe(200);
    expect(await k.repo.learner(a.id)).toBeNull();
    expect(await k.repo.events(a.id)).toEqual([]);
    expect(await k.repo.invitations([a.id])).toEqual([]);
    expect((await rows(k)).some((item) => item.id === a.id)).toBe(false);
    expect((await k.teacher.request(`/api/teacher/learners/${a.id}`)).status).toBe(404);
    expect((await a.app.request("/api/me")).status).toBe(401);
    expect((await remove(k.teacher, a.id)).status).toBe(404);

    // 시험 학습자는 진행 중이어도 바로 지울 수 있다.
    const testId = await k.addLearner("시험 지우기", { isTest: true });
    await k.invite(testId);
    expect((await remove(k.teacher, testId)).status).toBe(200);
    expect(await k.repo.learner(testId)).toBeNull();
    expect(await k.repo.invitations([testId])).toEqual([]);
  });

  it("blocks archive, reopen, and delete for another teacher's learner", async () => {
    const k = await kit();
    const a = await k.addConnectedLearner("남의 학생");
    const testId = await k.addLearner("남의 시험", { isTest: true });
    const other = await k.otherTeacher();
    expect((await k.postJson(other, `/api/teacher/learners/${a.id}/archive`, {})).status).toBe(404);
    expect((await k.repo.learner(a.id))?.status).toBe("active");
    expect((await a.app.request("/api/me")).status).toBe(200);

    await k.postJson(k.teacher, `/api/teacher/learners/${a.id}/archive`, {});
    expect((await k.postJson(other, `/api/teacher/learners/${a.id}/reopen`, {})).status).toBe(404);
    expect((await k.repo.learner(a.id))?.status).toBe("archived");
    expect((await remove(other, a.id)).status).toBe(404);
    expect((await remove(other, testId)).status).toBe(404);
    expect(await k.repo.learner(a.id)).not.toBeNull();
    expect(await k.repo.learner(testId)).not.toBeNull();
    expect((await k.postJson(other, `/api/teacher/learners/${a.id}/invitations`, {})).status).toBe(404);
    expect((await other.request(`/api/teacher/learners/${a.id}`)).status).toBe(404);
    // 학습자 기기로는 교사 동작을 부를 수 없다.
    const b = await k.addConnectedLearner("기기");
    expect((await k.postJson(b.app, `/api/teacher/learners/${b.id}/archive`, {})).status).toBe(401);
    expect((await remove(b.app, b.id)).status).toBe(401);
  });
});
