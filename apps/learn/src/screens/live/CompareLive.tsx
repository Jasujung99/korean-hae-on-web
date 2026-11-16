import { useEffect } from "react";
import { Link } from "react-router";
import { usePractice } from "../../preview/PracticeContext";
import { LearnerFrame, Pill, ScreenTitle } from "../../ui";

export function CompareLive() {
  const practice = usePractice();
  const { session, abx, status } = practice;
  const item = session?.items[practice.index] ?? null;
  const itemId = item?.itemId ?? null;

  useEffect(() => {
    practice.ensureSession();
  }, [practice]);

  useEffect(() => {
    if (status !== "ready" || !itemId) return;
    void practice.openCompare();
    return () => practice.closeCompare();
    // 문항이 바뀔 때만 새 비교를 연다.
  }, [status, itemId]);

  const busy = practice.playing !== null;
  const ready = Boolean(abx.trial) && !abx.busy;

  return (
    <LearnerFrame preview>
      <ScreenTitle title="비교 도움" />
      <section className="panel stack" aria-labelledby="compare-title">
        <Link className="text-link" to="/practice">
          ← 풀던 문제로 돌아가기
        </Link>
        <Pill>보조 연습 · 두 소리 비교</Pill>
        <h2 id="compare-title">X는 어느 쪽과 같나요?</h2>
        <p className="muted">A, B를 듣고 마지막 X를 비교해요.</p>
        <div className="choices compare-choices">
          <button type="button" onClick={() => void practice.playAbx("a")} disabled={!ready || busy}>
            {practice.playing === "abx_a" ? "A 듣는 중…" : "A 듣기"}
          </button>
          <button type="button" onClick={() => void practice.playAbx("b")} disabled={!ready || busy}>
            {practice.playing === "abx_b" ? "B 듣는 중…" : "B 듣기"}
          </button>
        </div>
        <button type="button" onClick={() => void practice.playAbx("x")} disabled={!ready || busy}>
          {practice.playing === "abx_x" ? "X 듣는 중…" : "X 듣기"}
        </button>
        <div className="stack" role="group" aria-label="X와 같은 소리">
          {(["A", "B"] as const).map((side) => (
            <button
              key={side}
              type="button"
              aria-pressed={abx.result ? abx.result.xWas === side : false}
              disabled={!ready || !abx.heard.x || Boolean(abx.result)}
              onClick={() => void practice.answerAbx(side)}
            >
              {side}와 같아요
            </button>
          ))}
        </div>
        {!abx.heard.x && ready && !abx.result ? <p className="small">X까지 들은 뒤에 고를 수 있어요.</p> : null}
        {abx.result ? (
          <div className="feedback" role="status">
            <strong>{abx.result.correct ? "같은 소리를 찾았어요." : "한 번 더 나란히 들어 봐요."}</strong>
            <p>
              A는 {abx.result.a.text}, B는 {abx.result.b.text}였어요. X는 {abx.result.xWas}와 같은 소리예요.
            </p>
          </div>
        ) : null}
        <p className="small">
          이 활동은 듣고 세 소리 중 고르는 기록과 따로 남아요.
          {abx.done > 0 ? ` 지금까지 ${abx.done}번 비교했어요.` : ""}
        </p>
        {abx.result ? (
          <button type="button" onClick={() => void practice.newAbx()}>
            새 비교 듣기
          </button>
        ) : null}
        <Link className="button primary" to="/practice">
          듣기 퀴즈로 돌아가기
        </Link>
      </section>
    </LearnerFrame>
  );
}
