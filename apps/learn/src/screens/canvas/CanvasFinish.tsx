import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import type { WordView } from "../../../server/preview/contract.ts";
import { previewApi } from "../../preview/api";
import { usePractice } from "../../preview/PracticeContext";
import { useLearner } from "../../preview/settings";
import { ScreenTitle } from "../../ui";
import { StripLink } from "./parts";
import { byConsonant, reportLines } from "./summary";

export function CanvasFinish() {
  const practice = usePractice();
  const learner = useLearner();
  const navigate = useNavigate();
  const [words, setWords] = useState<WordView[]>([]);

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
  const lines = reportLines(answers);
  const today = new Date();
  const nickname = learner.me?.learner.nickname ?? "";
  const groupLabel = practice.session?.groupLabel ?? "";
  const order = practice.session?.items[0]?.choices.map((row) => row.key) ?? [];

  return (
    <div className="c-page c-report">
      <ScreenTitle title="학습 리포트" />
      <h2 className="c-title">학습 리포트</h2>
      <div className="c-rule" />
      <p className="c-meta">
        {nickname ? (
          <>
            <span>{nickname} 님</span>
            <i>/</i>
          </>
        ) : null}
        <span>
          {today.getMonth() + 1}월 {today.getDate()}일
        </span>
        {groupLabel ? (
          <>
            <i>/</i>
            <span>{groupLabel}</span>
          </>
        ) : null}
      </p>

      {scored.length === 0 ? (
        <>
          <p className="c-body">아직 기록이 없어요. 듣고 고르기를 먼저 풀어 보세요.</p>
          <StripLink onClick={() => navigate("/practice")}>듣고 고르기</StripLink>
        </>
      ) : (
        <>
          <section>
            <h3>오늘의 변화</h3>
            <p className="c-body">{lines.change}</p>
          </section>
          <div className="c-line" />
          <section>
            <div className="c-score-head">
              <div>
                <h3>소리 — 듣고 고르기</h3>
                <p className="c-label">처음 고른 답만 세요{excluded > 0 ? ` · 점수에서 뺀 문항 ${excluded}개` : ""}</p>
              </div>
              <p className="c-big">
                <strong>{correct}</strong> / {scored.length}
              </p>
            </div>
            <ul className="c-rows">
              {byConsonant(answers, order).map((row) => (
                <li key={row.consonant}>
                  <b>{row.consonant}</b>
                  <span>들려준 소리 {row.consonant}</span>
                  <span className="c-dots" role="img" aria-label={`${row.total}번 가운데 ${row.correct}번 맞음`}>
                    {Array.from({ length: row.total }, (_, position) => (
                      <i key={position} className={position < row.correct ? "on" : "now"} />
                    ))}
                  </span>
                  <em>
                    {row.correct} / {row.total}
                  </em>
                </li>
              ))}
            </ul>
            {practice.abx.done > 0 ? (
              <p className="c-label">
                두 소리 비교를 {practice.abx.done}번 했고, {practice.abx.correct}번 맞혔어요. 위 점수와 따로 세요.
              </p>
            ) : null}
          </section>
          <div className="c-line" />
          <section className="c-cols">
            <div>
              <h3>좋았던 점</h3>
              <p className="c-body">{lines.good}</p>
            </div>
            <div>
              <h3>다음에 살펴볼 점</h3>
              <p className="c-body">{lines.next}</p>
            </div>
          </section>
          <div className="c-line" />
          {/* '학습 여정'은 실제 진도를 계산할 때까지 빼 둔다(전에는 늘 같은 자리에 점이 찍혔다). */}
          <section>
            <h3>이 묶음의 단어</h3>
            <p className="c-chunks">
              {words.slice(0, 6).map((word) => (
                <Link key={word.id} to={`/dictionary?word=${encodeURIComponent(word.id)}`}>
                  {word.word}
                </Link>
              ))}
            </p>
          </section>
          <StripLink
            onClick={() => {
              void practice.startNew().then(() => navigate("/"));
            }}
          >
            끝내기
          </StripLink>
          <p className="c-foot">
            <Link to="/listen">소리 조금 더 익히기</Link>
          </p>
        </>
      )}
    </div>
  );
}
