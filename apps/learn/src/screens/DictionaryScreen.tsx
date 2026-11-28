import { Link } from "react-router";
import { LearnerFrame, Pill, ScreenTitle } from "../ui";

export function DictionaryScreen() {
  return (
    <LearnerFrame>
      <ScreenTitle title="사전·예문" />
      <section className="panel stack" aria-labelledby="dictionary-title">
        <div className="row">
          <Link className="text-link" to="/">
            ← 듣기 퀴즈
          </Link>
          <Pill tone="future">사전·예문 확장 자리</Pill>
        </div>
        <div>
          <p className="small">학습용 뜻·예문 · 승인 전</p>
          <h2 id="dictionary-title" className="dict-word">
            단어 자리
          </h2>
        </div>
        <div className="definition">
          <p className="small">뜻</p>
          <p>검수 전이라 뜻을 표시하지 않습니다.</p>
        </div>
        <button type="button" disabled>
          단어 듣기 · 준비 중
        </button>
        <div className="example">
          <p className="small">예문</p>
          <p>검수 전이라 예문을 표시하지 않습니다.</p>
        </div>
        <button type="button" disabled>
          예문 듣기 · 준비 중
        </button>
        <div>
          <h3>내 단어</h3>
          <p className="muted">담기 기능은 아직 연결되지 않았습니다.</p>
        </div>
        <button type="button" disabled>
          내 단어에 담기 · 준비 중
        </button>
        <p className="small">이 화면은 확장 경로의 껍데기입니다. 승인 전에는 학습 기능으로 열지 않습니다.</p>
      </section>
    </LearnerFrame>
  );
}
