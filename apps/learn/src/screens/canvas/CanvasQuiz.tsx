import { useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router";
import { usePractice } from "../../preview/PracticeContext";
import { ScreenTitle } from "../../ui";
import { Blade, Dots, Sticker, StripLink, leadVowel, withCopula, withPast } from "./parts";

const ORDINAL = ["첫째", "둘째", "셋째", "넷째"];

export function CanvasQuiz() {
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
      <div className="c-page">
        <ScreenTitle title="듣고 고르기" />
        <h2 className="c-title">연습을 불러오지 못했어요.</h2>
        <StripLink onClick={() => void practice.startNew()}>다시 시도</StripLink>
      </div>
    );
  }
  if (!session || !item) {
    return (
      <div className="c-page">
        <ScreenTitle title="듣고 고르기" />
        <p className="c-label">연습을 준비하고 있어요…</p>
      </div>
    );
  }
  if (session.finished) {
    return (
      <div className="c-page">
        <ScreenTitle title="듣고 고르기" />
        <p className="c-label">01 듣고 고르기</p>
        <h2 className="c-title">{session.items.length}문항을 마쳤어요.</h2>
        <div className="c-rule" />
        <p className="c-body">이제 헷갈린 소리를 천천히 들어 봐요.</p>
        <StripLink onClick={() => navigate("/listen")}>소리 익히기</StripLink>
        <button type="button" className="c-link" onClick={() => void practice.startNew()}>
          새로 풀기
        </button>
      </div>
    );
  }

  const total = session.items.length;
  const result = practice.results[item.itemId] ?? null;
  const picked = result?.choice ?? null;
  const plays = practice.plays[item.itemId] ?? 0;
  const heard = practice.heard[item.itemId] ?? false;
  const failed = practice.audioFailed[item.itemId] ?? false;
  const skipped = practice.skipped.includes(item.itemId);
  const listening = practice.playing === "stimulus";
  const done = Object.keys(practice.results).length + practice.skipped.length;
  const last = index === total - 1;
  const lead = leadVowel(item.choices[0]?.text || "아");
  const word = item.kind === "word";
  const chosenText = result?.choiceText ?? "";
  // 브라우저 음성은 의사단어에만 쓴다. 낱말 비교는 고정 음원이다.
  const canPick = (heard || failed) && !result && !skipped && !practice.submitting;

  const goNext = () => {
    const outcome = practice.next();
    if (outcome === "finished") navigate("/listen");
    else if (heard) autoPlayFor.current = session.items[index + 1]?.itemId ?? null;
  };

  let caption = "먼저 소리를 들어요.";
  if (failed && !heard) caption = "소리를 불러오지 못했어요. 이 문항은 점수에 넣지 않아요.";
  else if (plays > 0) caption = `${plays}번 들었어요 · 누르면 다시 들려줘요`;

  return (
    <div className="c-page">
      <ScreenTitle title="듣고 고르기" />
      <div className="c-top">
        <p className="c-label">
          <span className="c-num sm">01</span> 듣고 고르기 · {item.positionLabel}
          {item.stepLabel ? ` · ${item.stepLabel}` : ""}
        </p>
        <p className="c-count">
          <Dots total={total} done={done} current={index} />
          <span>
            {index + 1} / {total}
          </span>
        </p>
      </div>

      <div className="c-listen">
        <button type="button" className="c-round" onClick={() => void practice.playStimulus()} disabled={listening}>
          {listening ? "듣는 중" : "들려주기"}
        </button>
        <span className={listening ? "c-blades is-playing" : "c-blades"} aria-hidden="true">
          <i className="b1" />
          <i className="b2" />
          <i className="b3" />
        </span>
        <p className="c-caption" aria-live="polite">
          {caption}
        </p>
      </div>

      <div className="c-stage" role="img" aria-label={picked ? `고른 조각 ${picked}이 빈칸에 놓였어요` : "가운데 첫소리 자리가 비어 있어요"}>
        {word ? (
          Array.from({ length: item.syllableIndex - 1 }, (_, position) => (
            <span key={position} className="c-ghost" aria-hidden="true" />
          ))
        ) : (
          <>
            <b className="t1">ㅇ</b>
            <em>{lead}</em>
          </>
        )}
        {picked ? (
          <b key={`${item.itemId}-${picked}`} className="c-slot filled">
            {picked}
          </b>
        ) : (
          <span className="c-slot" />
        )}
        <em>{word ? item.vowel : "ㅏ"}</em>
      </div>
      {word ? (
        <p className="c-caption center">
          낱말의 {ORDINAL[item.syllableIndex - 1] ?? `${item.syllableIndex}번째`} 소리 · 첫소리만 골라요
        </p>
      ) : null}

      <div className="c-say">
        {result ? (
          <>
            <div>
              <h2 className="c-key">{withPast(result.answer.text)}</h2>
              <p className="c-body">
                {result.correct
                  ? `${result.answer.key} 소리를 또렷하게 가려 들었어요.`
                  : result.compareKind === "word"
                    ? `${result.choice}을 고르면 ${withCopula(chosenText)} 두 낱말을 이어서 들어 보세요.`
                    : word
                      ? `짝이 되는 낱말이 없어 ${result.answerText}·${chosenText}로 비교해요.`
                      : `고른 소리는 ${withCopula(chosenText)} 두 소리를 이어서 들어 보세요.`}
                {result.countsAsScore ? "" : " 이 문항은 점수에 넣지 않아요."}
              </p>
            </div>
            <Sticker delay>{result.correct ? "잘 들었어요." : "괜찮아 ♡"}</Sticker>
          </>
        ) : (
          <div>
            <h2 className="c-key">어떤 소리였나요?</h2>
            <p className="c-body">{canPick ? "조각 하나를 골라 빈칸에 놓아 보세요." : "소리를 끝까지 들으면 조각을 고를 수 있어요."}</p>
          </div>
        )}
      </div>

      <div className="c-tray" role="group" aria-label="소리 조각 고르기">
        {item.choices.map((row, position) => {
          const isAnswer = result?.answer.key === row.key;
          return (
            <button
              key={row.key}
              type="button"
              className={[`p${position + 1}`, picked === row.key ? "is-used" : "", isAnswer ? "is-answer" : ""].filter(Boolean).join(" ")}
              aria-label={`${row.key}${isAnswer ? ", 맞는 소리" : ""}${picked === row.key ? ", 내가 고른 소리" : ""}`}
              disabled={!canPick}
              onClick={() => void practice.submit(row.key)}
            >
              <b>{row.key}</b>
              {isAnswer ? (
                <svg className="c-ring" viewBox="0 0 120 100" aria-hidden="true">
                  <path d="M64 9C33 4 9 23 10 51C11 80 39 96 68 92C97 88 114 67 110 43C106 21 84 6 50 11" pathLength={1} />
                </svg>
              ) : null}
            </button>
          );
        })}
      </div>

      {result && !result.correct ? (
        <div className="c-pair">
          <button type="button" onClick={() => void practice.playRole(result.answerRef, "answer", result.answerText)} disabled={practice.playing !== null}>
            {result.answerText} 듣기
            <Blade />
          </button>
          <button type="button" onClick={() => void practice.playRole(result.choiceRef, "chosen", chosenText)} disabled={practice.playing !== null}>
            {chosenText} 듣기
            <Blade tone="lavender" />
          </button>
        </div>
      ) : null}

      {result || skipped ? (
        <StripLink onClick={goNext}>{last ? "소리 익히기로" : "다음 문항"}</StripLink>
      ) : failed && !heard ? (
        <button type="button" className="c-link" onClick={practice.skip}>
          이 문항 건너뛰기
        </button>
      ) : null}
      <p className="c-foot">
        <Link to="/compare">두 소리 비교 열기</Link> · 처음 고른 답이 기록돼요
      </p>
    </div>
  );
}
