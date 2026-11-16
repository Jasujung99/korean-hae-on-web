import { Link } from "react-router";
import { ScreenTitle } from "../ui";

// 미리보기가 꺼진 서버의 교사 경로. 기록이 있는 관찰 화면은 미리보기의 TeacherLive가 맡는다.
export function TeacherLockedScreen() {
  return (
    <section className="panel stack" aria-labelledby="teacher-lock-title">
      <ScreenTitle title="교사 관찰" />
      <p className="eyebrow">교사 관찰</p>
      <h2 id="teacher-lock-title">교사 인증 전</h2>
      <p className="muted">
        담당 학습자의 기록은 교사 인증과 배정 뒤에 열립니다. 이 단계에는 로그인과 기록이 없습니다.
      </p>
      <p className="notice" role="status">
        주소만으로 기록이 열리지는 않습니다. 인증은 이후 단계에서 서버가 확인합니다. 역할 전환 버튼은 권한이 아닙니다.
      </p>
      <Link className="button primary" to="/">
        처음 화면으로
      </Link>
    </section>
  );
}
