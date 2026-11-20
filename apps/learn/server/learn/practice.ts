// 학습자 연습 API (/api/learn/*). 앞단 미들웨어가 기기 세션 쿠키로 학습자를 정해 둔다.
// 화면이 보내는 learner id는 받지 않는다. 정오답은 서버가 문항 정의로 판단한다.
import { randomUUID } from "node:crypto";
import { Hono, type Context } from "hono";
import { COURSE_ORDER_NOTE, COURSE_SOURCE, courseGroups, roadmapPriority } from "../../content/course.ts";
import {
  CONSONANTS,
  PRACTICE_GROUP_ID,
  PRACTICE_ITEMS,
  abxSyllable,
  comparePair,
  choiceAudioId,
  isConsonant,
  judge,
  makeAbxTrial,
  planPracticeSession,
  practiceItem,
  practiceWords,
  type Consonant,
  type ItemKind,
} from "../../content/practice.ts";
import { STEP_LABELS } from "../../content/contrast.ts";
import { VOICE_CANDIDATE } from "../../content/tts/pipeline.ts";
import { turnsAudioId } from "../../content/tts/batch-plan.ts";
import { DEFAULT_PRACTICE_VOICE, PRACTICE_VOICES, isPracticeVoiceKey, voicedAudioId, type PracticeVoiceKey } from "../../content/practice-voices.ts";
import { snapshotFromReferenceJson, type ContentSnapshot } from "../../content/snapshot.ts";
import type { LearnerStore } from "../accounts/events.ts";
import type { LearnerRow } from "../accounts/repo.ts";
import type { PreviewAudio } from "../preview/audio.ts";
import {
  CLIENT_EVENT_TYPES,
  type AbxAnswerResult,
  type AnswerResult,
  type CourseView,
  type ItemView,
  type ListenView,
  type SessionView,
  type WordView,
} from "../preview/contract.ts";
import type { StoredEvent } from "../preview/store.ts";

export type LearnVars = { Variables: { learner: LearnerRow; store: LearnerStore } };

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

export async function readJson(c: Context): Promise<Record<string, unknown> | null> {
  try {
    const body = (await c.req.json()) as unknown;
    return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** ㅈ·ㅊ·ㅉ 연습 문항 가운데 들려줄 음원이 있는 것이 하나라도 있는가 */
export function practiceAudioReady(audio: PreviewAudio): boolean {
  return PRACTICE_ITEMS.some((item) =>
    [item.audioId, ...PRACTICE_VOICES.map((row) => voicedAudioId(item.audioId, row.key))].some((id) => audio.refFor(id)),
  );
}

/** 학습자가 고른 연습 목소리로 음원 id를 고른다. 파일이 없으면 예전 초안, 그다음 다른 목소리 순서로 찾는다. */
export function audioPicker(audio: PreviewAudio, voiceKey: string, exampleReading: string = "spoken") {
  const key: PracticeVoiceKey = isPracticeVoiceKey(voiceKey) ? voiceKey : DEFAULT_PRACTICE_VOICE;
  const pick = (baseId: string, legacyId: string = baseId): string => {
    if (!baseId) return legacyId;
    const voiced = voicedAudioId(baseId, key);
    if (audio.refFor(voiced)) return voiced;
    if (audio.refFor(legacyId)) return legacyId;
    return PRACTICE_VOICES.map((row) => voicedAudioId(baseId, row.key)).find((id) => audio.refFor(id)) ?? legacyId;
  };
  const refOf = (baseId: string, legacyId?: string): string | null => {
    const id = pick(baseId, legacyId);
    return id ? audio.refFor(id) : null;
  };
  // 예문: '또박또박'을 고르면 --turns 파일을 먼저 찾고, 없으면 '말하듯이' 파일로 들려준다.
  const exampleRefOf = (baseId: string, legacyId?: string): string | null => {
    if (exampleReading === "turns" && baseId) {
      const turns = audio.refFor(turnsAudioId(voicedAudioId(baseId, key)));
      if (turns) return turns;
    }
    return refOf(baseId, legacyId);
  };
  const voice = () => audio.meta(pick(PRACTICE_ITEMS[0]?.audioId ?? ""))?.voice || VOICE_CANDIDATE;
  return { pick, refOf, exampleRefOf, voice };
}

function scope(
  learner: LearnerRow,
  store: LearnerStore,
  audio: PreviewAudio,
  snapshot: ContentSnapshot,
  now: () => Date,
) {
  const { pick, refOf, exampleRefOf, voice } = audioPicker(audio, learner.practiceVoice, learner.exampleReading);
  const events = () => store.all();
  const plans = () => events().filter((event) => event.type === "session_planned");
  const planFor = (sessionId: string) => plans().find((event) => event.sessionId === sessionId);

  const serverEvent = (
    type: string,
    sessionId: string | null,
    payload: Record<string, unknown>,
    options: { id?: string; seq?: number; clientTime?: string } = {},
  ): StoredEvent => ({
    id: options.id ?? randomUUID(),
    learnerId: learner.id,
    sessionId,
    seq: options.seq ?? 0,
    type,
    clientTime: options.clientTime ?? now().toISOString(),
    receivedAt: now().toISOString(),
    payload,
  });

  const answerResult = (event: StoredEvent): AnswerResult => {
    const item = practiceItem(String(event.payload.itemId), snapshot);
    const answerKey = String(event.payload.target);
    const chosenKey = String(event.payload.choice);
    const answer = { key: answerKey, text: item?.stimulus ?? answerKey };
    const pair = item && isConsonant(chosenKey) ? comparePair(item, chosenKey, snapshot) : null;
    return {
      itemId: String(event.payload.itemId),
      choice: chosenKey,
      correct: Boolean(event.payload.correct),
      answer,
      countsAsScore: Boolean(event.payload.countsAsScore),
      excludedReason: (event.payload.excludedReason as AnswerResult["excludedReason"]) ?? null,
      answerRef: pair ? refOf(pair.answer.audioId, pair.answer.legacyAudioId) : null,
      choiceRef: pair ? refOf(pair.chosen.audioId, pair.chosen.legacyAudioId) : null,
      answerText: pair?.answer.text ?? answer.text,
      choiceText: pair?.chosen.text ?? chosenKey,
      compareKind: pair?.kind ?? "pseudo",
      compareTier: pair?.tier ?? null,
    };
  };

  const sessionView = (plan: StoredEvent): SessionView => {
    const sessionId = plan.sessionId as string;
    const itemIds = (plan.payload.itemIds as string[]) ?? [];
    const kinds = (plan.payload.slotKinds as string[]) ?? [];
    const all = events();
    const answers: AnswerResult[] = [];
    const seen = new Set<string>();
    for (const event of all) {
      if (event.type !== "answer_submitted" || event.sessionId !== sessionId) continue;
      const itemId = String(event.payload.itemId);
      if (seen.has(itemId)) continue;
      seen.add(itemId);
      answers.push(answerResult(event));
    }
    const ended = all.some((event) => event.type === "session_end" && event.sessionId === sessionId);
    const skipped = [
      ...new Set(
        all
          .filter((event) => event.type === "item_skipped" && event.sessionId === sessionId)
          .map((event) => String(event.payload.itemId))
          .filter((itemId) => itemIds.includes(itemId) && !seen.has(itemId)),
      ),
    ];
    const items: ItemView[] = itemIds.flatMap((itemId, index) => {
      const item = practiceItem(itemId, snapshot);
      if (!item) return [];
      return [
        {
          itemId,
          choices: item.choices,
          audioRef: refOf(item.audioId, item.legacyAudioId),
          positionLabel: item.positionLabel,
          stage: item.stage,
          slotKind: kinds[index] ?? "common",
          kind: item.kind,
          step: item.step,
          stepLabel: item.step ? STEP_LABELS[item.step] : null,
          syllableIndex: item.syllableIndex,
          vowel: item.vowel,
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
      voice: voice(),
      itemKind: plan.payload.itemKind === "word" ? "word" : "pseudo",
    };
  };

  return { pick, refOf, exampleRefOf, voice, events, plans, planFor, serverEvent, answerResult, sessionView };
}

export function createPracticeRoutes(deps: {
  audio: PreviewAudio;
  resolveContent?: () => Promise<{ snapshot: ContentSnapshot; audio: PreviewAudio }>;
  now?: () => Date;
}) {
  const { audio } = deps;
  const now = deps.now ?? (() => new Date());
  const resolve =
    deps.resolveContent ?? (async () => ({ snapshot: snapshotFromReferenceJson(), audio }));
  const app = new Hono<LearnVars>();
  const use = async (c: Context<LearnVars>) => {
    const resolved = await resolve();
    return {
      ...scope(c.get("learner"), c.get("store"), resolved.audio, resolved.snapshot, now),
      snapshot: resolved.snapshot,
      audio: resolved.audio,
      store: c.get("store"),
    };
  };

  app.get("/course", async (c) => {
    const s = await use(c);
    const view: CourseView = {
      note: COURSE_ORDER_NOTE,
      sourceCommit: COURSE_SOURCE.commit,
      roadmapPriority: roadmapPriority(),
      groups: courseGroups(s.snapshot).map((group) => ({
        id: group.id,
        order: group.order,
        label: group.label,
        choices: group.choices,
        category: group.category,
        pseudowords: group.pseudowords,
        // 연습 문항이 코드에 있고, 그 묶음의 연습 음원이 하나 이상 올라와 있을 때만 연습을 연다.
        status: group.status === "practice" && practiceAudioReady(s.audio) ? "practice" : "planned",
        stages: group.stages,
      })),
    };
    return c.json(view);
  });

  app.post("/sessions", async (c) => {
    const s = await use(c);
    const body = (await readJson(c)) ?? {};
    const itemKind: ItemKind =
      body.itemKind === "word" || body.itemKind === "pseudo" ? body.itemKind : c.get("learner").itemKind;
    const sessionId = randomUUID();
    const plan = planPracticeSession(sessionId, itemKind, s.snapshot);
    const event = s.serverEvent("session_planned", sessionId, {
      groupId: PRACTICE_GROUP_ID,
      itemKind,
      policyVersion: plan.policyVersion,
      itemIds: plan.slots.map((slot) => slot.itemId),
      slotKinds: plan.slots.map((slot) => slot.kind),
      slotReasons: plan.slots.map((slot) => slot.reason),
      voice: s.voice(),
    });
    await s.store.append([event]);
    return c.json({ session: s.sessionView(event) }, 201);
  });

  app.get("/sessions/current", async (c) => {
    const s = await use(c);
    const last = s.plans().at(-1);
    return c.json({ session: last ? s.sessionView(last) : null });
  });

  app.post("/answers", async (c) => {
    const s = await use(c);
    const body = await readJson(c);
    if (!body) return c.json({ error: "invalid_body" }, 400);
    const { eventId, sessionId, itemId, choice, seq, clientTime } = body;
    if (typeof eventId !== "string" || !EVENT_ID.test(eventId)) return c.json({ error: "invalid_event_id" }, 400);
    const existing = s.store.byId(eventId);
    if (existing) {
      if (existing.type !== "answer_submitted") return c.json({ error: "event_id_conflict" }, 409);
      return c.json({ result: s.answerResult(existing), duplicate: true });
    }
    if (typeof sessionId !== "string" || typeof itemId !== "string") return c.json({ error: "invalid_body" }, 400);
    const plan = s.planFor(sessionId);
    if (!plan) return c.json({ error: "unknown_session" }, 404);
    if (!((plan.payload.itemIds as string[]) ?? []).includes(itemId)) return c.json({ error: "item_not_in_session" }, 400);
    const item = practiceItem(itemId, s.snapshot);
    if (!item || !isConsonant(choice)) return c.json({ error: "invalid_choice" }, 400);
    const audioState = body.audioState === "error" ? "error" : "ok";
    const answeredDuringPlayback = body.answeredDuringPlayback === true;
    const replays = Number(body.replaysBeforeAnswer);
    const wait = body.msFromStimulusEnd === null ? null : Number(body.msFromStimulusEnd);
    const attempt =
      s.events().filter(
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
    const audioId = s.pick(item.audioId, item.legacyAudioId);
    const event = s.serverEvent(
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
        pairGroupId: item.pairGroupId,
        contrastTier: item.contrastTier,
        itemKind: item.kind,
        step: item.step,
        syllableIndex: item.syllableIndex,
        audioId,
        voice: s.audio.meta(audioId)?.voice ?? null,
        audioSource: "file",
        style: body.style === "proto" ? "proto" : "canvas",
        policyVersion: plan.payload.policyVersion,
      },
      {
        id: eventId,
        seq: typeof seq === "number" && Number.isFinite(seq) ? seq : 0,
        clientTime: isIsoTime(clientTime) ? clientTime : undefined,
      },
    );
    const saved = await s.store.append([event]);
    if (saved.accepted === 0) {
      const again = s.store.byId(eventId);
      if (again?.type === "answer_submitted") return c.json({ result: s.answerResult(again), duplicate: true });
    }
    return c.json({ result: s.answerResult(event), duplicate: false });
  });

  app.post("/abx/trials", async (c) => {
    const s = await use(c);
    const body = await readJson(c);
    if (!body) return c.json({ error: "invalid_body" }, 400);
    const { sessionId, itemId, partner } = body;
    if (typeof sessionId !== "string" || typeof itemId !== "string") return c.json({ error: "invalid_body" }, 400);
    const plan = s.planFor(sessionId);
    const item = practiceItem(itemId, s.snapshot);
    if (!plan || !item) return c.json({ error: "unknown_item" }, 404);
    const trial = makeAbxTrial(item, isConsonant(partner) ? partner : null, randomUUID().slice(0, 8), s.snapshot);
    await s.store.append([
      s.serverEvent(
        "abx_trial",
        sessionId,
        {
          ...trial,
          audioA: s.pick(trial.audio.a, trial.legacy.a),
          audioB: s.pick(trial.audio.b, trial.legacy.b),
          audioX: s.pick(trial.audio.x, trial.legacy.x),
          textA: trial.texts.a,
          textB: trial.texts.b,
        },
        { id: trial.trialId },
      ),
    ]);
    return c.json({
      trial: {
        trialId: trial.trialId,
        itemId,
        refs: {
          a: s.refOf(trial.audio.a, trial.legacy.a),
          b: s.refOf(trial.audio.b, trial.legacy.b),
          x: s.refOf(trial.audio.x, trial.legacy.x),
        },
      },
    });
  });

  app.post("/abx/answers", async (c) => {
    const s = await use(c);
    const body = await readJson(c);
    if (!body) return c.json({ error: "invalid_body" }, 400);
    const { eventId, sessionId, trialId, choice, seq, clientTime } = body;
    if (typeof eventId !== "string" || !EVENT_ID.test(eventId)) return c.json({ error: "invalid_event_id" }, 400);
    if (typeof trialId !== "string" || (choice !== "A" && choice !== "B")) return c.json({ error: "invalid_body" }, 400);
    const trial = s.store.byId(trialId);
    if (!trial || trial.type !== "abx_trial") return c.json({ error: "unknown_trial" }, 404);
    const lead = String(trial.payload.lead);
    const a = trial.payload.a as Consonant;
    const b = trial.payload.b as Consonant;
    const xWas = trial.payload.x === "B" ? "B" : "A";
    const reply: AbxAnswerResult = {
      trialId,
      correct: choice === xWas,
      xWas,
      a: { key: a, text: typeof trial.payload.textA === "string" ? trial.payload.textA : abxSyllable(lead, a) },
      b: { key: b, text: typeof trial.payload.textB === "string" ? trial.payload.textB : abxSyllable(lead, b) },
    };
    if (s.store.byId(eventId)) return c.json({ result: reply, duplicate: true });
    const attempt = s.events().filter((event) => event.type === "abx_answer" && event.payload.trialId === trialId).length + 1;
    const pair = [a, b].sort((x, y) => CONSONANTS.indexOf(x) - CONSONANTS.indexOf(y)).join("–");
    await s.store.append([
      s.serverEvent(
        "abx_answer",
        typeof sessionId === "string" ? sessionId : (trial.sessionId ?? null),
        {
          trialId,
          itemId: trial.payload.itemId ?? null,
          choice,
          correct: reply.correct,
          attempt,
          pair,
          task: "abx",
          compareKind: trial.payload.kind ?? null,
          contrastTier: trial.payload.tier ?? null,
          pairGroupId: trial.payload.pairGroupId ?? null,
        },
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
    const s = await use(c);
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
        learnerId: c.get("learner").id,
        sessionId: (event.sessionId as string | null) ?? null,
        seq: event.seq,
        type: String(event.type),
        clientTime: event.clientTime,
        receivedAt: now().toISOString(),
        payload,
      });
    }
    return c.json(await s.store.append(accepted));
  });

  // 소리 익히기: 점수를 매기지 않는 자유 비교 듣기.
  app.get("/listen", async (c) => {
    const s = await use(c);
    const leads = [...new Set(PRACTICE_ITEMS.map((item) => item.stimulus.slice(0, 1)))];
    const view: ListenView = {
      frames: leads.map((lead) => ({
        lead,
        sounds: CONSONANTS.map((key) => {
          const text = abxSyllable(lead, key);
          return { key, text, audioRef: s.refOf(choiceAudioId(text)) };
        }),
      })),
    };
    return c.json(view);
  });

  app.get("/words", async (c) => {
    const s = await use(c);
    const cards = practiceWords(s.snapshot);
    const words: WordView[] = cards.map((word) => ({
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
      wordAudioRef: s.refOf(word.wordAudioId, word.legacyWordAudioId),
      exampleAudioRef: word.exampleAudioId ? s.exampleRefOf(word.exampleAudioId, word.legacyExampleAudioId) : null,
      wordVoice: s.audio.meta(s.pick(word.wordAudioId, word.legacyWordAudioId))?.voice ?? null,
      exampleVoice: word.exampleAudioId ? (s.audio.meta(s.pick(word.exampleAudioId, word.legacyExampleAudioId))?.voice ?? null) : null,
      step: word.step,
      stepLabel: STEP_LABELS[word.step],
      pairGroupId: word.contrast?.pairGroupId ?? null,
      contrastTier: word.contrast?.tier ?? null,
      partners: (word.contrast?.partners ?? []).map((partner) => {
        const card = cards.find((row) => row.word === partner.word && row.consonant === partner.consonant);
        return { ...partner, audioRef: card ? s.refOf(card.wordAudioId, card.legacyWordAudioId) : null };
      }),
    }));
    return c.json({ words });
  });

  return app;
}

/** 음원 응답. 연결된 학습자나 교사만 받는다(앞단에서 확인). */
export async function serveAudio(audio: PreviewAudio, ref: string) {
  const body = /^[A-Za-z0-9-]{1,40}$/.test(ref) ? await audio.read(ref) : null;
  return body && body.bytes.length > 0 ? body : null;
}
