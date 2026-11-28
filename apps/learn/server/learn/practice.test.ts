import { describe, expect, it } from "vitest";
import { PRACTICE_ITEMS, WORD_ITEMS, practiceItem } from "../../content/practice.ts";
import { createTestAccounts, type TestApp } from "../accounts/test-kit.ts";
import { createFixtureAudio } from "../preview/audio.ts";
import type { SessionView } from "../preview/contract.ts";
import { measure } from "../preview/observe.ts";
import type { StoredEvent } from "../preview/store.ts";

const ORIGIN = "http://127.0.0.1:4174";
const wav = new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4]);

async function setup(files?: Record<string, Uint8Array>) {
  const audio = createFixtureAudio(files ?? Object.fromEntries([...PRACTICE_ITEMS, ...WORD_ITEMS].map((item) => [item.audioId, wav])));
  const kit = await createTestAccounts({ audio });
  const learner = await kit.addConnectedLearner("알렉세이");
  const store = { all: () => kit.repo.events(learner.id) };
  return { app: learner.app, teacher: kit.teacher, learnerId: learner.id, store, audio, kit };
}

type App = TestApp;

function post(app: App, path: string, body: unknown, origin = ORIGIN) {
  return app.request(path, {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function newSession(app: App, itemKind: "word" | "pseudo" = "pseudo"): Promise<SessionView> {
  const response = await post(app, "/api/learn/sessions", { itemKind });
  expect(response.status).toBe(201);
  return ((await response.json()) as { session: SessionView }).session;
}

let counter = 0;
function answerBody(session: SessionView, itemId: string, choice: string, extra: Record<string, unknown> = {}) {
  counter += 1;
  return {
    eventId: `evt-${String(counter).padStart(4, "0")}-test`,
    sessionId: session.sessionId,
    itemId,
    choice,
    seq: counter,
    clientTime: new Date().toISOString(),
    replaysBeforeAnswer: 0,
    msFromStimulusEnd: 800,
    answeredDuringPlayback: false,
    audioState: "ok",
    ...extra,
  };
}

describe("preview API", () => {
  it("keeps the learning API closed for a device that is not connected", async () => {
    const { kit } = await setup();
    const stranger = kit.client(null);
    expect((await stranger.request("/api/learn/course")).status).toBe(401);
    expect((await post(stranger, "/api/learn/sessions", { itemKind: "pseudo" })).status).toBe(401);
    expect((await stranger.request("/api/me")).status).toBe(401);
    const health = (await (await stranger.request("/api/health")).json()) as { persistence: string; session: string };
    expect(health).toMatchObject({ persistence: "database", session: "device-cookie" });
  });
  it("plans a balanced session in shuffled order without exposing answers", async () => {
    const { app } = await setup();
    const session = await newSession(app);
    expect(session.items).toHaveLength(9);
    const targets = session.items.map((item) => practiceItem(item.itemId)?.target);
    for (const consonant of ["ㅈ", "ㅊ", "ㅉ"]) {
      expect(targets.filter((target) => target === consonant)).toHaveLength(3);
    }
    expect(session.policyVersion).toBe("balanced-v1");
    const text = JSON.stringify(session);
    expect(text).not.toMatch(/"target"|"answer"|pw-/);
    expect(session.items.every((item) => item.audioRef !== null)).toBe(true);
  });

  it("judges answers on the server and counts only the first attempt", async () => {
    const { app, store } = await setup();
    const session = await newSession(app);
    const first = session.items[0];
    if (!first) throw new Error("no item");
    const item = practiceItem(first.itemId);
    if (!item) throw new Error("unknown item");
    const wrong = item.choices.find((choice) => choice.key !== item.target)?.key ?? "";

    const body = answerBody(session, item.id, wrong, { replaysBeforeAnswer: 2 });
    const firstReply = (await (await post(app, "/api/learn/answers", body)).json()) as {
      result: { correct: boolean; countsAsScore: boolean; answer: { key: string }; answerRef: string | null };
      duplicate: boolean;
    };
    expect(firstReply.result.correct).toBe(false);
    expect(firstReply.result.countsAsScore).toBe(true);
    expect(firstReply.result.answer.key).toBe(item.target);
    expect(firstReply.result.answerRef).not.toBeNull();

    const replay = (await (await post(app, "/api/learn/answers", body)).json()) as { duplicate: boolean };
    expect(replay.duplicate).toBe(true);

    const retry = (await (await post(app, "/api/learn/answers", answerBody(session, item.id, item.target))).json()) as {
      result: { correct: boolean; countsAsScore: boolean; excludedReason: string | null };
    };
    expect(retry.result.correct).toBe(true);
    expect(retry.result.countsAsScore).toBe(false);
    expect(retry.result.excludedReason).toBe("not_first_attempt");

    expect((await store.all()).filter((event) => event.type === "answer_submitted")).toHaveLength(2);
    const current = (await (await app.request("/api/learn/sessions/current")).json()) as { session: SessionView };
    expect(current.session.answers).toHaveLength(1);
    expect(current.session.answers[0]?.choice).toBe(wrong);
  });

  it("keeps audio failures and answers during playback out of the score", async () => {
    const { app, teacher, learnerId } = await setup();
    const session = await newSession(app);
    const [a, b] = session.items;
    if (!a || !b) throw new Error("no items");
    const failed = (await (
      await post(app, "/api/learn/answers", answerBody(session, a.itemId, "ㅈ", { audioState: "error" }))
    ).json()) as { result: { countsAsScore: boolean; excludedReason: string } };
    expect(failed.result).toMatchObject({ countsAsScore: false, excludedReason: "audio_error" });
    const early = (await (
      await post(app, "/api/learn/answers", answerBody(session, b.itemId, "ㅊ", { answeredDuringPlayback: true }))
    ).json()) as { result: { countsAsScore: boolean; excludedReason: string } };
    expect(early.result).toMatchObject({ countsAsScore: false, excludedReason: "answered_during_playback" });

    const detail = (await (await teacher.request(`/api/teacher/learners/${learnerId}`)).json()) as {
      detail: { identify: { medial: { total: number; excluded: number } } };
    };
    expect(detail.detail.identify.medial.total).toBe(0);
    expect(detail.detail.identify.medial.excluded).toBe(2);
  });

  it("rejects foreign origins, unknown items, and invalid choices", async () => {
    const { app } = await setup();
    const session = await newSession(app);
    const first = session.items[0];
    if (!first) throw new Error("no item");
    expect((await post(app, "/api/learn/answers", answerBody(session, first.itemId, "ㅈ"), "https://evil.example")).status).toBe(403);
    expect((await post(app, "/api/learn/answers", answerBody(session, "jcj-s1-없음", "ㅈ"))).status).toBe(400);
    expect((await post(app, "/api/learn/answers", answerBody(session, first.itemId, "ㄱ"))).status).toBe(400);
    expect((await post(app, "/api/learn/answers", { ...answerBody(session, first.itemId, "ㅈ"), sessionId: "nope" })).status).toBe(404);
  });

  it("records ABX separately from consonant identification", async () => {
    const { app, teacher, learnerId } = await setup();
    const session = await newSession(app);
    const first = session.items[0];
    if (!first) throw new Error("no item");
    const item = practiceItem(first.itemId);
    if (!item) throw new Error("unknown item");
    const partner = item.choices.find((choice) => choice.key !== item.target)?.key ?? null;
    const trialReply = (await (
      await post(app, "/api/learn/abx/trials", { sessionId: session.sessionId, itemId: item.id, partner })
    ).json()) as { trial: { trialId: string; refs: { a: string | null; b: string | null; x: string | null } } };
    expect(trialReply.trial.refs.a).not.toBeNull();
    expect(trialReply.trial.refs.x).toBe(
      trialReply.trial.refs.x === trialReply.trial.refs.a ? trialReply.trial.refs.a : trialReply.trial.refs.b,
    );
    const correctSide = trialReply.trial.refs.x === trialReply.trial.refs.a ? "A" : "B";
    const answer = (await (
      await post(app, "/api/learn/abx/answers", {
        eventId: "abx-answer-0001",
        sessionId: session.sessionId,
        trialId: trialReply.trial.trialId,
        choice: correctSide,
        seq: 1,
        clientTime: new Date().toISOString(),
      })
    ).json()) as { result: { correct: boolean; a: { text: string }; b: { text: string } } };
    expect(answer.result.correct).toBe(true);
    expect([answer.result.a.text, answer.result.b.text]).toContain(item.stimulus);

    const detail = (await (await teacher.request(`/api/teacher/learners/${learnerId}`)).json()) as {
      detail: { abx: { trials: number; correct: number; pairs: Array<{ pair: string }> }; identify: { medial: { total: number } } };
    };
    expect(detail.detail.abx.trials).toBe(1);
    expect(detail.detail.abx.correct).toBe(1);
    expect(detail.detail.abx.pairs[0]?.pair).toMatch(/^[ㅈㅊㅉ]–[ㅈㅊㅉ]$/);
    expect(detail.detail.identify.medial.total).toBe(0);
  });

  it("validates client events and stores each event id once", async () => {
    const { app, store } = await setup();
    const event = {
      id: "event-0001-abcd",
      sessionId: null,
      seq: 1,
      type: "visibility_hidden",
      clientTime: new Date().toISOString(),
    };
    expect(await (await post(app, "/api/learn/events", { events: [event] })).json()).toEqual({ accepted: 1, duplicates: 0 });
    expect(await (await post(app, "/api/learn/events", { events: [event] })).json()).toEqual({ accepted: 0, duplicates: 1 });
    expect((await post(app, "/api/learn/events", { events: [{ ...event, id: "event-0002-abcd", type: "drop_table" }] })).status).toBe(400);
    expect(
      (await post(app, "/api/learn/events", { events: [{ ...event, id: "event-0003-abcd", payload: { nested: { a: 1 } } }] })).status,
    ).toBe(400);
    expect((await store.all())).toHaveLength(1);
  });

  it("shows the teacher only their own learners, with the connected learner's record", async () => {
    const { app, teacher, learnerId, kit } = await setup();
    const session = await newSession(app);
    for (const view of session.items.slice(0, 3)) {
      const item = practiceItem(view.itemId);
      if (!item) continue;
      await post(app, "/api/learn/answers", answerBody(session, item.id, item.target));
    }
    const list = (await (await teacher.request("/api/teacher/learners")).json()) as {
      learners: Array<{ id: string; nickname: string; devices: number; invite: { status: string }; summary: { days: number; kind: string } }>;
    };
    expect(list.learners.map((row) => row.nickname)).toEqual(["알렉세이"]);
    expect(list.learners[0]).toMatchObject({ devices: 1, invite: { status: "used" }, summary: { days: 1, kind: "learner" } });
    const detail = (await (await teacher.request(`/api/teacher/learners/${learnerId}`)).json()) as {
      detail: { identify: { medial: { correct: number; total: number } }; recent: { label: string } | null; isExample: boolean };
    };
    expect(detail.detail.identify.medial).toMatchObject({ correct: 3, total: 3 });
    expect(detail.detail.recent?.label).toContain("3/9");
    expect(detail.detail.isExample).toBe(false);

    const other = await kit.otherTeacher();
    expect((await other.request(`/api/teacher/learners/${learnerId}`)).status).toBe(404);
    const otherList = (await (await other.request("/api/teacher/learners")).json()) as { learners: unknown[] };
    expect(otherList.learners).toHaveLength(0);
    expect((await app.request("/api/teacher/learners")).status).toBe(401);
  });
  it("never sends the word with a word item, and has no browser speech setting", async () => {
    const { app } = await setup();
    const session = await newSession(app, "word");
    for (const item of session.items) {
      expect(item).not.toHaveProperty("speechText");
      expect(JSON.stringify(item)).not.toContain(practiceItem(item.itemId)?.stimulus ?? "?");
    }
    expect(session).not.toHaveProperty("sound");
    const saved = await post(app, "/api/me/settings", { sound: "browser" });
    expect(saved.status).toBe(400);
  });
  it("lists the three sounds for each lead vowel for free listening", async () => {
    const { app } = await setup();
    const listen = (await (await app.request("/api/learn/listen")).json()) as {
      frames: Array<{ lead: string; sounds: Array<{ key: string; text: string; audioRef: string | null }> }>;
    };
    expect(listen.frames.map((frame) => frame.lead)).toEqual(["아", "이", "오"]);
    for (const frame of listen.frames) {
      expect(frame.sounds.map((sound) => sound.key)).toEqual(["ㅈ", "ㅊ", "ㅉ"]);
      expect(frame.sounds.every((sound) => sound.text.startsWith(frame.lead))).toBe(true);
    }
  });

  it("plays the learner's chosen practice voice and falls back to the draft file when it is missing", async () => {
    const files: Record<string, Uint8Array> = Object.fromEntries(PRACTICE_ITEMS.map((item) => [item.audioId, wav]));
    files["pw-아자--erinome"] = wav;
    const { app, audio } = await setup(files);
    const before = await newSession(app, "pseudo");
    const legacyRef = before.items.find((item) => item.itemId === "jcj-s1-아자")?.audioRef;
    expect(legacyRef).toBe(audio.refFor("pw-아자"));

    expect((await post(app, "/api/me/settings", { practiceVoice: "kore" })).status).toBe(400);
    const chosen = (await (await post(app, "/api/me/settings", { practiceVoice: "erinome" })).json()) as {
      settings: { practiceVoice: string };
      practiceVoices: Array<{ key: string; ready: number; total: number }>;
    };
    expect(chosen.settings.practiceVoice).toBe("erinome");
    expect(chosen.practiceVoices.find((row) => row.key === "erinome")).toMatchObject({ ready: 1, total: 9 });

    const after = ((await (await app.request("/api/learn/sessions/current")).json()) as { session: SessionView }).session;
    expect(after.items.find((item) => item.itemId === "jcj-s1-아자")?.audioRef).toBe(audio.refFor("pw-아자--erinome"));
    expect(after.items.find((item) => item.itemId === "jcj-s1-아차")?.audioRef).toBe(audio.refFor("pw-아차"));
  });
  it("serves only known audio refs, and only to a connected learner or teacher", async () => {
    const { app, kit } = await setup();
    const session = await newSession(app);
    const ref = session.items[0]?.audioRef ?? "";
    const audio = await app.request(`/api/sound/${ref}`);
    expect(audio.status).toBe(200);
    expect(audio.headers.get("content-type")).toContain("audio/wav");
    expect((await app.request("/api/sound/..%2F..%2Fsecret")).status).toBe(404);
    expect((await app.request("/api/sound/unknown-ref")).status).toBe(404);
    expect((await kit.client(null).request(`/api/sound/${ref}`)).status).toBe(401);
  });
});

describe("time measures", () => {
  it("separates active, hidden, idle, and open time without adding overlaps", () => {
    const start = Date.parse("2026-11-17T01:00:00.000Z");
    const event = (seconds: number, type: string, payload: Record<string, unknown> = {}): StoredEvent => ({
      id: `${type}-${seconds}`,
      learnerId: "learner-1",
      sessionId: "s",
      seq: seconds,
      type,
      clientTime: new Date(start + seconds * 1000).toISOString(),
      receivedAt: new Date(start + seconds * 1000).toISOString(),
      payload,
    });
    const result = measure([
      event(0, "item_shown"),
      event(10, "audio_play_end", { playedMs: 1200 }),
      event(20, "visibility_hidden"),
      event(80, "visibility_visible"),
      event(140, "answer_submitted"),
      event(140 + 3600, "item_shown"),
    ]);
    expect(result.activeMs).toBe(50_000);
    expect(result.hiddenMs).toBe(60_000);
    expect(result.idleMs).toBe(30_000);
    expect(result.openMs).toBe(140_000);
    expect(result.audioMs).toBe(1200);
    expect(result.visits).toHaveLength(2);
  });
});

describe("word contrast items", () => {
  it("plans word items in step order with three of each consonant", async () => {
    const { app } = await setup();
    const session = await newSession(app, "word");
    expect(session.itemKind).toBe("word");
    expect(session.policyVersion).toBe("contrast-step-v1");
    expect(session.items).toHaveLength(9);
    const steps = session.items.map((item) => item.step ?? 0);
    expect(steps).toEqual([...steps].sort((a, b) => a - b));
    expect(steps[0]).toBe(1);
    const targets = session.items.map((item) => practiceItem(item.itemId)?.target);
    for (const consonant of ["ㅈ", "ㅊ", "ㅉ"]) expect(targets.filter((target) => target === consonant)).toHaveLength(3);
    for (const item of session.items) {
      expect(item.kind).toBe("word");
      expect(item.choices.map((choice) => choice.text)).toEqual(["", "", ""]);
      expect(JSON.stringify(item)).not.toContain(practiceItem(item.itemId)?.stimulus ?? "?");
    }
  });

  it("compares a wrong answer with the partner word and records the pair group", async () => {
    const { app, store } = await setup();
    const session = await newSession(app, "word");
    const target = session.items.find((item) => practiceItem(item.itemId)?.stimulus === "기차") ?? session.items[0];
    if (!target) throw new Error("no item");
    const item = practiceItem(target.itemId);
    if (!item) throw new Error("unknown item");
    const wrong = item.stimulus === "기차" ? "ㅈ" : (["ㅈ", "ㅊ", "ㅉ"].find((key) => key !== item.target) as string);
    const response = await post(app, "/api/learn/answers", answerBody(session, target.itemId, wrong));
    const { result } = (await response.json()) as { result: { answerText: string; choiceText: string; compareKind: string } };
    if (item.stimulus === "기차") {
      expect(result).toMatchObject({ answerText: "기차", choiceText: "기자", compareKind: "word" });
    } else {
      expect(["word", "pseudo"]).toContain(result.compareKind);
    }
    const recorded = (await store.all()).find((event) => event.type === "answer_submitted");
    expect(recorded?.payload).toMatchObject({ itemKind: "word", pairGroupId: item.pairGroupId, contrastTier: item.contrastTier });
  });

  it("builds ABX from partner words and plays the tense word first", async () => {
    const { app } = await setup();
    const session = await newSession(app, "word");
    const target = session.items.find((item) => practiceItem(item.itemId)?.stimulus === "가짜");
    if (!target) return;
    const trial = (await (await post(app, "/api/learn/abx/trials", { sessionId: session.sessionId, itemId: target.itemId, partner: "ㅈ" })).json()) as {
      trial: { trialId: string };
    };
    const answer = (await (
      await post(app, "/api/learn/abx/answers", {
        eventId: "evt-abx-word-0001",
        sessionId: session.sessionId,
        trialId: trial.trial.trialId,
        choice: "A",
        seq: 1,
        clientTime: new Date().toISOString(),
      })
    ).json()) as { result: { a: { key: string; text: string }; b: { key: string; text: string } } };
    expect(answer.result.a).toEqual({ key: "ㅉ", text: "가짜" });
    expect(answer.result.b).toEqual({ key: "ㅈ", text: "가장" });
  });
});
