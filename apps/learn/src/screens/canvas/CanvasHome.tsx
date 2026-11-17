import { useEffect } from "react";
import { Link, useNavigate } from "react-router";
import { usePractice } from "../../preview/PracticeContext";
import { ScreenTitle } from "../../ui";
import { Sticker, StripLink } from "./parts";

const steps = [
  { num: "01", title: "듣고 고르기", note: "아홉 문항", to: "/practice" },
  { num: "02", title: "소리 익히기", note: "아자 · 아차 · 아짜", to: "/listen" },
  { num: "03", title: "새 단어", note: "모자 · 기차 · 이쪽", to: "/dictionary" },
  { num: "04", title: "학습 리포트", note: "오늘의 변화", to: "/finish" },
];

export function CanvasHome() {
  const practice = usePractice();
  const navigate = useNavigate();

  useEffect(() => {
    practice.ensureSession();
  }, [practice]);

  const answered = Object.keys(practice.results).length + practice.skipped.length;
  const total = practice.session?.items.length ?? 9;
  const started = answered > 0 && !practice.session?.finished;

  return (
    <div className="c-page">
      <ScreenTitle title="오늘의 연습" />
      <p className="c-label">소리 연습</p>
      <h2 className="c-title">오늘의 연습</h2>
      <div className="c-rule" />
      <p className="c-meta">
        <span>미리보기 학습자</span>
        <i>/</i>
        <span>ㅈ · ㅊ · ㅉ</span>
        <i>/</i>
        <span>약 7분</span>
      </p>
      <div className="c-hero" role="img" aria-label="자, 차, 짜">
        <span className="c-syll t1">
          <b>ㅈ</b>
          <em>ㅏ</em>
        </span>
        <span className="c-syll t2">
          <b>ㅊ</b>
          <em>ㅏ</em>
        </span>
        <span className="c-syll t3">
          <b>ㅉ</b>
          <em>ㅏ</em>
        </span>
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
