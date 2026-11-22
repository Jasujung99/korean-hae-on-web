import { describe, expect, it } from "vitest";
import { buildReleaseSnapshot, type ReleaseCandidateAsset, type ReleaseCandidateItem } from "../../content/snapshot.ts";
import { importProposals, type DraftEntry } from "../../scripts/content-fill-import.ts";
import { createLearnApp } from "../app.ts";
import { memoryTeacherAuth } from "../accounts/auth.ts";
import { createMemoryRepo } from "../accounts/memory-repo.ts";
import { DEVICE_COOKIE, TEACHER_COOKIE } from "../accounts/routes.ts";
import { cookieFrom, TEST_ORIGIN, type TestApp } from "../accounts/test-kit.ts";
import type { LearnConfig } from "../config.ts";
import { createFixtureAudio } from "../preview/audio.ts";
import type { ContentVersionRow, TeacherContentView, WordView } from "../preview/contract.ts";
import { createMemoryAudioStore } from "./audio-store.ts";
import { createMemoryContentRepo, seedMemoryContentRepo } from "./memory-repo.ts";
import { createSnapshotCache } from "./runtime.ts";

const wav = new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4]);

async function createProposalTestKit() {
  const accountsRepo = createMemoryRepo({
    teachers: [{ userId: "teacher-1", displayName: "김해온" }],
  });
  const auth = memoryTeacherAuth([{ email: "teacher@example.test", password: "correct horse", userId: "teacher-1" }]);
  const contentRepo = createMemoryContentRepo();
  const audioStore = createMemoryAudioStore({
    "pw-아자--erinome.wav": wav,
    "word-1871-모자--erinome.wav": wav,
  });
  await seedMemoryContentRepo(contentRepo, ["pw-아자--erinome", "word-1871-모자--erinome"], {
    storage: "r2",
    releasedAt: "2026-11-19T10:00:00.000Z",
  });
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
  const claimRes = await sendJson(client(null), "POST", "/api/invitations/claim", {
    token: new URL(inv.url).hash.replace("#token=", ""),
    claimKey: crypto.randomUUID(),
  });
  const learner = client(`${DEVICE_COOKIE}=${cookieFrom(claimRes, DEVICE_COOKIE)}`);

  return { teacher, learner, anon: client(null), sendJson, contentRepo, snapshotCache };
}

describe("AI draft content proposals workflow (section 4)", () => {
  it("imports proposals idempotently, preserves non-empty pos, and excludes proposals from releases and learner endpoints", async () => {
    const kit = await createProposalTestKit();

    // 빈 칸이 있는 새 초안 단어를 만들고 승인해 둔다.
    const emptyItem = await kit.contentRepo.createItem({
      legacyId: "test-empty-1",
      groupId: "j_ch_jj",
      stage: "Stage 1",
      substage: "1-A",
      consonant: "ㅈ",
      word: "시험단어",
      entryId: 99001,
      pos: "",
      gloss: "",
      scene: "",
      example: "",
      related: "",
      note: "",
      source: "roadmap_seed",
      status: "approved",
      createdBy: null,
    });
    const filledPosItem = await kit.contentRepo.createItem({
      legacyId: "test-cleanup-1",
      groupId: "d_t_tt",
      stage: "Stage 1",
      substage: null,
      consonant: "ㄷ",
      word: "바다",
      entryId: 99002,
      pos: "명",
      gloss: "짠물이 모인 큰 물 (출제 위치: 두 번째 음절 다)",
      scene: "바닷가에 갈 때",
      example: "여름에 바다를 보러 갔어요.",
      related: "푸른 바다",
      note: "2음절",
      source: "roadmap_seed",
      status: "approved",
      createdBy: null,
    });

    const entries: DraftEntry[] = [
      {
        id: emptyItem.id,
        word: emptyItem.word,
        sense: "시험용 사전 뜻 — 기초사전 1 1",
        gloss: "미공개 초안 쉬운 뜻.",
        scene: "미공개 초안 장면 때",
        example: "시험단어를 아직 내보내지 않았어요.",
        related: ["단어 연습", "단어 확인"],
        pos: "명",
        flags: ["검수 테스트 항목"],
        model: "gemini-3.1-pro",
        prompt_version: "fill-v1",
      },
      {
        id: filledPosItem.id,
        word: filledPosItem.word,
        kind: "cleanup",
        gloss: "짠물이 모인 큰 물.",
        note: "2음절 · 출제 위치: 두 번째 음절 다",
        flags: [],
        model: "gemini-3.1-pro",
        prompt_version: "fill-v1",
      },
    ];

    const dry = await importProposals(kit.contentRepo, entries, { apply: false });
    expect(dry.mode).toBe("dry-run");
    expect(dry.wouldInsert).toBe(2);
    expect(await kit.contentRepo.listProposals()).toHaveLength(0);

    const first = await importProposals(kit.contentRepo, entries, { apply: true });
    expect(first).toMatchObject({ mode: "apply", inserted: 2, skipped: 0 });

    // 두 번째 실행은 멱등하게 건너뛴다.
    const second = await importProposals(kit.contentRepo, entries, { apply: true });
    expect(second).toMatchObject({ mode: "apply", inserted: 0, skipped: 2 });
    const pending = await kit.contentRepo.listProposals({ status: "pending" });
    expect(pending).toHaveLength(2);
    expect(pending.find((p) => p.itemId === emptyItem.id)?.fields.pos).toBe("명");
    expect(pending.find((p) => p.itemId === emptyItem.id)?.fields.related).toBe("단어 연습, 단어 확인");

    // 대기 중인 제안은 게시본(buildReleaseSnapshot / POST /releases)이나 학습자 API에 절대 들어가지 않는다.
    const releaseRes = await kit.sendJson(kit.teacher, "POST", "/api/teacher/content/releases", { note: "제안 대기 중 게시" });
    expect(releaseRes.status).toBe(201);
    const latest = await kit.contentRepo.latestRelease();
    const publishedTestItem = latest?.snapshot.items.find((i) => i.id === emptyItem.id);
    expect(publishedTestItem?.gloss).toBe("");
    expect(publishedTestItem?.example).toBe("");

    const snapCheck = buildReleaseSnapshot(
      (await kit.contentRepo.listItems({ includeHidden: false })) as ReleaseCandidateItem[],
      await kit.contentRepo.listStageZero(),
      (await kit.contentRepo.listAudioAssets()) as ReleaseCandidateAsset[],
      3,
      new Date().toISOString(),
    );
    expect(JSON.stringify(snapCheck)).not.toContain("미공개 초안 쉬운 뜻.");

    const learnerWords = ((await (await kit.learner.request("/api/learn/words")).json()) as { words: WordView[] }).words;
    expect(JSON.stringify(learnerWords)).not.toContain("미공개 초안 쉬운 뜻.");
    expect(JSON.stringify(learnerWords)).not.toContain("시험단어를 아직 내보내지 않았어요.");
  });

  it("applies and dismisses proposals via teacher API with version reason, teacher overrides, and 401 auth guard", async () => {
    const kit = await createProposalTestKit();
    const allItems = await kit.contentRepo.listItems({ includeHidden: false });
    const moja = allItems.find((i) => i.word === "모자");
    const targetA = allItems.find((i) => i.groupId === "s_ss");
    expect(moja).toBeDefined();
    expect(targetA).toBeDefined();

    await kit.contentRepo.insertProposals([
      {
        itemId: moja!.id,
        kind: "fill",
        fields: {
          gloss: "제안된 모자 쉬운 뜻.",
          scene: "외출할 때",
          example: "모자를 쓰고 나갔어요.",
          related: "모자를 쓰다",
        },
        sense: "모자(帽子): 머리에 쓰는 물건 — 기초사전 1",
        flags: ["직접 쓴 예문 확인"],
        source: "ai_draft",
        model: "gemini-3.1-pro",
        promptVersion: "fill-v1",
      },
      {
        itemId: targetA!.id,
        kind: "cleanup",
        fields: {
          gloss: "정리된 뜻.",
          note: "출제 위치: 첫째 음절",
        },
        sense: "출제 위치 표시 분리",
        flags: [],
        source: "ai_draft",
        model: "gemini-3.1-pro",
        promptVersion: "fill-v1",
      },
    ]);

    const proposals = await kit.contentRepo.listProposals({ status: "pending" });
    const mojaProp = proposals.find((p) => p.itemId === moja!.id)!;
    const otherProp = proposals.find((p) => p.itemId === targetA!.id)!;

    // 교사 외 요청(미로그인·학습자)은 401이어야 한다.
    expect((await kit.anon.request("/api/teacher/content?group=j_ch_jj")).status).toBe(401);
    expect((await kit.learner.request("/api/teacher/content?group=j_ch_jj")).status).toBe(401);
    expect((await kit.sendJson(kit.anon, "POST", `/api/teacher/content/proposals/${mojaProp.id}/apply`, {})).status).toBe(401);
    expect((await kit.sendJson(kit.learner, "POST", `/api/teacher/content/proposals/${mojaProp.id}/apply`, {})).status).toBe(401);
    expect((await kit.sendJson(kit.anon, "POST", `/api/teacher/content/proposals/${otherProp.id}/dismiss`, {})).status).toBe(401);
    expect((await kit.sendJson(kit.learner, "POST", `/api/teacher/content/proposals/${otherProp.id}/dismiss`, {})).status).toBe(401);

    // GET /api/teacher/content 에 대기 제안이 포함되어야 한다.
    const viewRes = await kit.teacher.request("/api/teacher/content?group=j_ch_jj");
    expect(viewRes.status).toBe(200);
    const view = (await viewRes.json()) as TeacherContentView;
    expect(view.totalProposalCount).toBe(2);
    expect(view.groups.find((g) => g.id === "j_ch_jj")?.proposalCount).toBe(1);
    expect(view.groups.find((g) => g.id === "s_ss")?.proposalCount).toBe(1);
    const mojaView = view.stages.flatMap((s) => s.items).find((i) => i.id === moja!.id);
    expect(mojaView?.proposal?.sense).toContain("모자(帽子)");

    // 적용 시 교사가 다듬은 값으로 아이템을 업데이트하고 ai_draft 판 기록을 남긴다.
    const applyRes = await kit.sendJson(kit.teacher, "POST", `/api/teacher/content/proposals/${mojaProp.id}/apply`, {
      gloss: "교사가 다듬은 모자 뜻.",
      scene: "외출할 때",
      example: moja!.example,
      related: "모자를 쓰다",
    });
    expect(applyRes.status).toBe(200);
    const appliedBody = (await applyRes.json()) as {
      item: { gloss: string };
      version: ContentVersionRow;
      proposal: { status: string };
    };
    expect(appliedBody.item.gloss).toBe("교사가 다듬은 모자 뜻.");
    expect(appliedBody.version.reason).toBe("ai_draft · gemini-3.1-pro · fill-v1");
    expect(appliedBody.proposal.status).toBe("applied");

    // 이미 처리된 제안을 다시 적용하려 하면 409가 난다.
    const dupApplyRes = await kit.sendJson(kit.teacher, "POST", `/api/teacher/content/proposals/${mojaProp.id}/apply`, {});
    expect(dupApplyRes.status).toBe(409);

    // 버전 기록에도 남아 있어야 한다.
    const versions = await kit.contentRepo.listItemVersions(moja!.id);
    expect(versions[0]?.reason).toBe("ai_draft · gemini-3.1-pro · fill-v1");

    // 아직 내보내지 않았으므로 학습자 화면에는 이전 게시본 뜻이 유지된다.
    const wordsBeforePublish = ((await (await kit.learner.request("/api/learn/words")).json()) as { words: WordView[] }).words;
    expect(wordsBeforePublish.find((w) => w.word === "모자")?.gloss).not.toBe("교사가 다듬은 모자 뜻.");

    // 버리기는 아이템을 수정하지 않고 제안 상태만 dismissed로 바꾼다.
    const beforeTargetGloss = targetA!.gloss;
    const dismissRes = await kit.sendJson(kit.teacher, "POST", `/api/teacher/content/proposals/${otherProp.id}/dismiss`, {});
    expect(dismissRes.status).toBe(200);
    const dismissed = (await dismissRes.json()) as { proposal: { status: string } };
    expect(dismissed.proposal.status).toBe("dismissed");
    expect((await kit.contentRepo.getItem(targetA!.id))?.gloss).toBe(beforeTargetGloss);
    expect(await kit.contentRepo.listProposals({ status: "pending" })).toHaveLength(0);
  });
});
