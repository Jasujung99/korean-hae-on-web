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

export function summarize(learner: Omit<LearnerSummary, "lastActive" | "days" | "note">, events: StoredEvent[]): LearnerSummary {
  const sorted = sortEvents(events);
  const last = sorted.at(-1);
  const answers = firstAnswers(events);
  const days = new Set(
    sorted.filter((event) => event.type === "answer_submitted" || event.type === "session_planned").map((event) => dateKey(at(event))),
  ).size;
  const matrix = emptyMatrix();
  for (const event of answers) addToMatrix(matrix, event);
  let note = "아직 기록이 없어요";
  if (matrix.total > 0) {
    let worst: { from: string; to: string; count: number } | null = null;
    matrix.rows.forEach((row, presented) =>
      row.forEach((count, chosen) => {
        if (presented !== chosen && count > 0 && (!worst || count > worst.count)) {
          worst = { from: CONSONANTS[presented] ?? "", to: CONSONANTS[chosen] ?? "", count };
        }
      }),
    );
    const pick = worst as { from: string; to: string; count: number } | null;
    note = pick ? `${pick.from} → ${pick.to} 선택 ${pick.count}회` : `첫 응답 ${matrix.correct}/${matrix.total}`;
  }
  return {
    ...learner,
    lastActive: last ? last.clientTime : null,
    days,
    note,
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
        interruptions.push(
          `${formatClock(before.end)} ${answeredBefore}/${itemIds.length}에서 멈춤 → ${formatClock(visit.start)} 다음 문항부터 이어 함`,
        );
      });
    }
    const ended = sessionEvents.some((event) => event.type === "session_end");
    const lastEvent = sessionEvents.at(-1);
    if (!ended && lastEvent && Date.now() - at(lastEvent) > VISIT_GAP_MS && sessionAnswers.length < itemIds.length) {
      interruptions.push(`${formatClock(at(lastEvent))} ${sessionAnswers.length}/${itemIds.length}에서 멈춘 채로 남아 있어요`);
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

  const first = sorted[0];
  const last = sorted.at(-1);
  return {
    learner,
    period: first && last ? `${shortDate(at(first))}–${shortDate(at(last))} · 미리보기 기록` : "기록 없음",
    stats: { activeMs: overall.activeMs, days: learner.days, lastActive: learner.lastActive },
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
