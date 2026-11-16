import { useState } from "react";
import { captureInviteToken } from "../join-token";
import { ScreenTitle } from "../ui";

export function JoinScreen() {
  const [present] = useState(() => captureInviteToken().present);

  return (
    <section className="panel stack" aria-labelledby="join-title">
      <ScreenTitle title="개인 초대" />
      <p className="eyebrow">개인 초대</p>
      <h2 id="join-title">{present ? "이 기기에서 시작할 준비입니다." : "초대 토큰이 없습니다."}</h2>
      <p className="muted">
        {present
          ? "주소창의 토큰은 지웠고, 이 화면의 메모리에만 두었습니다. 서버로는 보내지 않습니다."
          : "교사에게 받은 개인 링크를 다시 열어 주세요. 별칭만으로는 시작하지 않습니다."}
      </p>
      <p className="small">계속 사용할 브라우저에서 열어 주세요. 메신저 안 미리보기로는 연결되지 않습니다.</p>
      <button type="button" className="primary" disabled>
        이 기기에서 시작하기
      </button>
      <p className="notice" role="status">
        시작 버튼은 아직 서버를 호출하지 않습니다. 초대를 소비하지 않습니다.
      </p>
    </section>
  );
}
