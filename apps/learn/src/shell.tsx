import type { ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { BrandMark } from "./brand";
import { originStatus, type LearnRuntime } from "./runtime";

function PreviewSwitch({ teacherRoute }: { teacherRoute: boolean }) {
  const navigate = useNavigate();

  return (
    <div className="preview">
      <strong>개발 미리보기</strong>
      <div className="roles" role="group" aria-label="개발 미리보기 역할">
        <button type="button" aria-pressed={!teacherRoute} onClick={() => navigate("/")}>
          학습자
        </button>
        <button type="button" aria-pressed={teacherRoute} onClick={() => navigate("/teach")}>
          교사 관찰
        </button>
      </div>
      <small>역할 전환은 교사 인증이 아닙니다.</small>
    </div>
  );
}

function LearnerNav({ place, preview }: { place: "head" | "bottom"; preview: boolean }) {
  const location = useLocation();
  const dictionary = location.pathname.startsWith("/dictionary");
  const course = location.pathname.startsWith("/course") || location.pathname.startsWith("/voices");
  const quiz =
    location.pathname === "/practice" || location.pathname === "/compare" || location.pathname === "/finish";

  return (
    <nav className={place === "bottom" ? "bottom-nav" : undefined} aria-label={place === "head" ? "학습 메뉴" : "학습 메뉴 아래"}>
      <Link to="/practice" aria-current={quiz ? "page" : undefined}>
        듣기 퀴즈
      </Link>
      <Link to="/dictionary" aria-current={dictionary ? "page" : undefined}>
        사전·예문 <span className="pill future">확장</span>
      </Link>
      {preview ? (
        <Link to="/course" aria-current={course ? "page" : undefined}>
          학습 순서
        </Link>
      ) : null}
    </nav>
  );
}

export function Shell({ runtime, children }: { runtime: LearnRuntime; children: ReactNode }) {
  const location = useLocation();
  const teacherRoute = location.pathname.startsWith("/teach");
  const teacherPreview = teacherRoute && runtime.screenPreview;
  let avatar = "연결 전";
  if (teacherPreview) avatar = "관찰 미리보기";
  else if (runtime.screenPreview) avatar = "미리보기 학습자";

  return (
    <div
      className="page"
      data-ready={runtime.ready ? "true" : "false"}
      data-preview={runtime.screenPreview ? "on" : "off"}
    >
      <a className="skip" href="#content">
        본문으로
      </a>
      {runtime.screenPreview ? <PreviewSwitch teacherRoute={teacherRoute} /> : null}
      <div className={teacherPreview ? "window is-teacher" : "window"}>
        <h1 className="visually-hidden">해온 소리 연습</h1>
        <header className="app-head">
          <div className="wordmark">
            <BrandMark />
            <p className="brand-sub">소리에서 단어까지</p>
          </div>
          <LearnerNav place="head" preview={runtime.screenPreview} />
          <p className="avatar">{avatar}</p>
        </header>
        <main id="content">{children}</main>
        <LearnerNav place="bottom" preview={runtime.screenPreview} />
        <footer className="app-footer">
          <span lang="en">At ease. As yourself.</span>
          {runtime.screenPreview ? (
            <Link className="footer-link" to="/voices">
              목소리 표본 듣기
            </Link>
          ) : null}
          <span lang="en">haeon · Your voice, in Korean.</span>
          <p className="origin-line">{originStatus(runtime)}</p>
        </footer>
      </div>
    </div>
  );
}
