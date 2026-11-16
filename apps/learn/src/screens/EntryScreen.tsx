import { ScreenTitle } from "../ui";

export function EntryScreen() {
  return (
    <section className="panel stack" aria-labelledby="entry-title">
      <ScreenTitle title="소리 연습" />
      <p className="eyebrow">공통 학습 주소</p>
      <h2 id="entry-title">연결된 연습이 없습니다.</h2>
      <p className="muted">교사에게 받은 개인 링크로 시작해 주세요. 별칭만으로는 이 브라우저에 연결하지 않습니다.</p>
      <p className="notice" role="status">
        이 단계에는 기기 세션이 없습니다. 공통 주소만으로는 듣기 퀴즈가 열리지 않습니다.
      </p>
    </section>
  );
}
