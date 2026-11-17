// 미리보기 연습 상태. 라우트 위에 두어 비교 도움·사전 화면에 다녀와도 풀던 문항이 그대로 남는다.
// 새로고침하면 서버의 마지막 회기와 답을 다시 받아 이어 간다. 브라우저 저장소는 쓰지 않는다.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type {
  AbxAnswerResult,
  AbxTrialView,
  AnswerResult,
  SessionView,
} from "../../server/preview/contract.ts";
import { makeId, previewApi } from "./api";
import { currentPlayingRole, playRef, speakText, stopAudio, type PlayOutcome, type PlayRole } from "./audio";
import { usePreviewSettings } from "./settings";
import { flushEvents, nextSeq, setTelemetrySession, track, watchVisibility } from "./telemetry";

type Status = "idle" | "loading" | "ready" | "error";

type AbxState = {
  trial: AbxTrialView | null;
  heard: { a: boolean; b: boolean; x: boolean };
  result: AbxAnswerResult | null;
  done: number;
  correct: number;
  busy: boolean;
};

const emptyAbx: AbxState = {
  trial: null,
  heard: { a: false, b: false, x: false },
  result: null,
  done: 0,
  correct: 0,
  busy: false,
};

export type PracticeValue = {
  status: Status;
  session: SessionView | null;
  index: number;
  choices: Record<string, string>;
  results: Record<string, AnswerResult>;
  skipped: string[];
  plays: Record<string, number>;
  heard: Record<string, boolean>;
  audioFailed: Record<string, boolean>;
  submitting: boolean;
  playing: PlayRole | null;
  abx: AbxState;
  saved: string[];
  ensureSession: () => void;
  startNew: () => Promise<void>;
  playStimulus: () => Promise<void>;
  playRole: (ref: string | null, role: PlayRole, label?: string) => Promise<void>;
  /** 의사단어 한 개를 지금 소리 방식으로 들려준다(소리 익히기). */
  playSound: (ref: string | null, text: string, role: PlayRole) => Promise<void>;
  choose: (key: string) => void;
  /** 고른 답을 보낸다. key를 주면 고르면서 바로 보낸다(캔버스 스타일). */
  submit: (key?: string) => Promise<void>;
  skip: () => void;
  next: () => "next" | "finished";
  openCompare: () => Promise<void>;
  closeCompare: () => void;
  playAbx: (which: "a" | "b" | "x") => Promise<void>;
  answerAbx: (choice: "A" | "B") => Promise<void>;
  newAbx: () => Promise<void>;
  toggleWord: (id: string) => void;
};

const PracticeContext = createContext<PracticeValue | null>(null);

export function usePractice(): PracticeValue {
  const value = useContext(PracticeContext);
  if (!value) throw new Error("usePractice needs PracticeProvider");
  return value;
}

function firstOpenIndex(session: SessionView): number {
  const done = new Set([...session.answers.map((answer) => answer.itemId), ...session.skipped]);
  const index = session.items.findIndex((item) => !done.has(item.itemId));
  return index < 0 ? Math.max(0, session.items.length - 1) : index;
}

export function PracticeProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>("idle");
  const [session, setSession] = useState<SessionView | null>(null);
  const [index, setIndex] = useState(0);
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [results, setResults] = useState<Record<string, AnswerResult>>({});
  const [skipped, setSkipped] = useState<string[]>([]);
  const [plays, setPlays] = useState<Record<string, number>>({});
  const [heard, setHeard] = useState<Record<string, boolean>>({});
  const [audioFailed, setAudioFailed] = useState<Record<string, boolean>>({});
  const [submitting, setSubmitting] = useState(false);
  const [playing, setPlaying] = useState<PlayRole | null>(null);
  const [abx, setAbx] = useState<AbxState>(emptyAbx);
  const [saved, setSaved] = useState<string[]>([]);
  const stimulusEndedAt = useRef<Record<string, number>>({});
  const loading = useRef(false);
  const settings = usePreviewSettings();
  const useSpeech = settings.sound === "browser";

  // 의사단어는 소리 방식 설정을 따른다. 단어·예문·목소리 표본은 늘 고정 음원이다.
  const emit = useCallback(
    (ref: string | null, text: string | null | undefined, role: PlayRole, itemId?: string): Promise<PlayOutcome> =>
      useSpeech && text ? speakText(text, role, { itemId }) : playRef(ref, role, { itemId }),
    [useSpeech],
  );

  useEffect(() => watchVisibility(), []);

  useEffect(() => {
    const onHide = () => {
      void flushEvents(true);
    };
    window.addEventListener("pagehide", onHide);
    return () => window.removeEventListener("pagehide", onHide);
  }, []);

  const adopt = useCallback((next: SessionView) => {
    setSession(next);
    setTelemetrySession(next.sessionId);
    const answered: Record<string, AnswerResult> = {};
    const picked: Record<string, string> = {};
    for (const answer of next.answers) {
      answered[answer.itemId] = answer;
      picked[answer.itemId] = answer.choice;
    }
    setResults(answered);
    setChoices(picked);
    setSkipped(next.skipped);
    setPlays({});
    setHeard({});
    setAudioFailed({});
    stimulusEndedAt.current = {};
    setAbx(emptyAbx);
    const start = firstOpenIndex(next);
    setIndex(start);
    setStatus("ready");
    const item = next.items[start];
    if (item && !next.finished) track("item_shown", { itemId: item.itemId, index: start });
  }, []);

  const ensureSession = useCallback(() => {
    // 처음 한 번만 자동으로 불러온다. 실패하면 '다시 시도'를 누를 때까지 다시 부르지 않는다.
    if (loading.current || status !== "idle") return;
    loading.current = true;
    setStatus("loading");
    previewApi
      .currentSession()
      .then(async ({ session: current }) => {
        if (current) adopt(current);
        else adopt((await previewApi.newSession()).session);
      })
      .catch(() => setStatus("error"))
      .finally(() => {
        loading.current = false;
      });
  }, [adopt, status]);

  const startNew = useCallback(async () => {
    stopAudio();
    setStatus("loading");
    try {
      adopt((await previewApi.newSession()).session);
    } catch {
      setStatus("error");
    }
  }, [adopt]);

  const item = session?.items[index] ?? null;

  // 소리 방식을 바꾸면 서버가 주는 문항 모양(읽을 글자 포함 여부)이 달라지므로 회기를 다시 받는다.
  const sessionSound = session?.sound;
  useEffect(() => {
    if (!sessionSound || sessionSound === settings.sound) return;
    let cancelled = false;
    stopAudio();
    previewApi
      .saveSettings({ sound: settings.sound })
      .then(() => previewApi.currentSession())
      .then(({ session: current }) => {
        if (!cancelled && current) adopt(current);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [adopt, sessionSound, settings.sound]);

  const playRole = useCallback(
    async (ref: string | null, role: PlayRole, label?: string) => {
      setPlaying(role);
      const pseudo = role === "answer" || role === "chosen";
      await emit(ref, pseudo ? label : null, role, item?.itemId);
      setPlaying(currentPlayingRole());
    },
    [emit, item],
  );

  const playSound = useCallback(
    async (ref: string | null, text: string, role: PlayRole) => {
      setPlaying(role);
      await emit(ref, text, role);
      setPlaying(currentPlayingRole());
    },
    [emit],
  );

  const playStimulus = useCallback(async () => {
    if (!item) return;
    const itemId = item.itemId;
    setPlays((prev) => ({ ...prev, [itemId]: (prev[itemId] ?? 0) + 1 }));
    setPlaying("stimulus");
    const outcome = await emit(item.audioRef, item.speechText, "stimulus", itemId);
    setPlaying(currentPlayingRole());
    if (outcome.ok && outcome.completed) {
      stimulusEndedAt.current[itemId] = performance.now();
      setHeard((prev) => ({ ...prev, [itemId]: true }));
    } else if (!outcome.ok) {
      setAudioFailed((prev) => ({ ...prev, [itemId]: true }));
    }
  }, [emit, item]);

  const choose = useCallback(
    (key: string) => {
      if (!item || results[item.itemId]) return;
      setChoices((prev) => ({ ...prev, [item.itemId]: key }));
    },
    [item, results],
  );

  const submit = useCallback(async (key?: string) => {
    if (!session || !item || submitting || results[item.itemId]) return;
    const choice = typeof key === "string" ? key : choices[item.itemId];
    if (!choice) return;
    if (typeof key === "string") setChoices((prev) => ({ ...prev, [item.itemId]: key }));
    const itemId = item.itemId;
    const endedAt = stimulusEndedAt.current[itemId];
    setSubmitting(true);
    try {
      const { result } = await previewApi.answer({
        eventId: makeId(),
        sessionId: session.sessionId,
        itemId,
        choice,
        seq: nextSeq(),
        clientTime: new Date().toISOString(),
        replaysBeforeAnswer: Math.max(0, (plays[itemId] ?? 0) - 1),
        msFromStimulusEnd: endedAt === undefined ? null : Math.round(performance.now() - endedAt),
        answeredDuringPlayback: currentPlayingRole() === "stimulus",
        audioState: audioFailed[itemId] && !heard[itemId] ? "error" : "ok",
        audioSource: useSpeech ? "browser" : "file",
        style: settings.style,
      });
      setResults((prev) => ({ ...prev, [itemId]: result }));
    } catch {
      // 연결이 끊기면 버튼을 다시 눌러 보낼 수 있다. 같은 문항의 첫 응답은 서버가 한 번만 센다.
    } finally {
      setSubmitting(false);
    }
  }, [audioFailed, choices, heard, item, plays, results, session, settings.style, submitting, useSpeech]);

  const skip = useCallback(() => {
    if (!item || results[item.itemId]) return;
    track("item_skipped", { itemId: item.itemId, reason: audioFailed[item.itemId] ? "audio_error" : "skipped" });
    setSkipped((prev) => (prev.includes(item.itemId) ? prev : [...prev, item.itemId]));
  }, [audioFailed, item, results]);

  const next = useCallback((): "next" | "finished" => {
    if (!session) return "finished";
    stopAudio();
    const following = index + 1;
    if (following >= session.items.length) {
      track("session_end", { completed: true, answered: Object.keys(results).length, skipped: skipped.length });
      void flushEvents();
      setSession({ ...session, finished: true, answers: Object.values(results), skipped });
      return "finished";
    }
    setIndex(following);
    // 다음 문항에서는 비교를 새로 만들고, 이번 회기의 비교 횟수는 이어서 센다.
    setAbx((prev) => ({ ...emptyAbx, done: prev.done, correct: prev.correct }));
    const nextItem = session.items[following];
    if (nextItem) track("item_shown", { itemId: nextItem.itemId, index: following });
    return "next";
  }, [index, results, session, skipped]);

  const createTrial = useCallback(async () => {
    if (!session || !item) return;
    const result = results[item.itemId];
    const partner = result && !result.correct ? result.choice : null;
    setAbx((prev) => ({ ...prev, busy: true }));
    try {
      const { trial } = await previewApi.abxTrial(session.sessionId, item.itemId, partner);
      setAbx((prev) => ({ ...prev, trial, heard: { a: false, b: false, x: false }, result: null, busy: false }));
    } catch {
      setAbx((prev) => ({ ...prev, busy: false }));
    }
  }, [item, results, session]);

  const openCompare = useCallback(async () => {
    if (!item) return;
    track("compare_open", { itemId: item.itemId });
    if (!abx.trial || abx.trial.itemId !== item.itemId) await createTrial();
  }, [abx.trial, createTrial, item]);

  const closeCompare = useCallback(() => {
    stopAudio();
    if (item) track("compare_close", { itemId: item.itemId });
  }, [item]);

  const playAbx = useCallback(
    async (which: "a" | "b" | "x") => {
      const ref = abx.trial?.refs[which] ?? null;
      setPlaying(`abx_${which}`);
      const outcome = await emit(ref, abx.trial?.texts?.[which], `abx_${which}`, abx.trial?.itemId);
      setPlaying(currentPlayingRole());
      if (outcome.ok && outcome.completed) setAbx((prev) => ({ ...prev, heard: { ...prev.heard, [which]: true } }));
    },
    [abx.trial, emit],
  );

  const answerAbx = useCallback(
    async (choice: "A" | "B") => {
      if (!session || !abx.trial || abx.result || abx.busy) return;
      setAbx((prev) => ({ ...prev, busy: true }));
      try {
        const { result } = await previewApi.abxAnswer({
          eventId: makeId(),
          sessionId: session.sessionId,
          trialId: abx.trial.trialId,
          choice,
          seq: nextSeq(),
          clientTime: new Date().toISOString(),
        });
        setAbx((prev) => ({
          ...prev,
          result,
          busy: false,
          done: prev.done + 1,
          correct: prev.correct + (result.correct ? 1 : 0),
        }));
      } catch {
        setAbx((prev) => ({ ...prev, busy: false }));
      }
    },
    [abx.busy, abx.result, abx.trial, session],
  );

  const toggleWord = useCallback((id: string) => {
    setSaved((prev) => {
      const has = prev.includes(id);
      track(has ? "word_unsaved" : "word_saved", { wordId: id });
      return has ? prev.filter((value) => value !== id) : [...prev, id];
    });
  }, []);

  const value = useMemo<PracticeValue>(
    () => ({
      status,
      session,
      index,
      choices,
      results,
      skipped,
      plays,
      heard,
      audioFailed,
      submitting,
      playing,
      abx,
      saved,
      ensureSession,
      startNew,
      playStimulus,
      playRole,
      playSound,
      choose,
      submit,
      skip,
      next,
      openCompare,
      closeCompare,
      playAbx,
      answerAbx,
      newAbx: createTrial,
      toggleWord,
    }),
    [
      status,
      session,
      index,
      choices,
      results,
      skipped,
      plays,
      heard,
      audioFailed,
      submitting,
      playing,
      abx,
      saved,
      ensureSession,
      startNew,
      playStimulus,
      playRole,
      playSound,
      choose,
      submit,
      skip,
      next,
      openCompare,
      closeCompare,
      playAbx,
      answerAbx,
      createTrial,
      toggleWord,
    ],
  );

  return <PracticeContext.Provider value={value}>{children}</PracticeContext.Provider>;
}
