import type { ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { BrandMark } from "./brand";
import { usePreviewSettings } from "./preview/settings";
import { originStatus, type LearnRuntime } from "./runtime";

function PreviewSwitch({ teacherRoute }: { teacherRoute: boolean }) {
  const navigate = useNavigate();
  const settings = usePreviewSettings();

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
      <div className="roles" role="group" aria-label="화면 스타일">
        <button type="button" aria-pressed={settings.style === "proto"} onClick={() => settings.change({ style: "proto" })}>
          시안 스타일
        </button>
        <button type="button" aria-pressed={settings.style === "canvas"} onClick={() => settings.change({ style: "canvas" })}>
          캔버스 스타일
        </button>
      </div>
      <div className="roles" role="group" aria-label="의사단어 소리 방식">
        <button type="button" aria-pressed={settings.sound === "file"} onClick={() => settings.change({ sound: "file" })}>
          고정 음원
        </button>
        <button type="button" aria-pressed={settings.sound === "browser"} onClick={() => settings.change({ sound: "browser" })}>
          브라우저 음성
        </button>
      </div>
      <div className="roles" role="group" aria-label="듣고 고르기 문항">
        <button type="button" aria-pressed={settings.items === "word"} onClick={() => settings.change({ items: "word" })}>
          낱말 대립쌍
        </button>
        <button type="button" aria-pressed={settings.items === "pseudo"} onClick={() => settings.change({ items: "pseudo" })}>
          의사단어
        </button>
      </div>
      <small>역할 전환은 교사 인증이 아닙니다.</small>
    </div>
  );
}

function LearnerNav({ place, preview }: { place: "head" | "bottom"; preview: boolean }) {
  const location = useLocation();
  const { style } = usePreviewSettings();
  if (preview && style === "canvas") {
    const tabs = [
      { to: "/dictionary", label: "내 말" },
      { to: "/listen", label: "다시" },
      { to: "/course", label: "발견" },
    ];
    return (
      <nav className={place === "bottom" ? "bottom-nav index-tabs" : "index-tabs"} aria-label={place === "head" ? "내 공책" : "내 공책 아래"}>
        {tabs.map((tab) => (
          <Link key={tab.to} to={tab.to} aria-current={location.pathname.startsWith(tab.to) ? "page" : undefined}>
            {tab.label}
          </Link>
        ))}
      </nav>
    );
  }
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
  const { style } = usePreviewSettings();
  const canvas = runtime.screenPreview && style === "canvas" && !teacherRoute;
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
      <div className={teacherPreview ? "window is-teacher" : canvas ? "window style-canvas" : "window"}>
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
