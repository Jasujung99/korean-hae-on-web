import { describe, expect, it } from "vitest";
import { snapshotFromReferenceJson, snapshotWordAudioBase } from "../../content/snapshot.ts";
import { voicedAudioId } from "../../content/practice-voices.ts";
import { batchPlan } from "../../content/tts/batch-plan.ts";
import { pcmToWav } from "../../content/tts/pipeline.ts";
import { buildUploadAssetInputs, summarizeGroupAudio } from "../../scripts/audio-upload.ts";
import { loadDbActiveAudioIds, makeDoneCheck } from "../../scripts/tts-groups.ts";
import { createLearnApp } from "../app.ts";
import { memoryTeacherAuth } from "../accounts/auth.ts";
import { createMemoryRepo } from "../accounts/memory-repo.ts";
import { DEVICE_COOKIE, TEACHER_COOKIE } from "../accounts/routes.ts";
import { cookieFrom, TEST_ORIGIN, type TestApp } from "../accounts/test-kit.ts";
import type { LearnConfig } from "../config.ts";
import { createFixtureAudio } from "../preview/audio.ts";
import { allContentAudioIds } from "../preview/audio-ids.ts";
import type { AudioInventoryView, ContentReleaseStatusView, CourseView, TeacherContentView, WordView } from "../preview/contract.ts";
import { createMemoryAudioStore } from "./audio-store.ts";
import { createMemoryContentRepo, seedMemoryContentRepo } from "./memory-repo.ts";
import { createSnapshotCache } from "./runtime.ts";

function fakeWavBase64(): { base64: string; bytes: Uint8Array } {
  const pcm = new Uint8Array(4800);
  const wavBytes = pcmToWav(pcm, 24000, 1);
  return { base64: Buffer.from(wavBytes).toString("base64"), bytes: wavBytes };
}

describe("content operations release lifecycle, audio inventory DB source, and multi-group upload helpers (stage 5)", () => {
  it("runs full add -> TTS -> approve -> release -> learner play -> edit stale -> hide -> release lifecycle and serves inventory from DB", async () => {
    const sample = fakeWavBase64();
    const accountsRepo = createMemoryRepo({
      teachers: [{ userId: "teacher-1", displayName: "김해온" }],
    });
    const auth = memoryTeacherAuth([{ email: "teacher@example.test", password: "correct horse", userId: "teacher-1" }]);
    const contentRepo = createMemoryContentRepo();
    const audioStore = createMemoryAudioStore({
      "word-1871-모자--erinome.wav": sample.bytes,
      "pw-아자--erinome.wav": sample.bytes,
    });
    await seedMemoryContentRepo(contentRepo, ["pw-아자--erinome", "word-1871-모자--erinome"], {
      storage: "r2",
      releasedAt: "2026-11-19T10:00:00.000Z",
    });
    const snapshotCache = createSnapshotCache(contentRepo, 60_000);
    const config: LearnConfig = {
      origin: TEST_ORIGIN,
      screenPreview: false,
      host: "127.0.0.1",
      port: 4174,
      ttsApiKey: "fake-tts-key",
    };
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
        ttsApiKey: "fake-tts-key",
        ttsFetcher: async () =>
          new Response(
            JSON.stringify({
              steps: [{ type: "model_output", content: [{ type: "audio", mime_type: "audio/wav", data: sample.base64 }] }],
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          ),
        // 초대 만료(72시간)는 저장소가 실제 시계로 확인한다. 고정 날짜를 쓰면 며칠 뒤 이 시험이 깨진다.
        now: () => new Date(),
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

    // 0. Stage 0 음원 초안도 화면에서 승인할 수 있다
    const pwDraft = await contentRepo.insertAudioAsset({
      audioId: "pw-아자--sulafat",
      itemId: null,
      kind: "pseudo",
      voiceKey: "sulafat",
      storage: "r2",
      objectKey: "a/aja-sulafat.m4a",
      mime: "audio/mp4",
      bytes: 100,
      durationMs: 500,
      sha256: "pw1",
      status: "draft",
      stale: false,
      source: "pc_batch",
      model: "m",
      stylePrompt: "flat",
      text: "아자",
      generatedAt: "2026-11-23T00:00:00.000Z",
    });
    const stage0View = (await (await teacher.request("/api/teacher/content?group=j_ch_jj")).json()) as TeacherContentView;
    expect(stage0View.stage0DraftAudios?.map((row) => [row.assetId, row.word, row.kind, row.voiceKey])).toEqual([
      [pwDraft.id, "아자", "pseudo", "sulafat"],
    ]);
    // 뒤 단계의 게시 개수가 바뀌지 않게 여기서는 제외로 검수를 마친다(승인과 같은 검수 경로).
    await sendJson(teacher, "POST", `/api/teacher/content/audio/${pwDraft.id}/reject`, {});
    const stage0After = (await (await teacher.request("/api/teacher/content?group=j_ch_jj")).json()) as TeacherContentView;
    expect(stage0After.stage0DraftAudios).toEqual([]);

    // 1. 새 단어 추가 + 단어 TTS 생성 -> 아직 학습자에게 보이지 않음
    const createRes = await sendJson(teacher, "POST", "/api/teacher/content/items", {
      groupId: "j_ch_jj",
      stage: "Stage 1-A",
      consonant: "ㅈ",
      word: "새말",
      gloss: "새로운 말",
      example: "새말을 배워요.",
    });
    expect(createRes.status).toBe(201);
    const createdItem = ((await createRes.json()) as { item: { id: string } }).item;

    const genRes = await sendJson(teacher, "POST", `/api/teacher/content/items/${createdItem.id}/audio`, {
      kind: "word",
      voice: "charon",
    });
    expect(genRes.status).toBe(201);
    const asset = ((await genRes.json()) as { asset: { id: string; objectKey: string } }).asset;

    let words = ((await (await learner.request("/api/learn/words")).json()) as { words: WordView[] }).words;
    expect(words.some((w) => w.word === "새말")).toBe(false);
    let course = (await (await learner.request("/api/learn/course")).json()) as CourseView;
    const initialCount = course.groups[0]!.stages.reduce((sum, s) => sum + s.count, 0);

    // 2. 단어·음원 승인 후에도 release 전에는 학습자에게 보이지 않음
    await sendJson(teacher, "POST", `/api/teacher/content/items/${createdItem.id}/approve`, {});
    await sendJson(teacher, "POST", `/api/teacher/content/audio/${asset.id}/approve`, {});

    const statusBefore = (await (await teacher.request("/api/teacher/content/release-status")).json()) as ContentReleaseStatusView;
    expect(statusBefore.latestSeq).toBe(1);
    expect(statusBefore.pendingReviewCount).toBe(0);
    expect(statusBefore.unpublishedApprovedCount).toBeGreaterThanOrEqual(2);

    words = ((await (await learner.request("/api/learn/words")).json()) as { words: WordView[] }).words;
    expect(words.some((w) => w.word === "새말")).toBe(false);

    // 3. 내보내기(seq=2) -> 학습자 화면 반영 + /api/sound/:ref 200 재생 + /api/teacher/audio-inventory DB 반영
    const relRes = await sendJson(teacher, "POST", "/api/teacher/content/releases", { note: "새말 추가" });
    expect(relRes.status).toBe(201);
    const relBody = (await relRes.json()) as {
      release: { seq: number; note: string | null };
      status: ContentReleaseStatusView;
    };
    expect(relBody.release.seq).toBe(2);
    expect(relBody.status.unpublishedApprovedCount).toBe(0);

    words = ((await (await learner.request("/api/learn/words")).json()) as { words: WordView[] }).words;
    const addedWord = words.find((w) => w.word === "새말");
    expect(addedWord).toBeDefined();
    expect(addedWord!.wordAudioRef).toBeTruthy();

    course = (await (await learner.request("/api/learn/course")).json()) as CourseView;
    expect(course.groups[0]!.stages.reduce((sum, s) => sum + s.count, 0)).toBe(initialCount + 1);

    const soundRes = await learner.request(`/api/sound/${encodeURIComponent(addedWord!.wordAudioRef!)}`);
    expect(soundRes.status).toBe(200);
    expect(new Uint8Array(await soundRes.arrayBuffer())).toEqual(sample.bytes);

    const inventory = (await (await teacher.request("/api/teacher/audio-inventory")).json()) as AudioInventoryView;
    expect(inventory.rawDir).toContain("phoneme_audio_assets");
    expect(inventory.totals.files).toBe(3);

    // 4. 단어 수정 -> staleMarked === 1 이고, 학습자는 계속 제2판("새말")을 본다
    const editRes = await sendJson(teacher, "PATCH", `/api/teacher/content/items/${createdItem.id}`, { word: "더새말" });
    expect(((await editRes.json()) as { staleMarked: number }).staleMarked).toBe(1);
    const viewAfterEdit = (await (await teacher.request("/api/teacher/content?group=j_ch_jj")).json()) as TeacherContentView;
    expect(viewAfterEdit.release.staleAudioCount).toBe(1);

    words = ((await (await learner.request("/api/learn/words")).json()) as { words: WordView[] }).words;
    expect(words.some((w) => w.word === "새말")).toBe(true);
    expect(words.some((w) => w.word === "더새말")).toBe(false);

    // 5. 숨기기 후 내보내기(seq=3) -> 학습자에서 빠지지만 음원 파일과 수정 기록은 남는다
    await sendJson(teacher, "POST", `/api/teacher/content/items/${createdItem.id}/hide`, { reason: "수업에서 제외" });
    const rel3Res = await sendJson(teacher, "POST", "/api/teacher/content/releases", { note: "정리" });
    expect(rel3Res.status).toBe(201);

    words = ((await (await learner.request("/api/learn/words")).json()) as { words: WordView[] }).words;
    expect(words.some((w) => w.word === "새말" || w.word === "더새말")).toBe(false);
    expect(audioStore.objects.has(asset.objectKey)).toBe(true);
    const versions = (await contentRepo.listItemVersions(createdItem.id)).map((v) => v.changedFields);
    expect(versions.some((fields) => fields.includes("status"))).toBe(true);
  });

  it("summarizes audio across all five groups and builds upload inputs for draft vs --approve without linking shared words", () => {
    const ref = snapshotFromReferenceJson();
    const allIds = new Set(allContentAudioIds(ref.items, ref.stage0));
    const samplePresent = new Set(
      (["j_ch_jj", "s_ss", "g_k_kk", "b_p_pp", "d_t_tt"] as const).map((gid) => {
        const word = ref.items.find((item) => item.groupId === gid)!;
        const audioId = voicedAudioId(snapshotWordAudioBase(word), "erinome");
        expect(allIds.has(audioId)).toBe(true);
        return audioId;
      }),
    );

    const summary = summarizeGroupAudio(ref.items, ref.stage0, samplePresent);
    expect(summary).toHaveLength(5);
    expect(summary.map((s) => s.groupId)).toEqual(["j_ch_jj", "s_ss", "g_k_kk", "b_p_pp", "d_t_tt"]);
    for (const row of summary) {
      expect(row.total).toBeGreaterThan(0);
      expect(row.present).toBeGreaterThanOrEqual(1);
    }

    const fakeItems = ref.items.map((item, idx) => ({
      ...item,
      id: `00000000-0000-4000-8000-${String(idx).padStart(12, "0")}`,
      source: "roadmap_seed" as const,
      status: "approved" as const,
      createdBy: null,
      createdAt: "2026-11-19T00:00:00.000Z",
      updatedAt: "2026-11-19T00:00:00.000Z",
    }));

    const draftPlan = buildUploadAssetInputs({
      items: fakeItems,
      entries: [
        { audioId: "word-1871-모자--erinome", objectKey: "a/111.m4a", bytes: 100, durationMs: 600, meta: null },
        { audioId: "word-65-가족--erinome", objectKey: "a/222.m4a", bytes: 120, durationMs: 700, meta: null },
      ],
      approve: false,
      nowIso: "2026-11-20T00:00:00.000Z",
    });
    expect(draftPlan.onConflict).toBe("ignore");
    expect(draftPlan.assets[0]?.status).toBe("draft");
    expect(draftPlan.assets[0]?.itemId).not.toBeNull();
    // 가족은 두 묶음(j_ch_jj, g_k_kk)에 함께 있어 특정 한 줄에 묶이지 않는다.
    expect(draftPlan.assets[1]?.itemId).toBeNull();

    const approvedPlan = buildUploadAssetInputs({
      items: fakeItems,
      entries: [{ audioId: "word-1871-모자--erinome", objectKey: "a/111.m4a", bytes: 100, durationMs: 600, meta: null }],
      approve: true,
      nowIso: "2026-11-20T00:00:00.000Z",
    });
    expect(approvedPlan.onConflict).toBe("merge");
    expect(approvedPlan.assets[0]?.status).toBe("approved");
    expect(approvedPlan.assets[0]?.reviewedAt).toBe("2026-11-20T00:00:00.000Z");
  });

  it("skips DB draft/approved audio IDs in tts:groups by default and regenerates them when --replace is enabled", async () => {
    const repo = createMemoryContentRepo();
    await repo.insertAudioAsset({
      audioId: "word-1871-모자--erinome",
      itemId: null,
      kind: "word",
      voiceKey: "erinome",
      storage: "r2",
      objectKey: "a/moja.m4a",
      mime: "audio/mp4",
      bytes: 100,
      durationMs: 600,
      sha256: "abc",
      status: "approved",
      stale: false,
      source: "pc_batch",
      model: "m",
      stylePrompt: "flat",
      text: "모자",
      generatedAt: "2026-11-20T00:00:00.000Z",
    });
    await repo.insertAudioAsset({
      audioId: "word-1000-기차--erinome",
      itemId: null,
      kind: "word",
      voiceKey: "erinome",
      storage: "r2",
      objectKey: "a/gicha.m4a",
      mime: "audio/mp4",
      bytes: 100,
      durationMs: 600,
      sha256: "def",
      status: "draft",
      stale: false,
      source: "ui_single",
      model: "m",
      stylePrompt: "flat",
      text: "기차",
      generatedAt: "2026-11-20T00:00:00.000Z",
    });
    await repo.insertAudioAsset({
      audioId: "word-100-가짜--erinome",
      itemId: null,
      kind: "word",
      voiceKey: "erinome",
      storage: "r2",
      objectKey: "a/gajja-stale.m4a",
      mime: "audio/mp4",
      bytes: 100,
      durationMs: 600,
      sha256: "ghi",
      status: "approved",
      stale: true,
      source: "import",
      model: "m",
      stylePrompt: "flat",
      text: "가짜",
      generatedAt: "2026-11-20T00:00:00.000Z",
    });
    await repo.insertAudioAsset({
      audioId: "word-200-의자--erinome",
      itemId: null,
      kind: "word",
      voiceKey: "erinome",
      storage: "r2",
      objectKey: "a/uija-rej.m4a",
      mime: "audio/mp4",
      bytes: 100,
      durationMs: 600,
      sha256: "jkl",
      status: "rejected",
      stale: false,
      source: "ui_single",
      model: "m",
      stylePrompt: "flat",
      text: "의자",
      generatedAt: "2026-11-20T00:00:00.000Z",
    });

    const dbActive = await loadDbActiveAudioIds(repo);
    expect(dbActive.has("word-1871-모자--erinome")).toBe(true);
    expect(dbActive.has("word-1000-기차--erinome")).toBe(true);
    expect(dbActive.has("word-100-가짜--erinome")).toBe(false);
    expect(dbActive.has("word-200-의자--erinome")).toBe(false);
    expect((await loadDbActiveAudioIds(null)).size).toBe(0);

    const plannedIds = (replace: boolean) => {
      const done = makeDoneCheck({
        doneLocal: () => false,
        dbActive: replace ? new Map() : dbActive,
        replace,
      });
      return new Set(batchPlan("erinome", ["words"], done, "j_ch_jj").flatMap((g) => g.items.map((i) => i.id)));
    };

    const normalIds = plannedIds(false);
    expect(normalIds.has("word-1871-모자--erinome")).toBe(false);
    const ref = snapshotFromReferenceJson();
    const gichaId = voicedAudioId(snapshotWordAudioBase(ref.items.find((i) => i.word === "기차")!), "erinome");
    dbActive.set(gichaId, new Set(["기차"]));
    const normalAfter = plannedIds(false);
    expect(normalAfter.has(gichaId)).toBe(false);

    const replaceIds = plannedIds(true);
    expect(replaceIds.has("word-1871-모자--erinome")).toBe(true);
    expect(replaceIds.has(gichaId)).toBe(true);
  });
});
