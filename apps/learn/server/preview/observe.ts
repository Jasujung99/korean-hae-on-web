// 미리보기 기록을 교사 관찰 화면용으로 묶는다.
// 시간 정의(화면에도 적는다):
// - 활동 시간: 화면이 보이고 이벤트 사이 간격이 30초 이하인 구간의 합. 30초를 넘는 간격은 30초까지만 넣고 나머지는 무응답.
// - 전체 경과: 한 번 접속(30분 넘게 끊기지 않은 이벤트 묶음)의 처음부터 끝까지.
// - 화면 이탈: 화면 숨김부터 다시 보일 때까지. 활동 시간에서 뺀다.
// - 음원 재생: 실제로 재생된 길이의 합. 활동 시간과 겹칠 수 있어 더하지 않는다.
import type { DwellRow, LearnerDetail, LearnerSummary, Matrix } from "./contract.ts";
import type { StoredEvent } from "./store.ts";

export const IDLE_MS = 30_000;
export const VISIT_GAP_MS = 30 * 60_000;
const CONSONANTS = ["ㅈ", "ㅊ", "ㅉ"];
const TIME_ZONE = "Asia/Seoul";

const at = (event: StoredEvent) => Date.parse(event.clientTime);

export function sortEvents(events: StoredEvent[]): StoredEvent[] {
  return [...events].sort((a, b) => at(a) - at(b) || a.seq - b.seq);
}

function dateKey(ms: number): string {
  return new Date(ms).toLocaleDateString("sv-SE", { timeZone: TIME_ZONE });
}

export function measure(events: StoredEvent[]) {
  const sorted = sortEvents(events);
  let activeMs = 0;
  let hiddenMs = 0;
  let idleMs = 0;
  let openMs = 0;
  let visitStart = sorted[0] ? at(sorted[0]) : 0;
  let hidden = false;
  const visits: Array<{ start: number; end: number; first: StoredEvent; last: StoredEvent }> = [];
  let visitFirst = sorted[0];

  for (let index = 0; index < sorted.length; index += 1) {
    const event = sorted[index] as StoredEvent;
    hidden = event.type === "visibility_hidden";
    const next = sorted[index + 1];
    if (!next) {
      openMs += at(event) - visitStart;
      if (visitFirst) visits.push({ start: visitStart, end: at(event), first: visitFirst, last: event });
      break;
    }
    const gap = Math.max(0, at(next) - at(event));
    if (gap > VISIT_GAP_MS) {
      openMs += at(event) - visitStart;
      if (visitFirst) visits.push({ start: visitStart, end: at(event), first: visitFirst, last: event });
      visitStart = at(next);
      visitFirst = next;
      continue;
    }
    if (hidden) hiddenMs += gap;
    else if (gap <= IDLE_MS) activeMs += gap;
    else {
      activeMs += IDLE_MS;
      idleMs += gap - IDLE_MS;
    }
  }

  const audioMs = sorted
    .filter((event) => event.type === "audio_play_end")
    .reduce((sum, event) => sum + Math.max(0, Number(event.payload.playedMs) || 0), 0);

  return { activeMs, hiddenMs, idleMs, openMs, audioMs, visits };
}

function emptyMatrix(): Matrix {
  return { consonants: CONSONANTS, rows: CONSONANTS.map(() => CONSONANTS.map(() => 0)), correct: 0, total: 0, excluded: 0 };
}

function firstAnswers(events: StoredEvent[]): StoredEvent[] {
  const seen = new Set<string>();
  const out: StoredEvent[] = [];
  for (const event of sortEvents(events)) {
    if (event.type !== "answer_submitted") continue;
    const key = `${event.sessionId}:${String(event.payload.itemId)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(event);
  }
  return out;
}

function addToMatrix(matrix: Matrix, event: StoredEvent) {
  if (!event.payload.countsAsScore) {
    matrix.excluded += 1;
    return;
  }
  const row = CONSONANTS.indexOf(String(event.payload.target));
  const col = CONSONANTS.indexOf(String(event.payload.choice));
  if (row < 0 || col < 0) return;
  const cells = matrix.rows[row] as number[];
  cells[col] = (cells[col] ?? 0) + 1;
  matrix.total += 1;
  if (row === col) matrix.correct += 1;
}

const VOWEL_GROUPS: Record<string, string[]> = {
  "i-u": ["ㅣ", "ㅜ", "ㅡ"],
  "a-eo-o": ["ㅏ", "ㅓ", "ㅗ"],
};

function parts(ms: number): Record<string, string> {
  const out: Record<string, string> = {};
  const format = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  for (const part of format.formatToParts(new Date(ms))) out[part.type] = part.value;
  return out;
}

function shortDate(ms: number): string {
  const p = parts(ms);
  return `${p.month}/${p.day}`;
}

function formatClock(ms: number): string {
  const p = parts(ms);
  return `${p.month}/${p.day} ${p.hour}:${p.minute}`;
}

type LearnerBase = Pick<LearnerSummary, "id" | "name" | "languages" | "kind">;
type Cell = { from: string; to: string; count: number };

function worstCell(matrix: Matrix): Cell | null {
  const cells: Cell[] = [];
  matrix.rows.forEach((row, presented) =>
    row.forEach((count, chosen) => {
      if (presented !== chosen && count > 0) {
        cells.push({ from: CONSONANTS[presented] ?? "", to: CONSONANTS[chosen] ?? "", count });
      }
    }),
  );
  cells.sort((a, b) => b.count - a.count);
  return cells[0] ?? null;
}

function koreanDate(key: string): string {
  const [, month, day] = key.split("-");
  return `${Number(month)}월 ${Number(day)}일`;
}

/** 오늘이 든 주의 일요일에서 끝나는, 월요일부터 시작하는 4주. */
export function calendarKeys(now: number): Array<{ date: string; future: boolean }> {
  const today = dateKey(now);
  const base = Date.parse(`${today}T00:00:00Z`);
  const weekday = (new Date(base).getUTCDay() + 6) % 7;
  const monday = base - (weekday + 21) * 86_400_000;
  return Array.from({ length: 28 }, (_, index) => {
    const date = new Date(monday + index * 86_400_000).toISOString().slice(0, 10);
    return { date, future: date > today };
  });
}

export function summarize(learner: LearnerBase, events: StoredEvent[]): LearnerSummary {
  const sorted = sortEvents(events);
  const last = sorted.at(-1);
  const answers = firstAnswers(events);
  const days = new Set(
    sorted.filter((event) => event.type === "answer_submitted" || event.type === "session_planned").map((event) => dateKey(at(event))),
  ).size;
  const matrix = emptyMatrix();
  for (const event of answers) addToMatrix(matrix, event);
  const initial = emptyMatrix();
  const medial = emptyMatrix();
  for (const event of answers) {
    if (String(event.payload.position) === "initial") addToMatrix(initial, event);
    else addToMatrix(medial, event);
  }
  let note = "아직 기록이 없어요";
  if (matrix.total > 0) {
    const pick = worstCell(matrix);
    note = pick ? `${pick.from}을 ${pick.to}으로 ${pick.count}번 골랐어요` : "없음";
  }
  const audioErrors = answers.filter((event) => event.payload.excludedReason === "audio_error").length;
  return {
    ...learner,
    lastActive: last ? last.clientTime : null,
    days,
    note,
    activeMs: measure(events).activeMs,
    medial: { correct: medial.correct, total: medial.total },
    initial: { correct: initial.correct, total: initial.total },
    audioErrors,
  };
}

export function detail(learner: LearnerSummary, events: StoredEvent[]): LearnerDetail {
  const sorted = sortEvents(events);
  const answers = firstAnswers(events);
  const medial = emptyMatrix();
  const initial = emptyMatrix();
  const byVowel: Record<string, Matrix> = { "i-u": emptyMatrix(), "a-eo-o": emptyMatrix() };
  for (const event of answers) {
    const position = String(event.payload.position);
    if (position === "medial") {
      addToMatrix(medial, event);
      const vowel = String(event.payload.previousVowel);
      for (const [group, vowels] of Object.entries(VOWEL_GROUPS)) {
        if (vowels.includes(vowel)) addToMatrix(byVowel[group] as Matrix, event);
      }
    } else if (position === "initial") addToMatrix(initial, event);
  }

  const abxSeen = new Set<string>();
  const pairs = new Map<string, { trials: number; correct: number }>();
  let abxTrials = 0;
  let abxCorrect = 0;
  for (const event of sorted) {
    if (event.type !== "abx_answer") continue;
    const trialId = String(event.payload.trialId);
    if (abxSeen.has(trialId)) continue;
    abxSeen.add(trialId);
    abxTrials += 1;
    if (event.payload.correct) abxCorrect += 1;
    const pair = String(event.payload.pair);
    const row = pairs.get(pair) ?? { trials: 0, correct: 0 };
    row.trials += 1;
    if (event.payload.correct) row.correct += 1;
    pairs.set(pair, row);
  }

  const replays = CONSONANTS.map((consonant) => {
    const rows = answers.filter((event) => event.payload.target === consonant);
    const values = rows.map((event) => Number(event.payload.replaysBeforeAnswer) || 0);
    return {
      consonant,
      items: rows.length,
      average: values.length ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10 : 0,
      max: values.length ? Math.max(...values) : 0,
    };
  });

  const overall = measure(events);
  const planned = sorted.filter((event) => event.type === "session_planned");
  const lastPlan = planned.at(-1);
  let recent: LearnerDetail["recent"] = null;
  if (lastPlan) {
    const sessionEvents = sorted.filter((event) => event.sessionId === lastPlan.sessionId);
    const span = measure(sessionEvents);
    const itemIds = (lastPlan.payload.itemIds as string[] | undefined) ?? [];
    const sessionAnswers = answers.filter((event) => event.sessionId === lastPlan.sessionId);
    const dwell: DwellRow[] = [];
    for (const answer of sessionAnswers) {
      const itemId = String(answer.payload.itemId);
      const shown = sessionEvents.find((event) => event.type === "item_shown" && event.payload.itemId === itemId);
      if (!shown) continue;
      const window = sessionEvents.filter((event) => at(event) >= at(shown) && at(event) <= at(answer));
      const position = itemIds.indexOf(itemId) + 1;
      dwell.push({
        label: `${position}번 · ${String(answer.payload.stimulusLabel ?? "")}`.trim(),
        dwellMs: at(answer) - at(shown),
        replays: Number(answer.payload.replaysBeforeAnswer) || 0,
        waitMs: answer.payload.msFromStimulusEnd === null ? null : Number(answer.payload.msFromStimulusEnd),
        hiddenMs: measure(window).hiddenMs,
        outcome: `제시 ${String(answer.payload.target)} → 첫 선택 ${String(answer.payload.choice)}${
          answer.payload.countsAsScore ? "" : " (성적 제외)"
        }`,
      });
    }
    dwell.sort((a, b) => b.dwellMs - a.dwellMs);

    const interruptions: string[] = [];
    if (span.visits.length > 1) {
      span.visits.slice(1).forEach((visit, index) => {
        const before = span.visits[index];
        if (!before) return;
        const answeredBefore = sessionAnswers.filter((event) => at(event) <= before.end).length;
        if (answeredBefore >= itemIds.length) return;
        interruptions.push(
          `${formatClock(before.end)}에 듣고 고르기 ${answeredBefore}/${itemIds.length}에서 멈췄어요. ${formatClock(visit.start)}에 다음 문항부터 이어 했어요.`,
        );
      });
    }
    const ended = sessionEvents.some((event) => event.type === "session_end");
    const lastEvent = sessionEvents.at(-1);
    if (!ended && lastEvent && Date.now() - at(lastEvent) > VISIT_GAP_MS && sessionAnswers.length < itemIds.length) {
      interruptions.push(`${formatClock(at(lastEvent))}에 듣고 고르기 ${sessionAnswers.length}/${itemIds.length}에서 멈춘 채로 남아 있어요.`);
    }

    recent = {
      label: `${shortDate(at(lastPlan))} · 모음 사이 · 듣고 고르기 ${sessionAnswers.length}/${itemIds.length}`,
      activeMs: span.activeMs,
      openMs: span.openMs,
      hiddenMs: span.hiddenMs,
      audioMs: span.audioMs,
      idleMs: span.idleMs,
      dwell: dwell.slice(0, 3),
      interruptions,
    };
  }

  const byDay = new Map<string, StoredEvent[]>();
  for (const event of sorted) {
    const key = dateKey(at(event));
    byDay.set(key, [...(byDay.get(key) ?? []), event]);
  }
  const calendar = calendarKeys(Date.now()).map((day) => ({
    ...day,
    activeMs: byDay.has(day.date) ? measure(byDay.get(day.date) as StoredEvent[]).activeMs : 0,
  }));

  const trend = planned
    .map((plan) => {
      const tally = emptyMatrix();
      for (const event of answers) if (event.sessionId === plan.sessionId) addToMatrix(tally, event);
      return { label: formatClock(at(plan)), correct: tally.correct, total: tally.total };
    })
    .filter((row) => row.total > 0)
    .slice(-6);

  const byItem = new Map<string, { label: string; wrong: number; total: number; chosen: Map<string, number> }>();
  for (const event of answers) {
    if (!event.payload.countsAsScore) continue;
    const id = String(event.payload.itemId);
    const row = byItem.get(id) ?? {
      label: `모음 사이 ${String(event.payload.target)} · ${String(event.payload.stimulusLabel ?? "")}`,
      wrong: 0,
      total: 0,
      chosen: new Map<string, number>(),
    };
    row.total += 1;
    if (event.payload.target !== event.payload.choice) {
      row.wrong += 1;
      const choice = String(event.payload.choice);
      row.chosen.set(choice, (row.chosen.get(choice) ?? 0) + 1);
    }
    byItem.set(id, row);
  }
  const hardItems = [...byItem.values()]
    .filter((row) => row.wrong > 0)
    .sort((x, y) => y.wrong - x.wrong || y.wrong / y.total - x.wrong / x.total)
    .slice(0, 4)
    .map((row) => ({
      label: row.label,
      wrong: row.wrong,
      total: row.total,
      chosen: [...row.chosen.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] ?? "",
    }));

  const stops: string[] = [];
  for (const plan of planned) {
    if (plan === lastPlan) continue;
    const sessionEvents = sorted.filter((event) => event.sessionId === plan.sessionId);
    const total = ((plan.payload.itemIds as string[] | undefined) ?? []).length;
    const answered = answers.filter((event) => event.sessionId === plan.sessionId).length;
    const ended = sessionEvents.some((event) => event.type === "session_end");
    const lastEvent = sessionEvents.at(-1);
    if (!ended && lastEvent && answered < total) {
      const p = parts(at(lastEvent));
      stops.push(`${p.month}월 ${p.day}일 ${p.hour}:${p.minute}에 듣고 고르기 ${answered}/${total}에서 멈추고 새로 시작했어요.`);
    }
  }
  if (recent) stops.push(...recent.interruptions);
  const lastActiveDay = calendar.filter((day) => day.activeMs > 0).at(-1);
  const today = dateKey(Date.now());
  if (lastActiveDay && lastActiveDay.date < today) {
    const gap = Math.round((Date.parse(today) - Date.parse(lastActiveDay.date)) / 86_400_000);
    if (gap >= 3) stops.push(`${koreanDate(lastActiveDay.date)} 뒤로 ${gap}일 동안 학습이 없어요.`);
  }

  const worst = worstCell(medial);
  const insight =
    medial.total === 0
      ? "아직 듣고 고르기 기록이 없어요."
      : worst
        ? `모음 사이에서 ${worst.from}을 ${worst.to}으로 고른 일이 가장 잦았어요(${worst.count}번). 이 수만으로 까닭을 판단하지는 않아요.`
        : "모음 사이 첫 응답에서 헷갈린 짝이 없었어요.";
  const finished = planned.filter((plan) =>
    sorted.some((event) => event.type === "session_end" && event.sessionId === plan.sessionId),
  ).length;

  const first = sorted[0];
  const last = sorted.at(-1);
  return {
    learner,
    insight,
    calendar,
    trend,
    hardItems,
    stops: stops.slice(-4),
    period: first && last ? `${shortDate(at(first))}–${shortDate(at(last))} · 미리보기 기록` : "기록 없음",
    stats: {
      activeMs: overall.activeMs,
      openMs: overall.openMs,
      days: learner.days,
      lastActive: learner.lastActive,
      started: planned.length,
      finished,
    },
    identify: { medial, initial, byVowel },
    abx: {
      trials: abxTrials,
      correct: abxCorrect,
      pairs: [...pairs.entries()].map(([pair, row]) => ({ pair, ...row })),
    },
    replays,
    recent,
    sessions: planned.length,
    isExample: false,
  };
}
