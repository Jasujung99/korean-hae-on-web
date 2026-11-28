import { Link } from "react-router";
import { draftPracticePreview } from "../../content/preview.ts";
import { LearnerFrame, Pill, ScreenTitle } from "../ui";

const choices = [
  { syllable: "아자", label: "ㅈ" },
  { syllable: "아차", label: "ㅊ" },
  { syllable: "아짜", label: "ㅉ" },
] as const;

export function QuizScreen({ preview = false }: { preview?: boolean }) {
  const draft = preview ? draftPracticePreview() : null;

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
          <p className="eyebrow">{draft?.taskLabel ?? "듣고 자음 고르기"}</p>
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
              아직 준비 중
            </button>
          </div>
          <p className="audio-label">아직 준비 중. 없는 음원, 무음, 잘림, 재생 실패, 재생 중 응답은 점수로 저장하지 않습니다.</p>
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
          이 단계에서는 고른 답을 저장하지 않습니다. 재생 실패, 무음, 잘림, 재생 중 응답은 정상 정오답과 구분하며 성적이 아닙니다.
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
        {draft ? (
          <section className="draft-list" aria-labelledby="draft-title">
            <div className="row">
              <h3 id="draft-title">초안 후보</h3>
              <Pill tone="future">초안 · 미검수</Pill>
            </div>
            <p className="small">
              출제 정책 {draft.policyVersion}. 공통 6, 취약 후보 3, 간격 복습 3. 취약·복습 표본이 없어 균형 문항으로
              채웠습니다. 음원은 없고 점수는 저장하지 않습니다.
            </p>
            <ol className="draft-words">
              {draft.cards.map((card) => (
                <li key={card.itemId}>
                  <strong>{card.word}</strong>
                  <small>
                    {card.consonant} · {card.pos} · {card.slotLabel} ·{" "}
                    {card.flag === "sense_definition_mismatch" ? "연결 확인 필요" : "초안"}
                  </small>
                </li>
              ))}
            </ol>
          </section>
        ) : null}
      </section>
    </LearnerFrame>
  );
}
