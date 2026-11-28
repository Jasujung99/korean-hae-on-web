import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { groupContents } from "../../content/tts/batch-plan.ts";
import { FLASH_TTS_MODEL, FLAT_READING_STYLE, TURNS_READING_STYLE, pcmToWav } from "../../content/tts/pipeline.ts";
import { DAILY_TTS_LIMIT, ttsQuotaDay } from "../../content/tts/quota.ts";
import { createLearnApp } from "../app.ts";
import { memoryTeacherAuth } from "../accounts/auth.ts";
import { createMemoryRepo } from "../accounts/memory-repo.ts";
import { DEVICE_COOKIE, TEACHER_COOKIE } from "../accounts/routes.ts";
import { cookieFrom, TEST_ORIGIN, type TestApp } from "../accounts/test-kit.ts";
import type { LearnConfig } from "../config.ts";
import { createFixtureAudio } from "../preview/audio.ts";
import type { TeacherContentView } from "../preview/contract.ts";
import { createMemoryAudioStore } from "./audio-store.ts";
import { createLocalAudioStore } from "./local-audio-store.ts";
import { createMemoryContentRepo, seedMemoryContentRepo } from "./memory-repo.ts";
import { createSnapshotCache } from "./runtime.ts";
import { SINGLE_TTS_METHOD, buildSingleTtsRequestBody } from "./tts-single.ts";

function fakeWavBase64(): { base64: string; bytes: Uint8Array } {
  const pcm = new Uint8Array(4800); // 100ms at 24kHz 16-bit mono
  const wavBytes = pcmToWav(pcm, 24000, 1);
  return { base64: Buffer.from(wavBytes).toString("base64"), bytes: wavBytes };
}

function interactionWavResponse(base64: string, status = 200): Response {
  return new Response(
    JSON.stringify({
      steps: [
        {
          type: "model_output",
          content: [{ type: "audio", mime_type: "audio/wav", data: base64 }],
        },
      ],
    }),
    { status, headers: { "content-type": "application/json" } },
  );
}

async function createTtsTestKit(options: {
  ttsApiKey?: string | null;
  fetcher?: typeof fetch;
  now?: () => Date;
} = {}) {
  const accountsRepo = createMemoryRepo({
    teachers: [{ userId: "teacher-1", displayName: "김해온" }],
  });
  const auth = memoryTeacherAuth([{ email: "teacher@example.test", password: "correct horse", userId: "teacher-1" }]);
  const contentRepo = createMemoryContentRepo();
  const seedWav = new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4]);
  const audioStore = createMemoryAudioStore({
    "word-1871-모자--erinome.wav": seedWav,
  });
  await seedMemoryContentRepo(contentRepo, ["word-1871-모자--erinome"], {
    storage: "r2",
    releasedAt: "2026-11-19T10:00:00.000Z",
  });
  const snapshotCache = createSnapshotCache(contentRepo, 60_000);
  const now = options.now ?? (() => new Date("2026-11-20T03:00:00.000Z"));
  const config: LearnConfig = {
    origin: TEST_ORIGIN,
    screenPreview: false,
    host: "127.0.0.1",
    port: 4174,
    ttsApiKey: options.ttsApiKey === undefined ? "test-fake-tts-key" : options.ttsApiKey,
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
      ttsApiKey: config.ttsApiKey ?? null,
      ttsFetcher: options.fetcher,
      now,
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

  return { teacher, learner, anon: client(null), sendJson, contentRepo, audioStore, now };
}

describe("inline single-item TTS generation, preview, draft review, and quota (stage 4)", () => {
  it("generates single word/sentence TTS, previews draft via auth, preserves old objects on regenerate, and approves/rejects", async () => {
    const sample = fakeWavBase64();
    let fetchCalls = 0;
    const kit = await createTtsTestKit({
      fetcher: async () => {
        fetchCalls += 1;
        return interactionWavResponse(sample.base64);
      },
    });

    const listRes = await kit.teacher.request("/api/teacher/content?group=j_ch_jj");
    const listView = (await listRes.json()) as TeacherContentView;
    const moja = listView.stages[0]!.items.find((row) => row.word === "모자")!;
    expect(moja).toBeDefined();

    // 단어 음원 생성 (charon -> 없음 -> 초안)
    const genWord = await kit.sendJson(kit.teacher, "POST", `/api/teacher/content/items/${moja.id}/audio`, {
      kind: "word",
      voice: "charon",
    });
    expect(genWord.status).toBe(201);
    const genWordBody = (await genWord.json()) as {
      asset: { id: string; audioId: string; status: string; playUrl: string; durationMs: number | null; objectKey: string };
      usage: { used: number; remaining: number; bySource: { ui_single: number; pc_batch: number } };
    };
    expect(genWordBody.asset.status).toBe("draft");
    expect(genWordBody.asset.audioId).toBe("word-1871-모자--charon");
    expect(genWordBody.asset.durationMs).toBe(100);
    expect(genWordBody.usage.used).toBe(1);
    expect(genWordBody.usage.bySource.ui_single).toBe(1);
    expect(fetchCalls).toBe(1);

    // 교사 미리듣기 200, 비로그인/학습자 401
    const playTeacher = await kit.teacher.request(genWordBody.asset.playUrl);
    expect(playTeacher.status).toBe(200);
    expect(playTeacher.headers.get("content-type")).toBe("audio/wav");
    expect(new Uint8Array(await playTeacher.arrayBuffer())).toEqual(sample.bytes);

    expect((await kit.anon.request(genWordBody.asset.playUrl)).status).toBe(401);
    expect((await kit.learner.request(genWordBody.asset.playUrl)).status).toBe(401);

    // 같은 목소리로 다시 생성 -> 이전 초안은 superseded, 저장소 파일은 유지
    const genAgain = await kit.sendJson(kit.teacher, "POST", `/api/teacher/content/items/${moja.id}/audio`, {
      kind: "word",
      voice: "charon",
    });
    expect(genAgain.status).toBe(201);
    const genAgainBody = (await genAgain.json()) as { asset: { id: string; objectKey: string }; usage: { used: number } };
    expect(genAgainBody.usage.used).toBe(2);
    const firstAsset = await kit.contentRepo.getAudioAsset(genWordBody.asset.id);
    expect(firstAsset?.status).toBe("superseded");
    expect(kit.audioStore.objects.has(genWordBody.asset.objectKey)).toBe(true);
    expect(kit.audioStore.objects.has(genAgainBody.asset.objectKey)).toBe(true);

    // 예문 생성 + 검수 대기 목록 확인 후 제외(reject)
    const genSentence = await kit.sendJson(kit.teacher, "POST", `/api/teacher/content/items/${moja.id}/audio`, {
      kind: "sentence",
      voice: "erinome",
    });
    expect(genSentence.status).toBe(201);
    const genSentenceBody = (await genSentence.json()) as { asset: { id: string } };

    const afterGenView = (await (await kit.teacher.request("/api/teacher/content?group=j_ch_jj")).json()) as TeacherContentView;
    const stage1a = afterGenView.stages[0]!;
    expect(stage1a.draftAudios.some((d) => d.assetId === genAgainBody.asset.id)).toBe(true);
    expect(stage1a.draftAudios.some((d) => d.assetId === genSentenceBody.asset.id)).toBe(true);

    // 제외
    const rejectRes = await kit.sendJson(kit.teacher, "POST", `/api/teacher/content/audio/${genSentenceBody.asset.id}/reject`, {});
    expect(rejectRes.status).toBe(200);
    expect((await kit.contentRepo.getAudioAsset(genSentenceBody.asset.id))?.status).toBe("rejected");

    // 단어를 고쳐 기존 erinome·charon 단어 음원을 stale로 만든 뒤, 새로 만들어 승인하면 stale 해소
    await kit.sendJson(kit.teacher, "PATCH", `/api/teacher/content/items/${moja.id}`, { word: "모자쓰기" });
    const staleView = (await (await kit.teacher.request("/api/teacher/content?group=j_ch_jj")).json()) as TeacherContentView;
    expect(staleView.release.staleAudioCount).toBe(2);

    const genFresh = await kit.sendJson(kit.teacher, "POST", `/api/teacher/content/items/${moja.id}/audio`, {
      kind: "word",
      voice: "erinome",
    });
    expect(genFresh.status).toBe(201);
    const freshBody = (await genFresh.json()) as { asset: { id: string } };
    const approveRes = await kit.sendJson(kit.teacher, "POST", `/api/teacher/content/audio/${freshBody.asset.id}/approve`, {});
    expect(approveRes.status).toBe(200);

    const afterErinome = (await (await kit.teacher.request("/api/teacher/content?group=j_ch_jj")).json()) as TeacherContentView;
    expect(afterErinome.release.staleAudioCount).toBe(1);
    const updatedMoja = afterErinome.stages[0]!.items.find((row) => row.id === moja.id)!;
    expect(updatedMoja.wordAudio.erinome?.state).toBe("approved");

    const genCharonFresh = await kit.sendJson(kit.teacher, "POST", `/api/teacher/content/items/${moja.id}/audio`, {
      kind: "word",
      voice: "charon",
    });
    expect(genCharonFresh.status).toBe(201);
    const charonFreshBody = (await genCharonFresh.json()) as { asset: { id: string } };
    await kit.sendJson(kit.teacher, "POST", `/api/teacher/content/audio/${charonFreshBody.asset.id}/approve`, {});

    const finalView = (await (await kit.teacher.request("/api/teacher/content?group=j_ch_jj")).json()) as TeacherContentView;
    expect(finalView.release.staleAudioCount).toBe(0);
  });

  it("makes the turns (또박또박) example one sentence at a time with the chosen style and lists it for review", async () => {
    const sample = fakeWavBase64();
    const bodies: unknown[] = [];
    const kit = await createTtsTestKit({
      fetcher: async (_url, init) => {
        bodies.push(JSON.parse(String(init?.body)));
        return interactionWavResponse(sample.base64);
      },
    });
    const view = (await (await kit.teacher.request("/api/teacher/content?group=j_ch_jj")).json()) as TeacherContentView;
    const moja = view.stages[0]!.items.find((row) => row.word === "모자")!;

    const res = await kit.sendJson(kit.teacher, "POST", `/api/teacher/content/items/${moja.id}/audio`, {
      kind: "sentence_turns",
      voice: "erinome",
      exampleIndex: 1,
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { asset: { id: string; audioId: string } };
    expect(body.asset.audioId).toBe("sentence-1871-모자--erinome--turns");
    expect(bodies[0]).toEqual(buildSingleTtsRequestBody({ text: moja.example, kind: "sentence_turns", voiceKey: "erinome" }));
    const stored = await kit.contentRepo.getAudioAsset(body.asset.id);
    expect(stored?.kind).toBe("sentence_turns");
    expect(stored?.stylePrompt).toBe(TURNS_READING_STYLE);

    const after = (await (await kit.teacher.request("/api/teacher/content?group=j_ch_jj")).json()) as TeacherContentView;
    const draft = after.stages[0]!.draftAudios.find((row) => row.assetId === body.asset.id);
    expect(draft?.kind).toBe("sentence_turns");
    expect(draft?.exampleIndex).toBe(1);
    expect(after.stages[0]!.items.find((row) => row.id === moja.id)!.turnsAudio?.erinome?.state).toBe("draft");

    await kit.sendJson(kit.teacher, "POST", `/api/teacher/content/audio/${body.asset.id}/approve`, {});
    const approved = (await (await kit.teacher.request("/api/teacher/content?group=j_ch_jj")).json()) as TeacherContentView;
    expect(approved.stages[0]!.items.find((row) => row.id === moja.id)!.turnsAudio?.erinome?.state).toBe("approved");
  });

  it("keeps replace marks on the server, clears one when its draft is made, and lets the draft be compared with the approved sound", async () => {
    const sample = fakeWavBase64();
    const kit = await createTtsTestKit({ fetcher: async () => interactionWavResponse(sample.base64) });
    const view = (await (await kit.teacher.request("/api/teacher/content?group=j_ch_jj")).json()) as TeacherContentView;
    const moja = view.stages[0]!.items.find((row) => row.word === "모자")!;
    expect(moja.wordAudio.erinome?.state).toBe("approved");
    const target = { itemId: moja.id, kind: "word", exampleIndex: 1, voiceKey: "erinome" };
    const listMarks = async () =>
      ((await (await kit.teacher.request("/api/teacher/content/replace-marks")).json()) as {
        marks: Array<{ itemId: string; word: string; kind: string; voiceName: string }>;
      }).marks;

    expect((await kit.sendJson(kit.teacher, "POST", "/api/teacher/content/replace-marks", target)).status).toBe(200);
    // 같은 칸을 두 번 표시해도 하나만 남는다.
    await kit.sendJson(kit.teacher, "POST", "/api/teacher/content/replace-marks", target);
    expect(await listMarks()).toEqual([{ ...target, word: "모자", voiceName: "Erinome" }]);
    expect((await kit.sendJson(kit.teacher, "POST", "/api/teacher/content/replace-marks", { ...target, voiceKey: "nobody" })).status).toBe(400);
    expect((await kit.anon.request("/api/teacher/content/replace-marks")).status).toBe(401);

    // 그 칸의 새 초안을 만들면 표시가 지워지고, 초안 줄에서 기존 승인본을 함께 들을 수 있다.
    const gen = await kit.sendJson(kit.teacher, "POST", `/api/teacher/content/items/${moja.id}/audio`, { kind: "word", voice: "erinome" });
    expect(gen.status).toBe(201);
    expect(await listMarks()).toEqual([]);
    const after = (await (await kit.teacher.request("/api/teacher/content?group=j_ch_jj")).json()) as TeacherContentView;
    const draft = after.stages[0]!.draftAudios.find((row) => row.audioId === "word-1871-모자--erinome");
    expect(draft?.previousPlayUrl).toBeTruthy();
    expect(draft?.previousPlayUrl).not.toBe(draft?.playUrl);

    // 하나 지우기, 모두 지우기
    const sentence = { itemId: moja.id, kind: "sentence_turns", exampleIndex: 1, voiceKey: "charon" };
    await kit.sendJson(kit.teacher, "POST", "/api/teacher/content/replace-marks", sentence);
    await kit.sendJson(kit.teacher, "POST", "/api/teacher/content/replace-marks/remove", sentence);
    expect(await listMarks()).toEqual([]);
    await kit.sendJson(kit.teacher, "POST", "/api/teacher/content/replace-marks", sentence);
    await kit.sendJson(kit.teacher, "POST", "/api/teacher/content/replace-marks", target);
    await kit.sendJson(kit.teacher, "POST", "/api/teacher/content/replace-marks/clear", {});
    expect(await listMarks()).toEqual([]);
  });

  it("enforces the 100/day quota before calling fetch and records failed attempts without leaking keys", async () => {
    let fetchCalls = 0;
    const kit = await createTtsTestKit({
      ttsApiKey: "secret-key-must-never-appear",
      fetcher: async () => {
        fetchCalls += 1;
        return new Response("upstream error", { status: 502 });
      },
    });

    const listView = (await (await kit.teacher.request("/api/teacher/content?group=j_ch_jj")).json()) as TeacherContentView;
    const moja = listView.stages[0]!.items.find((row) => row.word === "모자")!;

    // 1. 실패 응답 -> 사용량 1건 기록, 키 노출 없음
    const failRes = await kit.sendJson(kit.teacher, "POST", `/api/teacher/content/items/${moja.id}/audio`, {
      kind: "word",
      voice: "sulafat",
    });
    expect(failRes.status).toBe(502);
    const failText = await failRes.text();
    expect(failText).not.toContain("secret-key-must-never-appear");
    const quotaDay = ttsQuotaDay(kit.now());
    expect((await kit.contentRepo.ttsUsageSummary(quotaDay)).total).toBe(1);
    expect(fetchCalls).toBe(1);

    // 2. 예문 없는 단어의 예문 TTS -> 400 example_required (fetch/사용량 증가 없음)
    const noExItem = await kit.sendJson(kit.teacher, "POST", "/api/teacher/content/items", {
      groupId: "j_ch_jj",
      stage: "Stage 1-A",
      consonant: "ㅈ",
      word: "새단어",
    });
    const noExId = ((await noExItem.json()) as { item: { id: string } }).item.id;
    const emptyExRes = await kit.sendJson(kit.teacher, "POST", `/api/teacher/content/items/${noExId}/audio`, {
      kind: "sentence",
      voice: "erinome",
    });
    expect(emptyExRes.status).toBe(400);
    expect(((await emptyExRes.json()) as { error: string }).error).toBe("example_required");
    expect(fetchCalls).toBe(1);

    // 3. 하루 한도 100건 채우기 -> 409 daily_quota_exceeded, fetch 0회 추가 호출
    for (let i = 1; i < DAILY_TTS_LIMIT; i += 1) {
      await kit.contentRepo.recordTtsUsage({
        quotaDay,
        source: "pc_batch",
        voiceKey: "erinome",
        kind: "word",
        itemId: null,
        ok: true,
        errorCode: null,
      });
    }
    const overRes = await kit.sendJson(kit.teacher, "POST", `/api/teacher/content/items/${moja.id}/audio`, {
      kind: "word",
      voice: "sulafat",
    });
    expect(overRes.status).toBe(409);
    const overBody = (await overRes.json()) as { error: string; message: string };
    expect(overBody.error).toBe("daily_quota_exceeded");
    expect(overBody.message).toContain("오후 5시");
    expect(fetchCalls).toBe(1);
  });

  it("returns 503 tts_not_configured without touching quota or network when api key is missing", async () => {
    let fetchCalls = 0;
    const kit = await createTtsTestKit({
      ttsApiKey: null,
      fetcher: async () => {
        fetchCalls += 1;
        return new Response("unexpected", { status: 200 });
      },
    });
    const listView = (await (await kit.teacher.request("/api/teacher/content?group=j_ch_jj")).json()) as TeacherContentView;
    const moja = listView.stages[0]!.items[0]!;
    const res = await kit.sendJson(kit.teacher, "POST", `/api/teacher/content/items/${moja.id}/audio`, {
      kind: "word",
      voice: "charon",
    });
    expect(res.status).toBe(503);
    expect(((await res.json()) as { error: string }).error).toBe("tts_not_configured");
    expect(fetchCalls).toBe(0);
    expect((await kit.contentRepo.ttsUsageSummary(ttsQuotaDay(kit.now()))).total).toBe(0);
  });

  it("matches PC batch groupContents() request shape and records settings.method = per_content_single without real calls", async () => {
    const sample = fakeWavBase64();
    const sentBodies: unknown[] = [];
    const kit = await createTtsTestKit({
      fetcher: async (_url, init) => {
        sentBodies.push(JSON.parse(String(init?.body)));
        return interactionWavResponse(sample.base64);
      },
    });

    // 순수 함수 vs groupContents() 비교: 단어("<단어>." + FLAT_READING_STYLE, 앞뒤 '네.' 없음)
    const wordBodyFromSingle = buildSingleTtsRequestBody({ text: "모자", kind: "word", voiceKey: "charon" });
    const expectedWordBody = {
      model: FLASH_TTS_MODEL,
      input: [
        {
          type: "user_input",
          content: groupContents({
            groupId: "words-check",
            kind: "words",
            method: "per_content_group",
            style: FLAT_READING_STYLE,
            fillers: false,
            minGapMs: 300,
            items: [{ id: "word-1871-모자--charon", text: "모자", unitKind: "word" }],
          }),
        },
      ],
      response_format: { type: "audio" },
      generation_config: { speech_config: [{ voice: "Charon" }] },
    };
    expect(wordBodyFromSingle).toEqual(expectedWordBody);
    expect(wordBodyFromSingle.input[0].content).toEqual([
      {
        type: "text",
        text: "모자.",
        annotations: [{ type: "speech_metadata", style: FLAT_READING_STYLE }],
      },
    ]);

    // 순수 함수 vs groupContents() 비교: 예문(문장 그대로, 지시 없음, 앞뒤 '네.' 없음)
    const sentenceText = "모자를 쓰고 밖에 나갔어요.";
    const sentenceBodyFromSingle = buildSingleTtsRequestBody({ text: sentenceText, kind: "sentence", voiceKey: "erinome" });
    const expectedSentenceBody = {
      model: FLASH_TTS_MODEL,
      input: [
        {
          type: "user_input",
          content: groupContents({
            groupId: "turns-check",
            kind: "turns",
            method: "per_content_group",
            style: null,
            fillers: false,
            minGapMs: 600,
            items: [{ id: "sentence-1871-모자--erinome", text: sentenceText, unitKind: "sentence" }],
          }),
        },
      ],
      response_format: { type: "audio" },
      generation_config: { speech_config: [{ voice: "Erinome" }] },
    };
    expect(sentenceBodyFromSingle).toEqual(expectedSentenceBody);
    expect(sentenceBodyFromSingle.input[0].content).toEqual([{ type: "text", text: sentenceText }]);

    // 실제 POST /items/:id/audio 엔드포인트가 보내는 JSON과 DB settings.method 확인
    const listView = (await (await kit.teacher.request("/api/teacher/content?group=j_ch_jj")).json()) as TeacherContentView;
    const moja = listView.stages[0]!.items.find((row) => row.word === "모자")!;

    const wordRes = await kit.sendJson(kit.teacher, "POST", `/api/teacher/content/items/${moja.id}/audio`, {
      kind: "word",
      voice: "charon",
    });
    expect(wordRes.status).toBe(201);
    const wordBody = (await wordRes.json()) as {
      asset: { id: string; settings: { method: string; stylePrompt: string | null } };
    };
    expect(sentBodies[0]).toEqual(expectedWordBody);
    expect(wordBody.asset.settings.method).toBe(SINGLE_TTS_METHOD);
    expect(wordBody.asset.settings.stylePrompt).toBe(FLAT_READING_STYLE);
    expect((await kit.contentRepo.getAudioAsset(wordBody.asset.id))?.settings).toEqual({
      requestStyle: "interactions",
      method: "per_content_single",
      stylePrompt: FLAT_READING_STYLE,
    });

    const sentRes = await kit.sendJson(kit.teacher, "POST", `/api/teacher/content/items/${moja.id}/audio`, {
      kind: "sentence",
      voice: "erinome",
    });
    expect(sentRes.status).toBe(201);
    const sentResBody = (await sentRes.json()) as {
      asset: { id: string; settings: { method: string; stylePrompt: string | null } };
    };
    expect(sentBodies[1]).toEqual(
      buildSingleTtsRequestBody({ text: moja.example, kind: "sentence", voiceKey: "erinome" }),
    );
    expect(sentResBody.asset.settings).toEqual({
      requestStyle: "interactions",
      method: "per_content_single",
      stylePrompt: null,
    });

    // 로컬 audioStore는 sidecar .meta.json 에도 settings.method 를 남긴다.
    const tmpDir = mkdtempSync(join(tmpdir(), "haeon-tts-single-meta-"));
    try {
      const localStore = createLocalAudioStore(tmpDir);
      const saved = await localStore.putDraft("word-1871-모자--charon", "12345678-0000-4000-8000-000000000000", sample.bytes, {
        id: "word-1871-모자--charon",
        settings: { requestStyle: "interactions", method: SINGLE_TTS_METHOD, stylePrompt: FLAT_READING_STYLE },
      });
      const sidecar = JSON.parse(readFileSync(join(tmpDir, saved.objectKey.replace(/\.wav$/, ".meta.json")), "utf8")) as {
        settings: { method: string };
      };
      expect(sidecar.settings.method).toBe("per_content_single");
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
