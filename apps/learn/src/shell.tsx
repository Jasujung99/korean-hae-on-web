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

function LearnerNav({ place }: { place: "head" | "bottom" }) {
  const location = useLocation();
  const dictionary = location.pathname.startsWith("/dictionary");
  const quiz =
    location.pathname === "/" || location.pathname === "/compare" || location.pathname === "/finish";

  return (
    <nav className={place === "bottom" ? "bottom-nav" : undefined} aria-label={place === "head" ? "학습 메뉴" : "학습 메뉴 아래"}>
      <Link to="/" aria-current={quiz ? "page" : undefined}>
        듣기 퀴즈
      </Link>
      <Link to="/dictionary" aria-current={dictionary ? "page" : undefined}>
        사전·예문 <span className="pill future">확장</span>
      </Link>
    </nav>
  );
}

export function Shell({ runtime, children }: { runtime: LearnRuntime; children: ReactNode }) {
  const location = useLocation();
  const teacherRoute = location.pathname.startsWith("/teach");
  const teacherPreview = teacherRoute && runtime.screenPreview;

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
          <LearnerNav place="head" />
          <p className="avatar">{teacherPreview ? "관찰 미리보기" : "연결 전"}</p>
        </header>
        <main id="content">{children}</main>
        <LearnerNav place="bottom" />
        <footer className="app-footer">
          <span lang="en">At ease. As yourself.</span>
          <span lang="en">haeon · Your voice, in Korean.</span>
          <p className="origin-line">{originStatus(runtime)}</p>
        </footer>
      </div>
    </div>
  );
}
