// 개인 초대 첫 방문. 주소의 토큰은 바로 지우고 메모리에만 둔다.
// 화면을 여는 것과 확인(inspect)으로는 초대를 소비하지 않는다. '이 기기에서 시작하기'를 눌러야 연결된다.
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import type { DictLanguage, InviteInspectView } from "../../../server/preview/contract.ts";
import { captureInviteToken, peekInviteToken, resetInviteTokenMemory } from "../../join-token";
import { accountApi, makeId, PreviewApiError } from "../../preview/api";
import { useLearner } from "../../preview/settings";
import { resetTelemetry } from "../../preview/telemetry";
import { ScreenTitle } from "../../ui";

const UNAVAILABLE: Record<string, string> = {
  used: "이미 다른 기기에서 쓴 링크예요.",
  expired: "기간이 지난 링크예요.",
  revoked: "더는 쓸 수 없는 링크예요.",
  invalid: "확인할 수 없는 링크예요.",
};

export function JoinLive() {
  const navigate = useNavigate();
  const learner = useLearner();
  const [present] = useState(() => captureInviteToken().present);
  const [inspect, setInspect] = useState<InviteInspectView | null>(null);
  const [failed, setFailed] = useState(false);
  const [dict, setDict] = useState<DictLanguage>("ru");
  const [busy, setBusy] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  const claimKey = useRef(makeId());

  useEffect(() => {
    const token = peekInviteToken();
    if (!token) return;
    accountApi
      .inspect(token)
      .then((view) => {
        setInspect(view);
        if (view.dictLanguage) setDict(view.dictLanguage);
      })
      .catch(() => setFailed(true));
  }, []);

  const otherLearner = learner.status === "connected" && learner.me && inspect?.nickname && learner.me.learner.nickname !== inspect.nickname;

  const start = async () => {
    const token = peekInviteToken();
    if (!token) return;
    if (otherLearner && !window.confirm(`이 기기는 지금 ${learner.me?.learner.nickname} 님으로 연결돼 있어요. ${inspect?.nickname} 님으로 바꿀까요?`)) {
      return;
    }
    setBusy(true);
    setClaimError(null);
    try {
      const me = await accountApi.claim(token, claimKey.current, dict);
      resetInviteTokenMemory();
      resetTelemetry();
      learner.adopt(me);
      navigate("/practice", { replace: true });
    } catch (error) {
      const code = error instanceof PreviewApiError ? error.code : null;
      setClaimError(code && UNAVAILABLE[code] ? UNAVAILABLE[code] : "연결하지 못했어요. 잠시 뒤 같은 버튼을 다시 눌러 주세요.");
    } finally {
      setBusy(false);
    }
  };

  if (!present) {
    return (
      <section className="panel stack acct-narrow" aria-labelledby="join-title">
        <ScreenTitle title="개인 초대" />
        <p className="eyebrow">개인 초대</p>
        <h2 id="join-title">초대 링크가 비어 있어요.</h2>
        <p className="muted">선생님에게 받은 개인 링크를 다시 열어 주세요.</p>
        {learner.status === "connected" ? (
          <Link className="button primary" to="/practice">
            {learner.me?.learner.nickname} 님 연습으로
          </Link>
        ) : null}
      </section>
    );
  }

  if (failed || (inspect && inspect.status !== "ok")) {
    return (
      <section className="panel stack acct-narrow" aria-labelledby="join-title">
        <ScreenTitle title="개인 초대" />
        <p className="eyebrow">개인 초대</p>
        <h2 id="join-title">{failed ? "링크를 확인하지 못했어요." : UNAVAILABLE[inspect?.status ?? "invalid"]}</h2>
        <p className="muted">
          {failed ? "인터넷 연결을 확인하고 링크를 다시 열어 주세요." : "선생님에게 새 링크를 요청해 주세요."}
        </p>
        {learner.status === "connected" ? (
          <Link className="button" to="/practice">
            {learner.me?.learner.nickname} 님 연습으로 돌아가기
          </Link>
        ) : null}
      </section>
    );
  }

  if (!inspect) {
    return (
      <section className="panel stack acct-narrow">
        <ScreenTitle title="개인 초대" />
        <p className="muted">링크를 확인하고 있어요…</p>
      </section>
    );
  }

  return (
    <section className="panel stack acct-narrow" aria-labelledby="join-title">
      <ScreenTitle title="개인 초대" />
      <p className="eyebrow">개인 초대</p>
      <h2 id="join-title">{inspect.nickname} 님의 연습이에요.</h2>
      <p className="muted">이름이 다르면 시작하지 말고 선생님에게 알려 주세요.</p>
      <fieldset className="acct-choice">
        <legend>사전에서 볼 언어</legend>
        <div className="mode-nav">
          <button type="button" aria-pressed={dict === "ru"} onClick={() => setDict("ru")}>
            Русский
          </button>
          <button type="button" aria-pressed={dict === "en"} onClick={() => setDict("en")}>
            English
          </button>
        </div>
        <p className="small">나중에 설정에서 바꿀 수 있어요.</p>
      </fieldset>
      <p className="small">
        계속 쓸 브라우저(Chrome, Safari 등)에서 열었는지 확인해 주세요. 메신저 안에서 열었다면, 시작하기 전에 브라우저로 옮겨 여는 것이
        좋아요. 링크는 한 번만 쓸 수 있어요.
      </p>
      {claimError ? (
        <p className="acct-error" role="alert">
          {claimError}
        </p>
      ) : null}
      <button type="button" className="primary" disabled={busy} onClick={() => void start()}>
        {busy ? "연결하는 중…" : "이 기기에서 시작하기"}
      </button>
    </section>
  );
}

/** 연결되지 않은 기기의 학습 주소. 별칭만으로 연결하지 않는다. */
export function NotConnected() {
  return (
    <section className="panel stack acct-narrow" aria-labelledby="not-connected-title">
      <ScreenTitle title="연결 전" />
      <p className="eyebrow">해온 소리 연습</p>
      <h2 id="not-connected-title">연결된 연습이 없어요.</h2>
      <p className="muted">선생님에게 받은 개인 링크로 처음 한 번 들어와 주세요. 그다음부터는 이 주소에서 바로 이어져요.</p>
      <p className="small">링크를 잃어버렸거나 기간이 지났다면 선생님에게 새 링크를 요청해 주세요.</p>
    </section>
  );
}
