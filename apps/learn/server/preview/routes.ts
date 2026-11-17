// 로컬 미리보기 API (/api/preview/*). 화면 미리보기(LEARN_SCREEN_PREVIEW)가 켜진 서버에서만 연다.
// 초대·기기 세션·교사 인증이 없는 검토용이다. 학습자는 고정된 '미리보기 학습자' 하나이며,
// 정오답은 서버가 문항 정의로 판단한다. 상태 변경 요청은 app.ts의 Origin·JSON 검사를 거친다.
import { randomUUID } from "node:crypto";
import { Hono, type Context } from "hono";
import { COURSE_ORDER_NOTE, COURSE_SOURCE, courseGroups, roadmapPriority } from "../../content/course.ts";
import {
  CONSONANTS,
  PRACTICE_GROUP_ID,
  PRACTICE_ITEMS,
  abxSyllable,
  choiceAudioId,
  isConsonant,
  judge,
  makeAbxTrial,
  planPracticeSession,
  practiceItem,
  practiceWords,
  type Consonant,
} from "../../content/practice.ts";
import { FLASH_TTS_MODEL, FLAT_READING_STYLE, VOICE_CANDIDATE } from "../../content/tts/pipeline.ts";
import {
  DEFAULT_PRACTICE_VOICE,
  PRACTICE_VOICES,
  isPracticeVoiceKey,
  voicedAudioId,
  type PracticeVoiceKey,
} from "../../content/practice-voices.ts";
import { stageZeroCells, syllableAudioBase } from "../../content/core-table.ts";
import { AUDITION_TEXT, AUDITION_VOICES, auditionAudioId, flatAuditionAudioId } from "../../content/voices.ts";
import type { PreviewAudio } from "./audio.ts";
import {
  CLIENT_EVENT_TYPES,
  type AbxAnswerResult,
  type AnswerResult,
  type CourseView,
  type ItemView,
  type LearnerSummary,
  type SessionView,
  type ListenView,
  type PreviewSettings,
  type VoicesView,
  type WordView,
} from "./contract.ts";
import { EXAMPLE_LEARNER, exampleDetail } from "./example.ts";
import { detail, summarize } from "./observe.ts";
import type { PreviewStore, StoredEvent } from "./store.ts";

export const PREVIEW_LEARNER_ID = "preview-learner";

const PREVIEW_LEARNER: Pick<LearnerSummary, "id" | "name" | "languages" | "kind"> = {
  id: PREVIEW_LEARNER_ID,
  name: "미리보기 학습자",
  languages: "언어 정보 없음",
  kind: "preview",
};

/** 미리보기에서 재생할 수 있는 모든 음원 id */
export function previewAudioIds(): string[] {
  const ids = new Set<string>();
  const bases = new Set<string>();
  for (const item of PRACTICE_ITEMS) bases.add(item.audioId);
  for (const cell of stageZeroCells()) bases.add(syllableAudioBase(cell.stimulus));
  for (const word of practiceWords()) {
    bases.add(word.wordAudioId);
    if (word.exampleAudioId) bases.add(word.exampleAudioId);
    ids.add(word.legacyWordAudioId);
    if (word.legacyExampleAudioId) ids.add(word.legacyExampleAudioId);
  }
  for (const base of bases) {
    ids.add(base);
    for (const voice of PRACTICE_VOICES) ids.add(voicedAudioId(base, voice.key));
  }
  for (const voice of AUDITION_VOICES) {
    ids.add(auditionAudioId(voice.voice));
    ids.add(flatAuditionAudioId(voice.voice));
  }
  return [...ids];
}

const EVENT_ID = /^[A-Za-z0-9-]{8,64}$/;

function isIsoTime(value: unknown): value is string {
  return typeof value === "string" && value.length <= 40 && Number.isFinite(Date.parse(value));
}

function cleanPayload(value: unknown): Record<string, string | number | boolean | null> | null {
  if (value === undefined) return {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length > 12) return null;
  const out: Record<string, string | number | boolean | null> = {};
  for (const [key, item] of entries) {
    if (!/^[A-Za-z][A-Za-z0-9_]{0,31}$/.test(key)) return null;
    if (item === null || typeof item === "boolean") out[key] = item;
    else if (typeof item === "number" && Number.isFinite(item)) out[key] = item;
    else if (typeof item === "string" && item.length <= 200) out[key] = item;
    else return null;
  }
  return out;
}

async function readJson(c: Context): Promise<Record<string, unknown> | null> {
  try {
    const body = (await c.req.json()) as unknown;
    return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function createPreviewRoutes(deps: { store: PreviewStore; audio: PreviewAudio; now?: () => Date }) {
  const { store, audio } = deps;
  const now = deps.now ?? (() => new Date());
  const app = new Hono();

  const learnerEvents = () => store.all().filter((event) => event.learnerId === PREVIEW_LEARNER_ID);
  const plans = () => learnerEvents().filter((event) => event.type === "session_planned");
  const planFor = (sessionId: string) => plans().find((event) => event.sessionId === sessionId);
  // 학습자가 고른 연습 목소리. 그 목소리 파일이 아직 없으면 예전 파일(Iapetus 초안)로 돌아간다.
  const practiceVoiceKey = (): PracticeVoiceKey => {
    const saved = store.getSetting("practiceVoiceKey");
    return isPracticeVoiceKey(saved) ? saved : DEFAULT_PRACTICE_VOICE;
  };
  const pick = (baseId: string, legacyId: string = baseId): string => {
    if (!baseId) return legacyId;
    const voiced = voicedAudioId(baseId, practiceVoiceKey());
    return audio.refFor(voiced) ? voiced : legacyId;
  };
  const refOf = (baseId: string, legacyId?: string): string | null => {
    const id = pick(baseId, legacyId);
    return id ? audio.refFor(id) : null;
  };
  const practiceVoice = () => audio.meta(pick(PRACTICE_ITEMS[0]?.audioId ?? ""))?.voice || VOICE_CANDIDATE;
  const settings = (): PreviewSettings => ({
    style: store.getSetting("style") === "proto" ? "proto" : "canvas",
    sound: store.getSetting("sound") === "browser" ? "browser" : "file",
  });

  const serverEvent = (
    type: string,
    sessionId: string | null,
    payload: Record<string, unknown>,
    options: { id?: string; seq?: number; clientTime?: string } = {},
  ): StoredEvent => ({
    id: options.id ?? randomUUID(),
    learnerId: PREVIEW_LEARNER_ID,
    sessionId,
    seq: options.seq ?? 0,
    type,
    clientTime: options.clientTime ?? now().toISOString(),
    receivedAt: now().toISOString(),
    payload,
  });

  const answerResult = (event: StoredEvent): AnswerResult => {
    const item = practiceItem(String(event.payload.itemId));
    const answerKey = String(event.payload.target);
    const chosenKey = String(event.payload.choice);
    const answer = item?.choices.find((choice) => choice.key === answerKey) ?? { key: answerKey, text: answerKey };
    const chosen = item?.choices.find((choice) => choice.key === chosenKey);
    return {
      itemId: String(event.payload.itemId),
      choice: chosenKey,
      correct: Boolean(event.payload.correct),
      answer,
      countsAsScore: Boolean(event.payload.countsAsScore),
      excludedReason: (event.payload.excludedReason as AnswerResult["excludedReason"]) ?? null,
      answerRef: refOf(choiceAudioId(answer.text)),
      choiceRef: chosen ? refOf(choiceAudioId(chosen.text)) : null,
    };
  };

  const sessionView = (plan: StoredEvent): SessionView => {
    const sessionId = plan.sessionId as string;
    const itemIds = (plan.payload.itemIds as string[]) ?? [];
    const kinds = (plan.payload.slotKinds as string[]) ?? [];
    const answers: AnswerResult[] = [];
    const seen = new Set<string>();
    for (const event of learnerEvents()) {
      if (event.type !== "answer_submitted" || event.sessionId !== sessionId) continue;
      const itemId = String(event.payload.itemId);
      if (seen.has(itemId)) continue;
      seen.add(itemId);
      answers.push(answerResult(event));
    }
    const ended = learnerEvents().some((event) => event.type === "session_end" && event.sessionId === sessionId);
    const skipped = [
      ...new Set(
        learnerEvents()
          .filter((event) => event.type === "item_skipped" && event.sessionId === sessionId)
          .map((event) => String(event.payload.itemId))
          .filter((itemId) => itemIds.includes(itemId) && !seen.has(itemId)),
      ),
    ];
    const items: ItemView[] = itemIds.flatMap((itemId, index) => {
      const item = practiceItem(itemId);
      if (!item) return [];
      return [
        {
          itemId,
          choices: item.choices,
          audioRef: refOf(item.audioId),
          speechText: settings().sound === "browser" ? item.stimulus : null,
          positionLabel: item.positionLabel,
          stage: item.stage,
          slotKind: kinds[index] ?? "common",
        },
      ];
    });
    return {
      sessionId,
      groupId: PRACTICE_GROUP_ID,
      groupLabel: "ㅈ · ㅊ · ㅉ",
      policyVersion: String(plan.payload.policyVersion),
      items,
      answers,
      skipped,
      finished: ended || answers.length + skipped.length >= items.length,
      voice: practiceVoice(),
      sound: settings().sound,
    };
  };

  app.get("/course", (c) => {
    const view: CourseView = {
      note: COURSE_ORDER_NOTE,
      sourceCommit: COURSE_SOURCE.commit,
      roadmapPriority: roadmapPriority(),
      groups: courseGroups().map((group) => ({
        id: group.id,
        order: group.order,
        label: group.label,
        choices: group.choices,
        category: group.category,
        pseudowords: group.pseudowords,
        status: group.status,
        stages: group.stages,
      })),
    };
    return c.json(view);
  });

  app.post("/sessions", (c) => {
    const sessionId = randomUUID();
    const plan = planPracticeSession(sessionId);
    const event = serverEvent("session_planned", sessionId, {
      groupId: PRACTICE_GROUP_ID,
      policyVersion: plan.policyVersion,
      itemIds: plan.slots.map((slot) => slot.itemId),
      slotKinds: plan.slots.map((slot) => slot.kind),
      slotReasons: plan.slots.map((slot) => slot.reason),
      voice: practiceVoice(),
    });
    store.append([event]);
    return c.json({ session: sessionView(event) }, 201);
  });

  app.get("/sessions/current", (c) => {
    const last = plans().at(-1);
    return c.json({ session: last ? sessionView(last) : null });
  });

  app.post("/answers", async (c) => {
    const body = await readJson(c);
    if (!body) return c.json({ error: "invalid_body" }, 400);
    const { eventId, sessionId, itemId, choice, seq, clientTime } = body;
    if (typeof eventId !== "string" || !EVENT_ID.test(eventId)) return c.json({ error: "invalid_event_id" }, 400);
    const existing = store.byId(eventId);
    if (existing) {
      if (existing.type !== "answer_submitted") return c.json({ error: "event_id_conflict" }, 409);
      return c.json({ result: answerResult(existing), duplicate: true });
    }
    if (typeof sessionId !== "string" || typeof itemId !== "string") return c.json({ error: "invalid_body" }, 400);
    const plan = planFor(sessionId);
    if (!plan) return c.json({ error: "unknown_session" }, 404);
    if (!((plan.payload.itemIds as string[]) ?? []).includes(itemId)) return c.json({ error: "item_not_in_session" }, 400);
    const item = practiceItem(itemId);
    if (!item || !isConsonant(choice)) return c.json({ error: "invalid_choice" }, 400);
    const audioState = body.audioState === "error" ? "error" : "ok";
    const answeredDuringPlayback = body.answeredDuringPlayback === true;
    const replays = Number(body.replaysBeforeAnswer);
    const wait = body.msFromStimulusEnd === null ? null : Number(body.msFromStimulusEnd);
    const attempt =
      learnerEvents().filter(
        (event) => event.type === "answer_submitted" && event.sessionId === sessionId && event.payload.itemId === itemId,
      ).length + 1;
    const excludedReason =
      attempt > 1
        ? "not_first_attempt"
        : audioState === "error"
          ? "audio_error"
          : answeredDuringPlayback
            ? "answered_during_playback"
            : null;
    const verdict = judge(item, choice);
    const event = serverEvent(
      "answer_submitted",
      sessionId,
      {
        itemId,
        task: item.task,
        stimulusLabel: item.stimulus,
        choice,
        target: item.target,
        correct: verdict.correct,
        attempt,
        replaysBeforeAnswer: Number.isFinite(replays) && replays >= 0 ? Math.floor(replays) : 0,
        msFromStimulusEnd: wait !== null && Number.isFinite(wait) ? Math.max(0, Math.round(wait)) : null,
        answeredDuringPlayback,
        audioState,
        countsAsScore: excludedReason === null,
        excludedReason,
        position: item.position,
        previousVowel: item.previousVowel,
        audioId: pick(item.audioId),
        voice: audio.meta(pick(item.audioId))?.voice ?? null,
        audioSource: body.audioSource === "browser" ? "browser" : "file",
        style: body.style === "canvas" ? "canvas" : "proto",
        policyVersion: plan.payload.policyVersion,
      },
      {
        id: eventId,
        seq: typeof seq === "number" && Number.isFinite(seq) ? seq : 0,
        clientTime: isIsoTime(clientTime) ? clientTime : undefined,
      },
    );
    store.append([event]);
    return c.json({ result: answerResult(event), duplicate: false });
  });

  app.post("/abx/trials", async (c) => {
    const body = await readJson(c);
    if (!body) return c.json({ error: "invalid_body" }, 400);
    const { sessionId, itemId, partner } = body;
    if (typeof sessionId !== "string" || typeof itemId !== "string") return c.json({ error: "invalid_body" }, 400);
    const plan = planFor(sessionId);
    const item = practiceItem(itemId);
    if (!plan || !item) return c.json({ error: "unknown_item" }, 404);
    const trial = makeAbxTrial(item, isConsonant(partner) ? partner : null, randomUUID().slice(0, 8));
    store.append([
      serverEvent("abx_trial", sessionId, { ...trial, audioA: trial.audio.a, audioB: trial.audio.b, audioX: trial.audio.x }, {
        id: trial.trialId,
      }),
    ]);
    return c.json({
      trial: {
        trialId: trial.trialId,
        itemId,
        refs: { a: refOf(trial.audio.a), b: refOf(trial.audio.b), x: refOf(trial.audio.x) },
        texts:
          settings().sound === "browser"
            ? {
                a: abxSyllable(trial.lead, trial.a),
                b: abxSyllable(trial.lead, trial.b),
                x: abxSyllable(trial.lead, trial.x === "A" ? trial.a : trial.b),
              }
            : null,
      },
    });
  });

  app.post("/abx/answers", async (c) => {
    const body = await readJson(c);
    if (!body) return c.json({ error: "invalid_body" }, 400);
    const { eventId, sessionId, trialId, choice, seq, clientTime } = body;
    if (typeof eventId !== "string" || !EVENT_ID.test(eventId)) return c.json({ error: "invalid_event_id" }, 400);
    if (typeof trialId !== "string" || (choice !== "A" && choice !== "B")) return c.json({ error: "invalid_body" }, 400);
    const trial = store.byId(trialId);
    if (!trial || trial.type !== "abx_trial") return c.json({ error: "unknown_trial" }, 404);
    const lead = String(trial.payload.lead);
    const a = trial.payload.a as Consonant;
    const b = trial.payload.b as Consonant;
    const xWas = trial.payload.x === "B" ? "B" : "A";
    const reply: AbxAnswerResult = {
      trialId,
      correct: choice === xWas,
      xWas,
      a: { key: a, text: abxSyllable(lead, a) },
      b: { key: b, text: abxSyllable(lead, b) },
    };
    const existing = store.byId(eventId);
    if (existing) return c.json({ result: reply, duplicate: true });
    const attempt =
      learnerEvents().filter((event) => event.type === "abx_answer" && event.payload.trialId === trialId).length + 1;
    const pair = [a, b].sort((x, y) => CONSONANTS.indexOf(x) - CONSONANTS.indexOf(y)).join("–");
    store.append([
      serverEvent(
        "abx_answer",
        typeof sessionId === "string" ? sessionId : (trial.sessionId ?? null),
        { trialId, itemId: trial.payload.itemId ?? null, choice, correct: reply.correct, attempt, pair, task: "abx" },
        {
          id: eventId,
          seq: typeof seq === "number" && Number.isFinite(seq) ? seq : 0,
          clientTime: isIsoTime(clientTime) ? clientTime : undefined,
        },
      ),
    ]);
    return c.json({ result: reply, duplicate: false });
  });

  app.post("/events", async (c) => {
    const body = await readJson(c);
    const list = body?.events;
    if (!Array.isArray(list) || list.length > 200) return c.json({ error: "invalid_body" }, 400);
    const accepted: StoredEvent[] = [];
    for (const raw of list) {
      if (!raw || typeof raw !== "object") return c.json({ error: "invalid_event" }, 400);
      const event = raw as Record<string, unknown>;
      const payload = cleanPayload(event.payload);
      if (
        typeof event.id !== "string" ||
        !EVENT_ID.test(event.id) ||
        !(CLIENT_EVENT_TYPES as readonly string[]).includes(String(event.type)) ||
        typeof event.seq !== "number" ||
        !isIsoTime(event.clientTime) ||
        (event.sessionId !== null && typeof event.sessionId !== "string") ||
        payload === null
      ) {
        return c.json({ error: "invalid_event" }, 400);
      }
      accepted.push({
        id: event.id,
        learnerId: PREVIEW_LEARNER_ID,
        sessionId: (event.sessionId as string | null) ?? null,
        seq: event.seq,
        type: String(event.type),
        clientTime: event.clientTime,
        receivedAt: now().toISOString(),
        payload,
      });
    }
    return c.json(store.append(accepted));
  });

  app.get("/settings", (c) => c.json(settings()));

  app.post("/settings", async (c) => {
    const body = await readJson(c);
    if (!body) return c.json({ error: "invalid_body" }, 400);
    if (body.style === "proto" || body.style === "canvas") store.setSetting("style", body.style);
    if (body.sound === "file" || body.sound === "browser") store.setSetting("sound", body.sound);
    return c.json(settings());
  });

  // 소리 익히기: 점수를 매기지 않는 자유 비교 듣기. 글자와 소리를 함께 보여 준다.
  app.get("/listen", (c) => {
    const leads = [...new Set(PRACTICE_ITEMS.map((item) => item.stimulus.slice(0, 1)))];
    const view: ListenView = {
      frames: leads.map((lead) => ({
        lead,
        sounds: CONSONANTS.map((key) => {
          const text = abxSyllable(lead, key);
          return { key, text, audioRef: refOf(choiceAudioId(text)) };
        }),
      })),
    };
    return c.json(view);
  });

  app.get("/words", (c) => {
    const words: WordView[] = practiceWords().map((word) => ({
      id: word.id,
      word: word.word,
      pos: word.pos,
      consonant: word.consonant,
      substage: word.substage,
      positionLabel: word.positionLabel,
      gloss: word.gloss,
      scene: word.scene,
      example: word.example,
      related: word.related,
      wordAudioRef: refOf(word.wordAudioId, word.legacyWordAudioId),
      exampleAudioRef: word.exampleAudioId ? refOf(word.exampleAudioId, word.legacyExampleAudioId) : null,
    }));
    return c.json({ words });
  });

  const voicesView = (): VoicesView => ({
    sampleText: AUDITION_TEXT,
    flatStyle: FLAT_READING_STYLE,
    model: FLASH_TTS_MODEL,
    practiceVoice: practiceVoice(),
    practiceVoiceKey: practiceVoiceKey(),
    practiceVoices: PRACTICE_VOICES.map((row) => ({
      key: row.key,
      voice: row.voice,
      label: row.label,
      note: row.note,
      // 이 목소리로 만든 연습 음원 수(의사단어 9개 기준)
      ready: PRACTICE_ITEMS.filter((item) => audio.refFor(voicedAudioId(item.audioId, row.key))).length,
      total: PRACTICE_ITEMS.length,
      sampleRef: audio.refFor(voicedAudioId(PRACTICE_ITEMS[0]?.audioId ?? "", row.key)),
    })),
    chosen: typeof store.getSetting("voiceChoice") === "string" ? (store.getSetting("voiceChoice") as string) : null,
    voices: AUDITION_VOICES.map((voice) => ({
      ...voice,
      audioRef: audio.refFor(auditionAudioId(voice.voice)),
      flatAudioRef: audio.refFor(flatAuditionAudioId(voice.voice)),
    })),
  });

  app.get("/voices", (c) => c.json(voicesView()));

  app.post("/practice-voice", async (c) => {
    const body = await readJson(c);
    const key = body?.key;
    if (!isPracticeVoiceKey(key)) return c.json({ error: "unknown_voice" }, 400);
    store.setSetting("practiceVoiceKey", key);
    store.append([serverEvent("practice_voice", null, { key })]);
    return c.json(voicesView());
  });

  app.post("/voice-choice", async (c) => {
    const body = await readJson(c);
    const voice = body?.voice;
    if (typeof voice !== "string" || !AUDITION_VOICES.some((row) => row.voice === voice)) {
      return c.json({ error: "unknown_voice" }, 400);
    }
    store.setSetting("voiceChoice", voice);
    store.append([serverEvent("voice_choice", null, { voice })]);
    return c.json(voicesView());
  });

  app.get("/audio/:ref", (c) => {
    const ref = c.req.param("ref");
    const bytes = /^[A-Za-z0-9-]{1,40}$/.test(ref) ? audio.read(ref) : null;
    if (!bytes || bytes.length === 0) return c.json({ error: "audio_not_ready", display: "아직 준비 중" }, 404);
    return c.body(bytes.slice().buffer, 200, { "content-type": "audio/wav" });
  });

  app.get("/teacher/learners", (c) => {
    const learners = [summarize(PREVIEW_LEARNER, learnerEvents()), EXAMPLE_LEARNER];
    return c.json({ learners });
  });

  app.get("/teacher/learners/:id", (c) => {
    const id = c.req.param("id");
    if (id === EXAMPLE_LEARNER.id) return c.json({ detail: exampleDetail() });
    if (id !== PREVIEW_LEARNER_ID) return c.json({ error: "not_found" }, 404);
    const events = learnerEvents();
    return c.json({ detail: detail(summarize(PREVIEW_LEARNER, events), events) });
  });

  app.post("/reset", (c) => {
    const keep = settings();
    const keepVoice = practiceVoiceKey();
    store.clear();
    store.setSetting("style", keep.style);
    store.setSetting("sound", keep.sound);
    store.setSetting("practiceVoiceKey", keepVoice);
    return c.json({ ok: true });
  });

  return app;
}
