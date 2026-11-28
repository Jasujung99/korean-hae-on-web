import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import type { WordView } from "../../../server/preview/contract.ts";
import { previewApi } from "../../preview/api";
import { usePractice } from "../../preview/PracticeContext";
import { LearnerFrame, ScreenTitle } from "../../ui";

const CONSONANTS = ["ㅈ", "ㅊ", "ㅉ"];

export function FinishLive() {
  const practice = usePractice();
  const navigate = useNavigate();
  const [words, setWords] = useState<WordView[]>([]);
  const { session } = practice;

  useEffect(() => {
    practice.ensureSession();
  }, [practice]);

  useEffect(() => {
    previewApi
      .words()
      .then(({ words: list }) => setWords(list))
      .catch(() => setWords([]));
  }, []);

  const answers = Object.values(practice.results);
  const scored = answers.filter((answer) => answer.countsAsScore);
  const correct = scored.filter((answer) => answer.correct).length;
  const excluded = answers.length - scored.length + practice.skipped.length;
  const finished = Boolean(session?.finished);

  const byConsonant = CONSONANTS.map((consonant) => {
    const rows = scored.filter((answer) => answer.answer.key === consonant);
    return { consonant, total: rows.length, correct: rows.filter((answer) => answer.correct).length };
  });

  const confusions = new Map<string, number>();
  for (const answer of scored) {
    if (answer.correct) continue;
    const key = `${answer.answer.key} → ${answer.choice}`;
    confusions.set(key, (confusions.get(key) ?? 0) + 1);
  }
  const topConfusion = [...confusions.entries()].sort((a, b) => b[1] - a[1])[0];

  return (
    <LearnerFrame preview>
      <ScreenTitle title="연습 마무리" />
      <section className="panel stack" aria-labelledby="finish-title">
        <div>
          <div className="complete" aria-hidden="true">
            ✓
          </div>
          <span className="eyebrow">오늘의 짧은 연습</span>
          <h2 id="finish-title" style={{ marginTop: 8 }}>
            소리의 차이를
            <br />
            하나씩 알아가요.
          </h2>
        </div>
        <p className="muted">이번에는 모음 사이의 ㅈ · ㅊ · ㅉ를 만났어요.</p>
        {finished && scored.length > 0 ? (
          <div className="result-block">
            <div className="row">
              <div>
                <h3>소리 · 듣고 고르기</h3>
                <p className="small">
                  첫 응답만 세요{excluded > 0 ? ` · 성적에서 뺀 문항 ${excluded}개` : ""}
                </p>
              </div>
              <p className="score">
                <strong>{correct}</strong> / {scored.length}
              </p>
            </div>
            <ul className="score-rows">
              {byConsonant.map((row) => (
                <li key={row.consonant}>
                  <span className="score-jamo">{row.consonant}</span>
                  <span className="score-label">들려준 소리 {row.consonant}</span>
                  <span className="dots" role="img" aria-label={`${row.total}번 가운데 ${row.correct}번 맞음`}>
                    {Array.from({ length: row.total }, (_, position) => (
                      <i key={position} className={position < row.correct ? "on" : undefined} />
                    ))}
                  </span>
                  <span className="score-num">
                    {row.correct} / {row.total}
                  </span>
                </li>
              ))}
            </ul>
            {topConfusion ? (
              <p className="small">가장 많이 헷갈린 소리: {topConfusion[0]} {topConfusion[1]}번</p>
            ) : null}
            {practice.abx.done > 0 ? (
              <p className="small">
                두 소리 비교 {practice.abx.done}번 · 같은 소리 {practice.abx.correct}번 (듣고 고르기와 따로 셉니다)
              </p>
            ) : null}
          </div>
        ) : (
          <div className="notice" role="status">
            아직 마친 연습이 없어요. 듣기 퀴즈를 끝까지 풀면 여기에서 결과를 볼 수 있어요.
          </div>
        )}
        <button
          type="button"
          className="primary"
          onClick={() => {
            void practice.startNew().then(() => navigate("/practice"));
          }}
        >
          한 번 더 연습하기
        </button>
        <div className="divider-block">
          <div className="row">
            <h3>이 소리, 단어에서는?</h3>
          </div>
          <p className="muted">생활 속 단어와 예문으로 연결해요.</p>
          <div className="word-list">
            {words.map((word) => (
              <Link key={word.id} to={`/dictionary?word=${encodeURIComponent(word.id)}`}>
                <strong>{word.word}</strong>
                <small>
                  {word.consonant} · 뜻과 예문 →
                </small>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </LearnerFrame>
  );
}
