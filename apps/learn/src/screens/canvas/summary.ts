import type { AnswerResult } from "../../../server/preview/contract.ts";

/** 답에 나온 자음을 보기 순서대로 모은다. 묶음마다 자음이 다르므로 고정 목록을 쓰지 않는다. */
function consonantsOf(answers: AnswerResult[], order: string[] = []): string[] {
  const seen = [...order];
  for (const answer of answers) if (!seen.includes(answer.answer.key)) seen.push(answer.answer.key);
  return seen;
}

export function topConfusion(answers: AnswerResult[]): { from: string; to: string; count: number } | null {
  const counts = new Map<string, number>();
  for (const answer of answers) {
    if (!answer.countsAsScore || answer.correct) continue;
    const key = `${answer.answer.key}>${answer.choice}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (!top) return null;
  const [from, to] = top[0].split(">");
  return { from: from ?? "", to: to ?? "", count: top[1] };
}

export function byConsonant(answers: AnswerResult[], order: string[] = []) {
  const scored = answers.filter((answer) => answer.countsAsScore);
  return consonantsOf(scored, order).map((consonant) => {
    const rows = scored.filter((answer) => answer.answer.key === consonant);
    return { consonant, total: rows.length, correct: rows.filter((answer) => answer.correct).length };
  });
}

/** 칭찬은 한 가지 행동을, 다음 과제는 한 가지만. */
export function reportLines(answers: AnswerResult[]): { change: string; good: string; next: string } {
  const rows = byConsonant(answers).filter((row) => row.total > 0);
  const best = [...rows].sort((a, b) => b.correct / b.total - a.correct / a.total)[0];
  const confusion = topConfusion(answers);
  const good = best
    ? best.correct === best.total
      ? `${best.consonant}을 ${best.total}번 모두 맞게 골랐어요.`
      : `${best.consonant}을 ${best.total}번 가운데 ${best.correct}번 맞게 골랐어요.`
    : "끝까지 들어 보았어요.";
  const next = confusion ? `${confusion.from}과 ${confusion.to}을 이어서 들어 보세요.` : "다음에도 끝까지 듣고 골라 보세요.";
  const change = best ? `${best.consonant} 소리를 가장 또렷하게 가려 들었어요.` : "오늘 처음 소리를 골라 보았어요.";
  return { change, good, next };
}
