import { Link } from "react-router";
import { LearnerFrame, Pill, ScreenTitle } from "../ui";

const choices = [
  { syllable: "아자", label: "ㅈ" },
  { syllable: "아차", label: "ㅊ" },
  { syllable: "아짜", label: "ㅉ" },
] as const;

export function QuizScreen() {
  return (
    <LearnerFrame>
      <ScreenTitle title="듣기 퀴즈" />
      <section className="panel" aria-labelledby="quiz-title">
        <div className="lesson-top">
          <Pill>모음 사이 · ㅈ ㅊ ㅉ</Pill>
          <p className="lesson-track">
            <span className="track" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
            문항 준비 중
          </p>
        </div>
        <div className="quiz-title">
          <p className="eyebrow">듣고 자음 고르기</p>
          <h2 id="quiz-title">
            가운데 소리에
            <br />
            귀를 기울여요.
          </h2>
          <p className="muted">소리를 듣고 하나를 고르는 자리입니다. 지금은 소리가 없습니다.</p>
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
              <div className="jamo-motif" aria-hidden="true">
                <span />
                <span />
                <span />
                <span />
              </div>
            </div>
            <button type="button" disabled>
              소리 듣기 · 준비 중
            </button>
          </div>
          <p className="audio-label">승인된 음원이 없습니다. 무음을 재생하거나 성적으로 저장하지 않습니다.</p>
        </div>
        <div className="choices" role="group" aria-label="소리 보기. 이 단계에서는 저장하지 않습니다.">
          {choices.map((item) => (
            <button key={item.syllable} type="button" disabled>
              {item.syllable}
              <small>{item.label}</small>
            </button>
          ))}
        </div>
        <p className="notice" role="status">
          이 단계에서는 고른 답을 저장하지 않습니다. 맞았는지도 알려 주지 않습니다.
        </p>
        <div className="actions">
          <button type="button" className="primary" disabled>
            선택 확인
          </button>
          <Link className="text-link" to="/finish">
            마무리 화면
          </Link>
        </div>
        <p className="resume-note">비교 도움을 열어도 이 화면의 선택은 서버로 나가지 않습니다.</p>
      </section>
    </LearnerFrame>
  );
}
