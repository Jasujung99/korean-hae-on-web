import { describe, expect, it } from "vitest";
import { buildReleaseSnapshot, snapshotSentenceAudioBase, snapshotWordAudioBase, type ReleaseCandidateAsset, type ReleaseCandidateItem } from "../../content/snapshot.ts";
import { createLearnApp } from "../app.ts";
import { memoryTeacherAuth } from "../accounts/auth.ts";
import { createMemoryRepo } from "../accounts/memory-repo.ts";
import { DEVICE_COOKIE, TEACHER_COOKIE } from "../accounts/routes.ts";
import { cookieFrom, TEST_ORIGIN, type TestApp } from "../accounts/test-kit.ts";
import type { LearnConfig } from "../config.ts";
import { createFixtureAudio } from "../preview/audio.ts";
import type { CourseView, TeacherContentView, WordView } from "../preview/contract.ts";
import { createMemoryAudioStore } from "./audio-store.ts";
import { createMemoryContentRepo, seedMemoryContentRepo } from "./memory-repo.ts";
import { createSnapshotCache } from "./runtime.ts";

const wav = new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4]);

async function createContentTestKit() {
  const accountsRepo = createMemoryRepo({
    teachers: [{ userId: "teacher-1", displayName: "김해온" }],
  });
  const auth = memoryTeacherAuth([{ email: "teacher@example.test", password: "correct horse", userId: "teacher-1" }]);
  const contentRepo = createMemoryContentRepo();
  const audioStore = createMemoryAudioStore({
    "word-1871-모자--erinome.wav": wav,
    "sentence-1871-모자--erinome.wav": wav,
    "word-65-가족--erinome.wav": wav,
  });
  await seedMemoryContentRepo(
    contentRepo,
    ["pw-아자--erinome", "word-1871-모자--erinome", "sentence-1871-모자--erinome", "word-65-가족--erinome"],
    { storage: "r2", releasedAt: "2026-11-19T10:00:00.000Z" },
  );
  const snapshotCache = createSnapshotCache(contentRepo, 60_000);
  const config: LearnConfig = { origin: TEST_ORIGIN, screenPreview: false, host: "127.0.0.1", port: 4174 };
  const app = createLearnApp(
    config,
    {},
    {
      repo: accountsRepo,
      auth,
      sessionSecret: "test-session-secret-0123456789abcdef-0123456789",
      audio: createFixtureAudio({}),
      contentRepo,
      audioStore,
      snapshotCache,
      inviteOrigin: TEST_ORIGIN,
      secureCookies: false,
    },
  );

  const client = (cookie: string | null): TestApp => ({
    request(path, init = {}) {
      const headers = new Headers(init.headers);
      if (cookie) headers.set("cookie", cookie);
      return Promise.resolve(app.request(path, { ...init, headers }));
    },
  });
  const sendJson = (target: TestApp, method: "POST" | "PATCH", path: string, body: unknown) =>
    target.request(path, {
      method,
      headers: { origin: TEST_ORIGIN, "content-type": "application/json" },
      body: JSON.stringify(body),
    });

  const loginRes = await sendJson(client(null), "POST", "/api/teacher/login", {
    email: "teacher@example.test",
    password: "correct horse",
  });
  const teacher = client(`${TEACHER_COOKIE}=${cookieFrom(loginRes, TEACHER_COOKIE)}`);

  const learnerId = (
    (await (await sendJson(teacher, "POST", "/api/teacher/learners", { nickname: "학습자", dictLanguage: "ru" })).json()) as {
      id: string;
    }
  ).id;
  const inv = (await (await sendJson(teacher, "POST", `/api/teacher/learners/${learnerId}/invitations`, {})).json()) as {
    url: string;
  };
  const token = new URL(inv.url).hash.replace("#token=", "");
  const claimRes = await sendJson(client(null), "POST", "/api/invitations/claim", {
    token,
    claimKey: crypto.randomUUID(),
  });
  const learner = client(`${DEVICE_COOKIE}=${cookieFrom(claimRes, DEVICE_COOKIE)}`);

  return { teacher, learner, anon: client(null), sendJson, contentRepo, snapshotCache };
}

describe("content CRUD, versioning, hiding, and stale tracking (stage 3)", () => {
  it("keeps newly added or approved words out of learner endpoints until a release is published", async () => {
    const kit = await createContentTestKit();

    const createdRes = await kit.sendJson(kit.teacher, "POST", "/api/teacher/content/items", {
      groupId: "j_ch_jj",
      stage: "Stage 1-A",
      consonant: "ㅈ",
      word: "새모자",
      gloss: "머리에 새로 쓰는 것",
      example: "새모자를 썼어요.",
    });
    expect(createdRes.status).toBe(201);
    const { item } = (await createdRes.json()) as { item: { id: string; status: string; source: string; entryId: number | null } };
    expect(item.status).toBe("draft");
    expect(item.source).toBe("teacher");
    expect(item.entryId).toBeNull();

    // 승인해도 내보내기 전에는 학습자 화면에 안 보인다.
    expect((await kit.sendJson(kit.teacher, "POST", `/api/teacher/content/items/${item.id}/approve`, {})).status).toBe(200);
    const beforeWords = ((await (await kit.learner.request("/api/learn/words")).json()) as { words: WordView[] }).words;
    expect(beforeWords.some((w) => w.word === "새모자")).toBe(false);
    const beforeCourse = (await (await kit.learner.request("/api/learn/course")).json()) as CourseView;
    const beforeStage1ACount = beforeCourse.groups[0]?.stages.find((s) => s.stage === "Stage 1-A")?.count;

    // 새 게시본 반영 후에는 학습자 화면에 보인다.
    const [allItems, stage0, assets] = await Promise.all([
      kit.contentRepo.listItems({ includeHidden: false }),
      kit.contentRepo.listStageZero(),
      kit.contentRepo.listAudioAssets(),
    ]);
    const built = buildReleaseSnapshot(
      allItems as ReleaseCandidateItem[],
      stage0,
      assets as ReleaseCandidateAsset[],
      2,
      new Date().toISOString(),
    );
    await kit.contentRepo.createRelease({
      releasedBy: "teacher-1",
      note: "새 단어 반영",
      snapshot: built.snapshot,
      itemCount: built.itemCount,
      audioCount: built.audioCount,
    });
    kit.snapshotCache.invalidate();

    const afterWords = ((await (await kit.learner.request("/api/learn/words")).json()) as { words: WordView[] }).words;
    expect(afterWords.some((w) => w.word === "새모자")).toBe(true);
    const afterCourse = (await (await kit.learner.request("/api/learn/course")).json()) as CourseView;
    const afterStage1ACount = afterCourse.groups[0]?.stages.find((s) => s.stage === "Stage 1-A")?.count;
    expect(afterStage1ACount).toBe((beforeStage1ACount ?? 0) + 1);
  });

  it("records version history on edits, marks audio stale without tainting shared group words, and hides without deleting", async () => {
    const kit = await createContentTestKit();
    const content = (await (await kit.teacher.request("/api/teacher/content?group=j_ch_jj")).json()) as TeacherContentView;
    const moja = content.stages[0]?.items.find((item) => item.word === "모자");
    const gajok = content.stages[0]?.items.find((item) => item.word === "가족");
    expect(moja).toBeDefined();
    expect(gajok).toBeDefined();

    // 다른 묶음의 자음은 거절한다.
    const badConsonant = await kit.sendJson(kit.teacher, "PATCH", `/api/teacher/content/items/${moja!.id}`, {
      consonant: "ㅅ",
    });
    expect(badConsonant.status).toBe(400);

    // 뜻만 고치면 음원은 stale 되지 않고 판만 쌓인다.
    const glossEdit = await kit.sendJson(kit.teacher, "PATCH", `/api/teacher/content/items/${moja!.id}`, {
      gloss: "햇볕을 가리는 물건.",
      reason: "뜻 다듬기",
    });
    expect(glossEdit.status).toBe(200);
    expect(await glossEdit.json()).toMatchObject({ changedFields: ["gloss"], staleMarked: 0 });

    // 예문을 고치면 예문 음원만 stale=true가 되고 단어 음원은 그대로 approved다.
    const exampleEdit = await kit.sendJson(kit.teacher, "PATCH", `/api/teacher/content/items/${moja!.id}`, {
      example: "밖에 나갈 때 모자를 썼어요.",
      reason: "예문 교체",
    });
    expect(exampleEdit.status).toBe(200);
    expect(await exampleEdit.json()).toMatchObject({ changedFields: ["example"], staleMarked: 1 });

    const afterMojaView = (await (await kit.teacher.request("/api/teacher/content?group=j_ch_jj")).json()) as TeacherContentView;
    const updatedMoja = afterMojaView.stages[0]?.items.find((item) => item.id === moja!.id);
    expect(updatedMoja?.wordAudio.erinome?.state).toBe("approved");
    expect(updatedMoja?.exampleAudio?.erinome?.state).toBe("stale");

    // 단어를 바꾸면 기존 단어 음원(word-1871-모자--erinome)이 item_id를 따라 stale 상태로 연결된다.
    const wordEdit = await kit.sendJson(kit.teacher, "PATCH", `/api/teacher/content/items/${moja!.id}`, {
      word: "모자들",
      reason: "복수형 시험",
    });
    expect(wordEdit.status).toBe(200);
    const afterRename = (await (await kit.teacher.request("/api/teacher/content?group=j_ch_jj")).json()) as TeacherContentView;
    const renamed = afterRename.stages[0]?.items.find((item) => item.id === moja!.id);
    expect(renamed?.wordAudio.erinome?.state).toBe("stale");

    // 판 기록 확인
    const versionsRes = await kit.teacher.request(`/api/teacher/content/items/${moja!.id}/versions`);
    const versions = ((await versionsRes.json()) as { versions: Array<{ version: number; changedFields: string[]; reason: string | null }> }).versions;
    expect(versions.map((v) => v.version)).toEqual([4, 3, 2, 1]);
    expect(versions[0]).toMatchObject({ changedFields: ["word"], reason: "복수형 시험" });

    // 2개 묶음이 공유하는 단어('가족') 한쪽을 고쳐도 다른 묶음(g_k_kk)의 공유 음원은 stale 처리되지 않는다.
    await kit.sendJson(kit.teacher, "PATCH", `/api/teacher/content/items/${gajok!.id}`, { word: "대가족" });
    const gkkView = (await (await kit.teacher.request("/api/teacher/content?group=g_k_kk")).json()) as TeacherContentView;
    const gkkGajok = gkkView.stages.flatMap((s) => s.items).find((item) => item.word === "가족");
    expect(gkkGajok?.wordAudio.erinome?.state).toBe("approved");
    expect(snapshotWordAudioBase(gkkGajok!)).toBe("word-65-가족");
    expect(snapshotSentenceAudioBase({ ...gkkGajok!, groupId: "g_k_kk" })).toBe("sentence-65-가족-g_k_kk");

    // 숨기기는 영구 삭제가 아니라 status='hidden' 처리한다.
    const hideRes = await kit.sendJson(kit.teacher, "POST", `/api/teacher/content/items/${moja!.id}/hide`, { reason: "보류" });
    expect(hideRes.status).toBe(200);
    const dbRow = await kit.contentRepo.getItem(moja!.id);
    expect(dbRow?.status).toBe("hidden");
    const afterHide = (await (await kit.teacher.request("/api/teacher/content?group=j_ch_jj")).json()) as TeacherContentView;
    expect(afterHide.groups.find((g) => g.id === "j_ch_jj")?.count).toBe(102);

    // 인증 없는 요청은 401
    expect((await kit.sendJson(kit.anon, "POST", "/api/teacher/content/items", { groupId: "j_ch_jj", stage: "Stage 1", consonant: "ㅈ", word: "가" })).status).toBe(401);
    expect((await kit.sendJson(kit.learner, "POST", "/api/teacher/content/items", { groupId: "j_ch_jj", stage: "Stage 1", consonant: "ㅈ", word: "가" })).status).toBe(401);
  });
});
