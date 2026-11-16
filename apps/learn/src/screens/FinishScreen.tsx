import { Link } from "react-router";
import { LearnerFrame, Pill, ScreenTitle } from "../ui";

export function FinishScreen() {
  return (
    <LearnerFrame>
      <ScreenTitle title="연습 마무리" />
      <section className="panel stack" aria-labelledby="finish-title">
        <div>
          <p className="eyebrow">마무리 자리</p>
          <h2 id="finish-title">
            오늘의 연습은
            <br />
            아직 집계하지 않아요.
          </h2>
        </div>
        <p className="muted">모음 사이의 ㅈ · ㅊ · ㅉ를 연습할 자리입니다. 마친 문항 수와 맞힌 수는 없습니다.</p>
        <p className="notice" role="status">
          음원과 학습 기록이 연결되기 전에는 연습을 마쳤다고 표시하지 않습니다.
        </p>
        <Link className="button primary" to="/">
          듣기 화면으로
        </Link>
        <div className="divider">
          <div className="row">
            <h3>이 소리, 단어에서는?</h3>
            <Pill tone="future">확장 자리</Pill>
          </div>
          <p className="muted">승인된 단어가 없어 뜻과 예문을 열 수 없습니다.</p>
          <Link className="text-link" to="/dictionary">
            사전·예문 자리 보기
          </Link>
        </div>
      </section>
    </LearnerFrame>
  );
}
