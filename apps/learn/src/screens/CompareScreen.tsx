import { useState } from "react";
import { Link } from "react-router";
import { LearnerFrame, Pill, ScreenTitle } from "../ui";

const options = ["A와 같아요", "B와 같아요"] as const;

export function CompareScreen() {
  const [choice, setChoice] = useState<number | null>(null);

  return (
    <LearnerFrame>
      <ScreenTitle title="비교 도움" />
      <section className="panel stack" aria-labelledby="compare-title">
        <Link className="text-link" to="/">
          ← 풀던 화면으로 돌아가기
        </Link>
        <Pill>보조 연습 · 두 소리 비교</Pill>
        <h2 id="compare-title">X는 어느 쪽과 같나요?</h2>
        <p className="muted">A, B, X는 서로 다른 승인 음원이 있을 때 듣습니다. 지금은 음원이 없습니다.</p>
        <div className="choices compare-choices">
          <button type="button" disabled>
            A 듣기 · 준비 중
          </button>
          <button type="button" disabled>
            B 듣기 · 준비 중
          </button>
        </div>
        <button type="button" disabled>
          X 듣기 · 준비 중
        </button>
        <div className="stack" role="group" aria-label="비교 선택. 자음 식별과 따로 둘 자리입니다.">
          {options.map((label, index) => (
            <button key={label} type="button" aria-pressed={choice === index} onClick={() => setChoice(index)}>
              {label}
            </button>
          ))}
        </div>
        {choice !== null ? (
          <p className="notice" role="status">
            고른 위치만 이 화면에 표시합니다. 비교 결과는 없고, 자음 식별 기록과도 합치지 않습니다.
          </p>
        ) : null}
        <p className="small">이 활동은 듣고 자음을 고르는 과제와 따로 기록할 예정입니다.</p>
        <Link className="button primary" to="/">
          듣기 퀴즈로 돌아가기
        </Link>
      </section>
    </LearnerFrame>
  );
}
