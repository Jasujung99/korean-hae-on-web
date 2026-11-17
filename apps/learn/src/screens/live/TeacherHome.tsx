// 교사 화면: 로그인 → 학습자 관리(추가·초대 링크·재발급·폐기·기기 해제) → 학습 관찰 목록.
// 교사 인증과 담당 학습자 확인은 서버가 한다. 초대 링크 원문은 만들 때 한 번만 보여 준다.
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link } from "react-router";
import type { DictLanguage, InviteIssued, TeacherLearnerRow, TeacherView } from "../../../server/preview/contract.ts";
import { PreviewApiError, teacherApi } from "../../preview/api";
import { ScreenTitle } from "../../ui";
import { formatDay } from "./format";
import { ListView } from "./TeacherObserve";

type GateState = { kind: "loading" } | { kind: "login" } | { kind: "error" } | { kind: "ready"; view: TeacherView };

const INVITE_LABEL: Record<TeacherLearnerRow["invite"]["status"], string> = {
  none: "초대 전",
  open: "링크 전달 대기",
  used: "연결됨",
  expired: "링크 만료",
  revoked: "링크 폐기",
};

function useTeacherView() {
  const [state, setState] = useState<GateState>({ kind: "loading" });
  const load = useCallback(() => {
    teacherApi
      .learners()
      .then((view) => setState({ kind: "ready", view }))
      .catch((error: unknown) =>
        setState(error instanceof PreviewApiError && error.status === 401 ? { kind: "login" } : { kind: "error" }),
      );
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  return { state, load };
}

function TeacherLogin({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!email.trim() || !password) {
      setMessage("이메일과 비밀번호를 넣어 주세요.");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await teacherApi.login(email.trim(), password);
      setPassword("");
      onDone();
    } catch (error) {
      const code = error instanceof PreviewApiError ? error.code : null;
      setMessage(
        code === "not_a_teacher"
          ? "이 계정에는 교사 권한이 없어요. 관리자에게 교사 등록을 요청해 주세요."
          : code === "too_many_attempts"
            ? "시도가 너무 많았어요. 10분 뒤에 다시 해 주세요."
            : "이메일이나 비밀번호가 맞지 않아요.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel stack acct-narrow" aria-labelledby="teacher-login-title">
      <ScreenTitle title="교사 로그인" />
      <p className="eyebrow">교사</p>
      <h2 id="teacher-login-title">교사 로그인</h2>
      <p className="muted">담당 학습자의 기록을 보고 초대 링크를 만들 수 있어요.</p>
      <form className="stack" onSubmit={(event) => void submit(event)} noValidate>
        <label className="acct-field">
          <span>이메일</span>
          <input type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} />
        </label>
        <label className="acct-field">
          <span>비밀번호</span>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        {message ? (
          <p className="acct-error" role="alert">
            {message}
          </p>
        ) : null}
        <button type="submit" className="primary" disabled={busy}>
          {busy ? "확인하는 중…" : "로그인"}
        </button>
      </form>
    </section>
  );
}

/** 교사 로그인이 필요한 화면을 감싼다. */
export function TeacherGate({ children }: { children: (view: TeacherView, reload: () => void) => ReactNode }) {
  const { state, load } = useTeacherView();
  if (state.kind === "loading") return <p className="tc-label">교사 화면을 여는 중이에요…</p>;
  if (state.kind === "login") return <TeacherLogin onDone={load} />;
  if (state.kind === "error") {
    return (
      <section className="panel stack">
        <h2>교사 화면을 열지 못했어요.</h2>
        <p className="muted">서버나 DB 연결을 확인한 뒤 다시 시도해 주세요.</p>
        <button type="button" onClick={load}>
          다시 시도
        </button>
      </section>
    );
  }
  return <>{children(state.view, load)}</>;
}

function IssuedLink({ issued, nickname, onClose }: { issued: InviteIssued; nickname: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(issued.url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div className="acct-issued" role="status">
      <p>
        <b>{nickname}</b> 님의 초대 링크예요. 평소 쓰는 메신저로 보내 주세요. 한 번만 쓸 수 있고 {formatDay(issued.expiresAt)}까지
        유효해요. 이 링크는 지금 한 번만 보여 줘요.
      </p>
      <input className="acct-link" readOnly value={issued.url} onFocus={(event) => event.currentTarget.select()} aria-label="초대 링크" />
      <div className="row">
        <button type="button" className="primary" onClick={() => void copy()}>
          {copied ? "복사했어요" : "링크 복사"}
        </button>
        <button type="button" onClick={onClose}>
          닫기
        </button>
      </div>
    </div>
  );
}

function AddLearner({ onAdded }: { onAdded: () => void }) {
  const [nickname, setNickname] = useState("");
  const [classLabel, setClassLabel] = useState("");
  const [homeLanguage, setHomeLanguage] = useState<"ru" | "">("ru");
  const [dictLanguage, setDictLanguage] = useState<DictLanguage>("ru");
  const [isTest, setIsTest] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!nickname.trim()) {
      setMessage("별칭을 넣어 주세요.");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await teacherApi.addLearner({
        nickname: nickname.trim(),
        classLabel: classLabel.trim(),
        homeLanguage: homeLanguage || null,
        dictLanguage,
        isTest,
      });
      setNickname("");
      setClassLabel("");
      setIsTest(false);
      onAdded();
    } catch {
      setMessage("학습자를 추가하지 못했어요. 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="acct-add" onSubmit={(event) => void submit(event)} noValidate aria-label="학습자 추가">
      <label className="acct-field">
        <span>별칭</span>
        <input value={nickname} maxLength={40} onChange={(event) => setNickname(event.target.value)} placeholder="알렉세이" />
      </label>
      <label className="acct-field">
        <span>반</span>
        <input value={classLabel} maxLength={40} onChange={(event) => setClassLabel(event.target.value)} placeholder="화목 저녁반" />
      </label>
      <label className="acct-field">
        <span>모어</span>
        <select value={homeLanguage} onChange={(event) => setHomeLanguage(event.target.value === "ru" ? "ru" : "")}>
          <option value="ru">러시아어</option>
          <option value="">기록 안 함</option>
        </select>
      </label>
      <label className="acct-field">
        <span>사전 언어</span>
        <select value={dictLanguage} onChange={(event) => setDictLanguage(event.target.value === "en" ? "en" : "ru")}>
          <option value="ru">Русский</option>
          <option value="en">English</option>
        </select>
      </label>
      <label className="acct-check">
        <input type="checkbox" checked={isTest} onChange={(event) => setIsTest(event.target.checked)} />
        <span>시험용 학습자</span>
      </label>
      <button type="submit" className="primary" disabled={busy}>
        {busy ? "추가하는 중…" : "학습자 추가"}
      </button>
      {message ? (
        <p className="acct-error" role="alert">
          {message}
        </p>
      ) : null}
    </form>
  );
}

function RosterRow({
  row,
  onChanged,
  onIssued,
}: {
  row: TeacherLearnerRow;
  onChanged: () => void;
  onIssued: (issued: InviteIssued, nickname: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const run = async (work: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await work();
    } finally {
      setBusy(false);
      onChanged();
    }
  };
  const invite = () =>
    run(async () => {
      const issued = await teacherApi.invite(row.id);
      onIssued(issued, row.nickname);
    });
  const status = row.invite.status;

  return (
    <tr>
      <th scope="row">
        {row.nickname}
        {row.isTest ? <span className="tc-pill">시험</span> : null}
        {row.classLabel ? <small className="acct-sub">{row.classLabel}</small> : null}
      </th>
      <td data-label="모어">
        <select
          aria-label={`${row.nickname} 모어`}
          value={row.homeLanguage ?? ""}
          disabled={busy}
          onChange={(event) => void run(() => teacherApi.updateLearner(row.id, { homeLanguage: event.target.value === "ru" ? "ru" : null }))}
        >
          <option value="ru">러시아어</option>
          <option value="">기록 안 함</option>
        </select>
      </td>
      <td data-label="사전 언어">
        <select
          aria-label={`${row.nickname} 사전 언어`}
          value={row.dictLanguage}
          disabled={busy}
          onChange={(event) =>
            void run(() => teacherApi.updateLearner(row.id, { dictLanguage: event.target.value === "en" ? "en" : "ru" }))
          }
        >
          <option value="ru">Русский</option>
          <option value="en">English</option>
        </select>
      </td>
      <td data-label="초대">
        {INVITE_LABEL[status]}
        {status === "open" && row.invite.expiresAt ? <small className="acct-sub">{formatDay(row.invite.expiresAt)}까지</small> : null}
      </td>
      <td data-label="연결된 기기" className="num">
        {row.devices}대
      </td>
      <td data-label="마지막 학습">{row.summary.lastActive ? formatDay(row.summary.lastActive) : "기록 없음"}</td>
      <td className="acct-actions">
        <button type="button" disabled={busy} onClick={() => void invite()}>
          {status === "none" ? "초대 링크 만들기" : "링크 새로 만들기"}
        </button>
        {status === "open" ? (
          <button type="button" disabled={busy} onClick={() => void run(() => teacherApi.revokeInvites(row.id))}>
            링크 폐기
          </button>
        ) : null}
        {row.devices > 0 ? (
          <button
            type="button"
            className="ghost-danger"
            disabled={busy}
            onClick={() => {
              if (!window.confirm(`${row.nickname} 님의 기기 연결 ${row.devices}대를 모두 끊을까요? 학습 기록은 남아요.`)) return;
              void run(() => teacherApi.revokeDevices(row.id));
            }}
          >
            기기 연결 끊기
          </button>
        ) : null}
        <Link className="tc-ul" to={`/teach/detail?learner=${encodeURIComponent(row.id)}`}>
          기록 보기
        </Link>
      </td>
    </tr>
  );
}

function Roster({ view, reload }: { view: TeacherView; reload: () => void }) {
  const [issued, setIssued] = useState<{ issued: InviteIssued; nickname: string } | null>(null);
  return (
    <section className="acct-roster" aria-labelledby="roster-title">
      <h3 id="roster-title">학습자 관리</h3>
      <AddLearner onAdded={reload} />
      {issued ? <IssuedLink issued={issued.issued} nickname={issued.nickname} onClose={() => setIssued(null)} /> : null}
      {view.learners.length === 0 ? (
        <p className="muted">아직 학습자가 없어요. 위에서 별칭을 넣고 추가한 뒤 초대 링크를 만들어 주세요.</p>
      ) : (
        <div className="tc-table-wrap">
          <table className="tc-table acct-table">
            <caption className="visually-hidden">담당 학습자와 초대 상태</caption>
            <thead>
              <tr>
                <th scope="col">학습자</th>
                <th scope="col">모어</th>
                <th scope="col">사전 언어</th>
                <th scope="col">초대</th>
                <th scope="col" className="num">
                  연결된 기기
                </th>
                <th scope="col">마지막 학습</th>
                <th scope="col">
                  <span className="visually-hidden">할 일</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {view.learners.map((row) => (
                <RosterRow key={row.id} row={row} onChanged={reload} onIssued={(next, nickname) => setIssued({ issued: next, nickname })} />
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="small">
        초대 링크는 72시간 동안 한 번만 쓸 수 있어요. 새로 만들면 쓰지 않은 이전 링크는 바로 막혀요. 링크를 받은 사람이 실제 학습자인지는
        전달 과정에 달려 있어요. 초대 주소: {view.inviteOrigin}
      </p>
    </section>
  );
}

export function TeacherHome() {
  return (
    <div className="tc-page">
      <ScreenTitle title="교사 화면" />
      <TeacherGate>
        {(view, reload) => (
          <>
            <TeacherBar name={view.teacher.displayName} />
            <Roster view={view} reload={reload} />
            <ListView learners={view.learners.map((row) => row.summary)} />
          </>
        )}
      </TeacherGate>
    </div>
  );
}

export function TeacherBar({ name }: { name: string }) {
  const logout = async () => {
    try {
      await teacherApi.logout();
    } finally {
      window.location.assign("/teach");
    }
  };
  return (
    <div className="acct-bar">
      <span>{name} 선생님</span>
      <Link className="tc-ul" to="/teach/voices">
        목소리 표본
      </Link>
      <button type="button" onClick={() => void logout()}>
        로그아웃
      </button>
    </div>
  );
}
