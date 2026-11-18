import { useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router";
import { usePractice } from "../../preview/PracticeContext";
import { LearnerFrame, Pill, ScreenTitle } from "../../ui";

const KEY_LABEL: Record<string, string> = { ㅈ: "ㅈ", ㅊ: "ㅊ", ㅉ: "ㅉ" };

export function QuizLive() {
  const practice = usePractice();
  const navigate = useNavigate();
  const autoPlayFor = useRef<string | null>(null);
  const { status, session, index } = practice;
  const item = session?.items[index] ?? null;

  useEffect(() => {
    practice.ensureSession();
  }, [practice]);

  useEffect(() => {
    if (item && autoPlayFor.current === item.itemId) {
      autoPlayFor.current = null;
      void practice.playStimulus();
    }
  }, [item, practice]);

  if (status === "error") {
    return (
      <LearnerFrame preview>
        <ScreenTitle title="듣기 퀴즈" />
        <section className="panel stack">
          <h2>연습을 불러오지 못했어요.</h2>
          <p className="notice" role="status">
            미리보기 서버에 닿지 못했어요. 서버가 켜져 있는지 확인한 뒤 다시 시도해 주세요.
          </p>
          <button type="button" className="primary" onClick={() => void practice.startNew()}>
            다시 시도
          </button>
        </section>
      </LearnerFrame>
    );
  }

  if (!session || !item) {
    return (
      <LearnerFrame preview>
        <ScreenTitle title="듣기 퀴즈" />
        <section className="panel stack">
          <p className="muted">연습을 준비하고 있어요…</p>
        </section>
      </LearnerFrame>
    );
  }

  if (session.finished) {
    return (
      <LearnerFrame preview>
        <ScreenTitle title="듣기 퀴즈" />
        <section className="panel stack" aria-labelledby="done-title">
          <p className="eyebrow">듣고 자음 고르기</p>
          <h2 id="done-title">이번 연습을 마쳤어요.</h2>
          <p className="muted">결과를 보거나 새 연습을 시작할 수 있어요.</p>
          <Link className="button primary" to="/finish">
            결과 보기
          </Link>
          <button type="button" onClick={() => void practice.startNew()}>
            새 연습 시작
          </button>
        </section>
      </LearnerFrame>
    );
  }

  const total = session.items.length;
  const result = practice.results[item.itemId] ?? null;
  const choice = practice.choices[item.itemId] ?? null;
  const plays = practice.plays[item.itemId] ?? 0;
  const heard = practice.heard[item.itemId] ?? false;
  const failed = practice.audioFailed[item.itemId] ?? false;
  const skipped = practice.skipped.includes(item.itemId);
  const listening = practice.playing === "stimulus";
  const doneIds = new Set([...Object.keys(practice.results), ...practice.skipped]);
  const chosenText = result?.choiceText ?? "";
  // 브라우저 음성은 의사단어에만 쓴다. 낱말 비교는 고정 음원이다.
  const last = index === total - 1;

  const goNext = () => {
    const outcome = practice.next();
    if (outcome === "finished") navigate("/finish");
    else if (heard) autoPlayFor.current = session.items[index + 1]?.itemId ?? null;
  };

  let audioLine = "소리를 먼저 들어야 고른 답을 확인할 수 있어요.";
  if (failed && !heard) audioLine = "소리를 불러오지 못했어요. 이 문항은 성적에 넣지 않아요.";
  else if (plays > 0) audioLine = `${plays}번 들었어요 · 음원 ${session.voice} · 검수 전 초안`;

  return (
    <LearnerFrame preview>
      <ScreenTitle title="듣기 퀴즈" />
      <section className="panel" aria-labelledby="quiz-title">
        <div className="lesson-top">
          <Pill>
            {item.positionLabel} · ㅈ ㅊ ㅉ{item.stepLabel ? ` · ${item.stepLabel}` : ""}
          </Pill>
          <div className="lesson-track">
            <span className="track" role="img" aria-label={`${total}문항 가운데 ${index + 1}번째`}>
              {session.items.map((row, position) => (
                <span
                  key={row.itemId}
                  className={doneIds.has(row.itemId) ? "done" : position === index ? "current" : undefined}
                />
              ))}
            </span>
            <span>
              {index + 1} / {total}
            </span>
          </div>
        </div>
        <div className="quiz-title">
          <p className="eyebrow">듣고 자음 고르기</p>
          <h2 id="quiz-title">
            가운데 소리에
            <br />
            귀를 기울여요.
          </h2>
          <p className="muted">소리를 듣고 하나를 골라 주세요.</p>
        </div>
        <div className="mode-nav">
          <Link to="/practice" aria-current="page">
            듣기 퀴즈
          </Link>
          <Link to="/compare">비교 도움</Link>
        </div>
        <div className="listen">
          <div className="audio-line">
            <div>
              <p className="muted">어떤 소리로 들렸나요?</p>
              <div className={listening ? "jamo-motif is-playing" : "jamo-motif"} aria-hidden="true">
                <span />
                <span />
                <span />
                <span />
              </div>
            </div>
            <button
              type="button"
              className="listen-button"
              onClick={() => void practice.playStimulus()}
              disabled={listening}
              aria-describedby="audio-status"
            >
              {listening ? "듣는 중…" : plays > 0 ? "한 번 더 듣기" : "소리 듣기"}
            </button>
          </div>
          <p className="audio-label" id="audio-status" aria-live="polite">
            {audioLine}
          </p>
        </div>
        <div className="choices" role="group" aria-label="소리 고르기">
          {item.choices.map((row) => {
            const isChoice = choice === row.key;
            const isKey = result?.answer.key === row.key;
            const className = [isChoice ? "selected" : "", result && isKey ? "key" : ""].filter(Boolean).join(" ");
            let note = KEY_LABEL[row.key] ?? row.key;
            if (result && isKey) note = "정답";
            else if (result && isChoice) note = "내 선택";
            else if (isChoice) note = "내 선택";
            return (
              <button
                key={row.key}
                type="button"
                className={className || undefined}
                aria-pressed={isChoice}
                disabled={Boolean(result) || skipped}
                onClick={() => practice.choose(row.key)}
              >
                {row.text || row.key}
                <small>{row.text ? note : note === row.key ? "\u00a0" : note}</small>
              </button>
            );
          })}
        </div>
        {result ? (
          <div className="feedback" role="status">
            <strong>{result.correct ? "같은 소리를 골랐어요." : "두 소리를 나란히 들어 봐요."}</strong>
            <p>
              정답 {result.answer.text} · 내 선택 {result.choice}
              {result.countsAsScore ? "" : " · 이 문항은 성적에 넣지 않아요"}
            </p>
            <p className="small">
              {result.correct
                ? ""
                : result.compareKind === "word"
                  ? `같은 묶음의 낱말로 비교해요: ${result.answerText} · ${chosenText}`
                  : item.kind === "word"
                    ? `짝이 되는 낱말이 없어 의사단어로 비교해요: ${result.answerText} · ${chosenText}`
                    : ""}
            </p>
            <div className="pair">
              <button
                type="button"
                onClick={() => void practice.playRole(result.answerRef, "answer", result.answerText)}
                disabled={practice.playing !== null}
              >
                정답 소리 듣기
              </button>
              <button
                type="button"
                onClick={() => void practice.playRole(result.choiceRef, "chosen", chosenText)}
                disabled={result.correct || practice.playing !== null}
              >
                내 선택 듣기
              </button>
            </div>
          </div>
        ) : null}
        {skipped ? (
          <p className="notice" role="status">
            이 문항은 건너뛰었어요. 성적에 넣지 않아요.
          </p>
        ) : null}
        <div className="actions">
          {result || skipped ? (
            <button type="button" className="primary" onClick={goNext}>
              {last ? "이번 연습 마치기" : "다음 문제 →"}
            </button>
          ) : (
            <button
              type="button"
              className="primary"
              disabled={!choice || practice.submitting || (!heard && !failed)}
              onClick={() => void practice.submit()}
            >
              선택 확인
            </button>
          )}
          {!result && !skipped && failed ? (
            <button type="button" onClick={practice.skip}>
              이 문항 건너뛰기
            </button>
          ) : null}
        </div>
        <p className="resume-note">
          <span aria-hidden="true">↳</span> 비교 도움을 보고 돌아와도 풀던 문제는 그대로예요.
        </p>
      </section>
      <p className="flow-note">
        미리보기 · 음원은 검수 전 초안이에요. 기록은 이 컴퓨터의 미리보기 저장소에만 남아요. 출제 {session.policyVersion}.
      </p>
    </LearnerFrame>
  );
}
