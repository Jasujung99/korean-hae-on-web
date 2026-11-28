// 개인 초대 첫 방문. 주소의 토큰은 바로 지우고 메모리에만 둔다.
// 화면을 여는 것과 확인(inspect)으로는 초대를 소비하지 않는다. '이 기기에서 시작하기'를 눌러야 연결된다.
import { useEffect, useRef, useState, type ReactNode } from "react";
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
      <h2 id="join-title">{inspect.nickname} 님</h2>
      <p className="muted">이름이 다르면 시작하지 말고 선생님에게 알려 주세요.</p>
      {/* 사전 언어는 여기서 고르지 않는다. 선생님이 정한 값(없으면 러시아어)으로 연결하고, 바꾸기는 설정에서 한다. */}
      <div className="join-notes">
        <p className="join-notes-title">시작하기 전에</p>
        <ul>
          <li>
            <BrowserIcon />
            <span>앞으로 계속 쓸 브라우저(Chrome, Safari 등)에서 열어 주세요.</span>
          </li>
          <li>
            <OpenOutIcon />
            <span>메신저 안에서 열렸다면, 브라우저로 옮겨서 열어 주세요.</span>
          </li>
          <li>
            <OnceIcon />
            <span>이 링크는 한 번만 쓸 수 있어요.</span>
          </li>
        </ul>
      </div>
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

// 안내 줄 앞의 선 아이콘(장식). 글자로 뜻이 다 전해지므로 화면 읽기 프로그램에는 숨긴다.
function NoteIcon({ children }: { children: ReactNode }) {
  return (
    <svg className="join-notes-icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
      {children}
    </svg>
  );
}

/** 브라우저 창 */
function BrowserIcon() {
  return (
    <NoteIcon>
      <rect x="3" y="4.5" width="18" height="15" rx="2" />
      <path d="M3 9h18" />
      <path d="M6 6.75h.01M8.5 6.75h.01" />
    </NoteIcon>
  );
}

/** 밖으로 옮겨 열기 */
function OpenOutIcon() {
  return (
    <NoteIcon>
      <path d="M14 4h6v6" />
      <path d="M20 4l-9 9" />
      <path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4" />
    </NoteIcon>
  );
}

/** 한 번 쓰는 링크 */
function OnceIcon() {
  return (
    <NoteIcon>
      <path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1" />
      <path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1" />
    </NoteIcon>
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
