import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import type { WordView } from "../../../server/preview/contract.ts";
import { previewApi } from "../../preview/api";
import { usePractice } from "../../preview/PracticeContext";
import { ScreenTitle } from "../../ui";
import { StripLink } from "./parts";
import { byConsonant, reportLines } from "./summary";

export function CanvasFinish() {
  const practice = usePractice();
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

  return (
    <div className="c-page c-report">
      <ScreenTitle title="학습 리포트" />
      <p className="c-label right">미리보기 · 검수 전 음원</p>
      <h2 className="c-title">학습 리포트</h2>
      <div className="c-rule" />
      <p className="c-meta">
        <span>미리보기 학습자</span>
        <i>/</i>
        <span>
          {today.getMonth() + 1}월 {today.getDate()}일
        </span>
        <i>/</i>
        <span>ㅈ · ㅊ · ㅉ</span>
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
                <p className="c-label">첫 응답만 세요{excluded > 0 ? ` · 성적에서 뺀 문항 ${excluded}개` : ""}</p>
              </div>
              <p className="c-big">
                <strong>{correct}</strong> / {scored.length}
              </p>
            </div>
            <ul className="c-rows">
              {byConsonant(answers).map((row) => (
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
                두 소리 비교 {practice.abx.done}번 · 같은 소리 {practice.abx.correct}번 (따로 세요)
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
          <section>
            <h3>학습 여정</h3>
            <div className="c-journey">
              <div>
                <i className="on" />
                <span>모음 사이 소리</span>
              </div>
              <div>
                <small>다음 연습</small>
                <i />
                <span>모음 사이 단어</span>
              </div>
              <div>
                <i />
                <span>단어 첫머리</span>
              </div>
            </div>
          </section>
          <div className="c-line" />
          <section>
            <h3>오늘의 말</h3>
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
