import { useEffect } from "react";
import { Link } from "react-router";
import { usePractice } from "../../preview/PracticeContext";
import { LearnerFrame, ScreenTitle } from "../../ui";

// 서버·기록은 A·B·X라는 이름을 그대로 쓰고, 화면에서만 차례 말로 바꿔 보여 준다.
const SIDE_LABEL = { A: "첫째", B: "둘째" } as const;

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
        <h2 id="compare-title">마지막 소리는 어느 쪽과 같나요?</h2>
        <p className="muted">첫째와 둘째 소리를 듣고, 마지막 소리와 비교해요.</p>
        <div className="choices compare-choices">
          <button type="button" onClick={() => void practice.playAbx("a")} disabled={!ready || busy}>
            {practice.playing === "abx_a" ? "첫째 소리 듣는 중…" : "첫째 소리 듣기"}
          </button>
          <button type="button" onClick={() => void practice.playAbx("b")} disabled={!ready || busy}>
            {practice.playing === "abx_b" ? "둘째 소리 듣는 중…" : "둘째 소리 듣기"}
          </button>
        </div>
        <button type="button" onClick={() => void practice.playAbx("x")} disabled={!ready || busy}>
          {practice.playing === "abx_x" ? "마지막 소리 듣는 중…" : "마지막 소리 듣기"}
        </button>
        <div className="stack" role="group" aria-label="마지막 소리와 같은 소리">
          {(["A", "B"] as const).map((side) => (
            <button
              key={side}
              type="button"
              aria-pressed={abx.result ? abx.result.xWas === side : false}
              disabled={!ready || !abx.heard.x || Boolean(abx.result)}
              onClick={() => void practice.answerAbx(side)}
            >
              {SIDE_LABEL[side]} 소리와 같아요
            </button>
          ))}
        </div>
        {!abx.heard.x && ready && !abx.result ? <p className="small">마지막 소리까지 들은 뒤에 고를 수 있어요.</p> : null}
        {abx.result ? (
          <div className="feedback" role="status">
            <strong>{abx.result.correct ? "같은 소리를 찾았어요." : "한 번 더 나란히 들어 봐요."}</strong>
            <p>
              첫째는 {abx.result.a.text}, 둘째는 {abx.result.b.text}였어요. 마지막 소리는 {SIDE_LABEL[abx.result.xWas]} 소리와 같아요.
            </p>
          </div>
        ) : null}
        {abx.done > 0 ? <p className="small">지금까지 {abx.done}번 비교했어요.</p> : null}
        {abx.result ? (
          <button type="button" onClick={() => void practice.newAbx()}>
            새 비교 듣기
          </button>
        ) : null}
        <Link className="button primary" to="/practice">
          듣고 고르기로 돌아가기
        </Link>
      </section>
    </LearnerFrame>
  );
}
