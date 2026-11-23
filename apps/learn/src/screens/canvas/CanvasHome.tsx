import { useEffect } from "react";
import { Link, useNavigate } from "react-router";
import { usePractice } from "../../preview/PracticeContext";
import { useLearner } from "../../preview/settings";
import { ScreenTitle } from "../../ui";
import { Sticker, StripLink } from "./parts";

export function CanvasHome() {
  const practice = usePractice();
  const learner = useLearner();
  const navigate = useNavigate();

  useEffect(() => {
    practice.ensureSession();
  }, [practice]);

  const answered = Object.keys(practice.results).length + practice.skipped.length;
  const total = practice.session?.items.length ?? null;
  const started = answered > 0 && !practice.session?.finished;
  const nickname = learner.me?.learner.nickname ?? "";
  const groupLabel = practice.session?.groupLabel ?? "";
  // 머리 글자는 이번 연습 묶음의 자음에서 가져온다. 아직 못 불러왔으면 첫 묶음(ㅈ·ㅊ·ㅉ)으로 둔다.
  const heroKeys = practice.session?.items[0]?.choices.map((row) => row.key).slice(0, 3) ?? ["ㅈ", "ㅊ", "ㅉ"];
  const steps = [
    { num: "01", title: "듣고 고르기", note: total ? `${total}문항` : "", to: "/practice" },
    { num: "02", title: "소리 익히기", note: "헷갈린 소리 다시 듣기", to: "/listen" },
    { num: "03", title: "새 단어", note: "뜻과 예문", to: "/dictionary" },
    { num: "04", title: "학습 리포트", note: "오늘의 변화", to: "/finish" },
  ];

  return (
    <div className="c-page">
      <ScreenTitle title="오늘의 연습" />
      <p className="c-label">소리 연습</p>
      <h2 className="c-title">오늘의 연습</h2>
      <div className="c-rule" />
      <p className="c-meta">
        {nickname ? <span>{nickname} 님</span> : null}
        {nickname && groupLabel ? <i>/</i> : null}
        {groupLabel ? <span>{groupLabel}</span> : null}
      </p>
      <div className="c-hero" role="img" aria-label={heroKeys.join(", ")}>
        {heroKeys.map((key, position) => (
          <span key={key} className={`c-syll t${position + 1}`}>
            <b>{key}</b>
            <em>ㅏ</em>
          </span>
        ))}
      </div>
      <ol className="c-steps">
        {steps.map((step) => (
          <li key={step.num}>
            <Link to={step.to}>
              <span className="c-num">{step.num}</span>
              <strong>{step.title}</strong>
              <small>{step.num === "01" && started ? `${answered} / ${total} 이어서` : step.note}</small>
            </Link>
          </li>
        ))}
      </ol>
      <div className="c-sticker-row">
        <Sticker>나답게, 천천히</Sticker>
      </div>
      <StripLink onClick={() => navigate("/practice")}>{started ? "이어하기" : "시작하기"}</StripLink>
      <p className="c-foot">먼저 듣고 골라 본 뒤에, 헷갈린 소리를 천천히 익혀요.</p>
    </div>
  );
}
