import { describe, expect, it } from "vitest";
import { PRACTICE_ITEMS, practiceItem } from "../../content/practice.ts";
import { createLearnApp } from "../app.ts";
import type { LearnConfig } from "../config.ts";
import { createFixtureAudio } from "./audio.ts";
import type { SessionView } from "./contract.ts";
import { measure } from "./observe.ts";
import { createMemoryStore, type StoredEvent } from "./store.ts";

const ORIGIN = "http://127.0.0.1:4174";
const config: LearnConfig = { origin: ORIGIN, screenPreview: true, host: "127.0.0.1", port: 4174 };
const wav = new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4]);

function setup(overrides: Partial<LearnConfig> = {}) {
  const store = createMemoryStore();
  const audio = createFixtureAudio(Object.fromEntries(PRACTICE_ITEMS.map((item) => [item.audioId, wav])));
  const app = createLearnApp({ ...config, ...overrides }, {}, { store, audio });
  return { app, store };
}

type App = ReturnType<typeof setup>["app"];

function post(app: App, path: string, body: unknown, origin = ORIGIN) {
  return app.request(path, {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function newSession(app: App): Promise<SessionView> {
  const response = await post(app, "/api/preview/sessions", {});
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
  it("stays closed when the screen preview is off", async () => {
    const { app } = setup({ screenPreview: false });
    expect((await app.request("/api/preview/course")).status).toBe(404);
    expect((await post(app, "/api/preview/sessions", {})).status).toBe(404);
    const health = (await (await app.request("/api/health")).json()) as { persistence: string };
    expect(health.persistence).toBe("none");
  });

  it("plans a balanced session in shuffled order without exposing answers", async () => {
    const { app } = setup();
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
    const { app, store } = setup();
    const session = await newSession(app);
    const first = session.items[0];
    if (!first) throw new Error("no item");
    const item = practiceItem(first.itemId);
    if (!item) throw new Error("unknown item");
    const wrong = item.choices.find((choice) => choice.key !== item.target)?.key ?? "";

    const body = answerBody(session, item.id, wrong, { replaysBeforeAnswer: 2 });
    const firstReply = (await (await post(app, "/api/preview/answers", body)).json()) as {
      result: { correct: boolean; countsAsScore: boolean; answer: { key: string }; answerRef: string | null };
      duplicate: boolean;
    };
    expect(firstReply.result.correct).toBe(false);
    expect(firstReply.result.countsAsScore).toBe(true);
    expect(firstReply.result.answer.key).toBe(item.target);
    expect(firstReply.result.answerRef).not.toBeNull();

    const replay = (await (await post(app, "/api/preview/answers", body)).json()) as { duplicate: boolean };
    expect(replay.duplicate).toBe(true);

    const retry = (await (await post(app, "/api/preview/answers", answerBody(session, item.id, item.target))).json()) as {
      result: { correct: boolean; countsAsScore: boolean; excludedReason: string | null };
    };
    expect(retry.result.correct).toBe(true);
    expect(retry.result.countsAsScore).toBe(false);
    expect(retry.result.excludedReason).toBe("not_first_attempt");

    expect(store.all().filter((event) => event.type === "answer_submitted")).toHaveLength(2);
    const current = (await (await app.request("/api/preview/sessions/current")).json()) as { session: SessionView };
    expect(current.session.answers).toHaveLength(1);
    expect(current.session.answers[0]?.choice).toBe(wrong);
  });

  it("keeps audio failures and answers during playback out of the score", async () => {
    const { app } = setup();
    const session = await newSession(app);
    const [a, b] = session.items;
    if (!a || !b) throw new Error("no items");
    const failed = (await (
      await post(app, "/api/preview/answers", answerBody(session, a.itemId, "ㅈ", { audioState: "error" }))
    ).json()) as { result: { countsAsScore: boolean; excludedReason: string } };
    expect(failed.result).toMatchObject({ countsAsScore: false, excludedReason: "audio_error" });
    const early = (await (
      await post(app, "/api/preview/answers", answerBody(session, b.itemId, "ㅊ", { answeredDuringPlayback: true }))
    ).json()) as { result: { countsAsScore: boolean; excludedReason: string } };
    expect(early.result).toMatchObject({ countsAsScore: false, excludedReason: "answered_during_playback" });

    const detail = (await (await app.request("/api/preview/teacher/learners/preview-learner")).json()) as {
      detail: { identify: { medial: { total: number; excluded: number } } };
    };
    expect(detail.detail.identify.medial.total).toBe(0);
    expect(detail.detail.identify.medial.excluded).toBe(2);
  });

  it("rejects foreign origins, unknown items, and invalid choices", async () => {
    const { app } = setup();
    const session = await newSession(app);
    const first = session.items[0];
    if (!first) throw new Error("no item");
    expect((await post(app, "/api/preview/answers", answerBody(session, first.itemId, "ㅈ"), "https://evil.example")).status).toBe(403);
    expect((await post(app, "/api/preview/answers", answerBody(session, "jcj-s1-없음", "ㅈ"))).status).toBe(400);
    expect((await post(app, "/api/preview/answers", answerBody(session, first.itemId, "ㄱ"))).status).toBe(400);
    expect((await post(app, "/api/preview/answers", { ...answerBody(session, first.itemId, "ㅈ"), sessionId: "nope" })).status).toBe(404);
  });

  it("records ABX separately from consonant identification", async () => {
    const { app } = setup();
    const session = await newSession(app);
    const first = session.items[0];
    if (!first) throw new Error("no item");
    const item = practiceItem(first.itemId);
    if (!item) throw new Error("unknown item");
    const partner = item.choices.find((choice) => choice.key !== item.target)?.key ?? null;
    const trialReply = (await (
      await post(app, "/api/preview/abx/trials", { sessionId: session.sessionId, itemId: item.id, partner })
    ).json()) as { trial: { trialId: string; refs: { a: string | null; b: string | null; x: string | null } } };
    expect(trialReply.trial.refs.a).not.toBeNull();
    expect(trialReply.trial.refs.x).toBe(
      trialReply.trial.refs.x === trialReply.trial.refs.a ? trialReply.trial.refs.a : trialReply.trial.refs.b,
    );
    const correctSide = trialReply.trial.refs.x === trialReply.trial.refs.a ? "A" : "B";
    const answer = (await (
      await post(app, "/api/preview/abx/answers", {
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

    const detail = (await (await app.request("/api/preview/teacher/learners/preview-learner")).json()) as {
      detail: { abx: { trials: number; correct: number; pairs: Array<{ pair: string }> }; identify: { medial: { total: number } } };
    };
    expect(detail.detail.abx.trials).toBe(1);
    expect(detail.detail.abx.correct).toBe(1);
    expect(detail.detail.abx.pairs[0]?.pair).toMatch(/^[ㅈㅊㅉ]–[ㅈㅊㅉ]$/);
    expect(detail.detail.identify.medial.total).toBe(0);
  });

  it("validates client events and stores each event id once", async () => {
    const { app, store } = setup();
    const event = {
      id: "event-0001-abcd",
      sessionId: null,
      seq: 1,
      type: "visibility_hidden",
      clientTime: new Date().toISOString(),
    };
    expect(await (await post(app, "/api/preview/events", { events: [event] })).json()).toEqual({ accepted: 1, duplicates: 0 });
    expect(await (await post(app, "/api/preview/events", { events: [event] })).json()).toEqual({ accepted: 0, duplicates: 1 });
    expect((await post(app, "/api/preview/events", { events: [{ ...event, id: "event-0002-abcd", type: "drop_table" }] })).status).toBe(400);
    expect(
      (await post(app, "/api/preview/events", { events: [{ ...event, id: "event-0003-abcd", payload: { nested: { a: 1 } } }] })).status,
    ).toBe(400);
    expect(store.all()).toHaveLength(1);
  });

  it("shows the preview learner next to a labelled example learner", async () => {
    const { app } = setup();
    const session = await newSession(app);
    for (const view of session.items.slice(0, 3)) {
      const item = practiceItem(view.itemId);
      if (!item) continue;
      await post(app, "/api/preview/answers", answerBody(session, item.id, item.target));
    }
    const list = (await (await app.request("/api/preview/teacher/learners")).json()) as {
      learners: Array<{ id: string; kind: string; days: number }>;
    };
    expect(list.learners.map((learner) => learner.kind)).toEqual(["preview", "example"]);
    expect(list.learners[0]?.days).toBe(1);
    const detail = (await (await app.request("/api/preview/teacher/learners/preview-learner")).json()) as {
      detail: { identify: { medial: { correct: number; total: number } }; recent: { label: string } | null; isExample: boolean };
    };
    expect(detail.detail.identify.medial).toMatchObject({ correct: 3, total: 3 });
    expect(detail.detail.recent?.label).toContain("3/9");
    expect(detail.detail.isExample).toBe(false);
    expect((await app.request("/api/preview/teacher/learners/someone-else")).status).toBe(404);
  });

  it("keeps the stimulus text on the server unless browser speech is chosen", async () => {
    const { app } = setup();
    const fixed = await newSession(app);
    expect(fixed.sound).toBe("file");
    expect(fixed.items.every((item) => item.speechText === null)).toBe(true);

    const ignored = (await (await post(app, "/api/preview/settings", { sound: "radio" })).json()) as { sound: string };
    expect(ignored.sound).toBe("file");
    const saved = await post(app, "/api/preview/settings", { style: "canvas", sound: "browser" });
    expect(saved.status).toBe(200);
    const current = (await (await app.request("/api/preview/sessions/current")).json()) as { session: SessionView };
    expect(current.session.sound).toBe("browser");
    for (const item of current.session.items) {
      expect(item.speechText).toBe(practiceItem(item.itemId)?.stimulus);
    }

    await post(app, "/api/preview/reset", {});
    const settings = (await (await app.request("/api/preview/settings")).json()) as { style: string; sound: string };
    expect(settings).toMatchObject({ style: "canvas", sound: "browser" });
  });

  it("lists the three sounds for each lead vowel for free listening", async () => {
    const { app } = setup();
    const listen = (await (await app.request("/api/preview/listen")).json()) as {
      frames: Array<{ lead: string; sounds: Array<{ key: string; text: string; audioRef: string | null }> }>;
    };
    expect(listen.frames.map((frame) => frame.lead)).toEqual(["아", "이", "오"]);
    for (const frame of listen.frames) {
      expect(frame.sounds.map((sound) => sound.key)).toEqual(["ㅈ", "ㅊ", "ㅉ"]);
      expect(frame.sounds.every((sound) => sound.text.startsWith(frame.lead))).toBe(true);
    }
  });

  it("plays the chosen practice voice and falls back to the draft file when it is missing", async () => {
    const store = createMemoryStore();
    const files: Record<string, Uint8Array> = Object.fromEntries(PRACTICE_ITEMS.map((item) => [item.audioId, wav]));
    files["pw-아자--erinome"] = wav;
    const audio = createFixtureAudio(files);
    const app = createLearnApp(config, {}, { store, audio });
    const before = await newSession(app);
    const legacyRef = before.items.find((item) => item.itemId === "jcj-s1-아자")?.audioRef;
    expect(legacyRef).toBe(audio.refFor("pw-아자"));

    expect((await post(app, "/api/preview/practice-voice", { key: "kore" })).status).toBe(400);
    const chosen = (await (await post(app, "/api/preview/practice-voice", { key: "erinome" })).json()) as {
      practiceVoiceKey: string;
      practiceVoices: Array<{ key: string; ready: number; total: number }>;
    };
    expect(chosen.practiceVoiceKey).toBe("erinome");
    expect(chosen.practiceVoices.find((row) => row.key === "erinome")).toMatchObject({ ready: 1, total: 9 });

    const after = ((await (await app.request("/api/preview/sessions/current")).json()) as { session: SessionView }).session;
    expect(after.items.find((item) => item.itemId === "jcj-s1-아자")?.audioRef).toBe(audio.refFor("pw-아자--erinome"));
    expect(after.items.find((item) => item.itemId === "jcj-s1-아차")?.audioRef).toBe(audio.refFor("pw-아차"));
  });

  it("serves only known audio refs", async () => {
    const { app } = setup();
    const session = await newSession(app);
    const ref = session.items[0]?.audioRef ?? "";
    const audio = await app.request(`/api/preview/audio/${ref}`);
    expect(audio.status).toBe(200);
    expect(audio.headers.get("content-type")).toContain("audio/wav");
    expect((await app.request("/api/preview/audio/..%2F..%2Fsecret")).status).toBe(404);
    expect((await app.request("/api/preview/audio/unknown-ref")).status).toBe(404);
  });
});

describe("time measures", () => {
  it("separates active, hidden, idle, and open time without adding overlaps", () => {
    const start = Date.parse("2026-11-17T01:00:00.000Z");
    const event = (seconds: number, type: string, payload: Record<string, unknown> = {}): StoredEvent => ({
      id: `${type}-${seconds}`,
      learnerId: "preview-learner",
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
