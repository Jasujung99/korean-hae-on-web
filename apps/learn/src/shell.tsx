import type { ReactNode } from "react";
import { Link, useLocation } from "react-router";
import { BrandMark } from "./brand";
import { useLearner } from "./preview/settings";
import { originStatus, type LearnRuntime } from "./runtime";

function LearnerNav({ place, live }: { place: "head" | "bottom"; live: boolean }) {
  const location = useLocation();
  const { style, status } = useLearner();
  if (live && status !== "connected") return null;
  if (live && style === "canvas") {
    const tabs = [
      { to: "/dictionary", label: "내 말" },
      { to: "/listen", label: "다시" },
      { to: "/course", label: "발견" },
      { to: "/settings", label: "설정" },
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
  const course = location.pathname.startsWith("/course");
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
      {live ? (
        <Link to="/course" aria-current={course ? "page" : undefined}>
          학습 순서
        </Link>
      ) : null}
      {live ? (
        <Link to="/settings" aria-current={location.pathname.startsWith("/settings") ? "page" : undefined}>
          설정
        </Link>
      ) : null}
    </nav>
  );
}

export function Shell({ runtime, children }: { runtime: LearnRuntime; children: ReactNode }) {
  const location = useLocation();
  const teacherRoute = location.pathname.startsWith("/teach");
  const live = runtime.accounts;
  const teacherLive = teacherRoute && live;
  const learner = useLearner();
  const canvas = live && learner.style === "canvas" && !teacherRoute && learner.status === "connected";
  let avatar = "연결 전";
  if (teacherRoute) avatar = "교사";
  else if (learner.status === "connected" && learner.me) avatar = `${learner.me.learner.nickname} 님`;

  return (
    <div
      className="page"
      data-ready={runtime.ready ? "true" : "false"}
      data-preview={runtime.screenPreview ? "on" : "off"}
    >
      <a className="skip" href="#content">
        본문으로
      </a>
      <div className={teacherLive ? "window is-teacher" : canvas ? "window style-canvas" : "window"}>
        <h1 className="visually-hidden">해온 소리 연습</h1>
        <header className="app-head">
          <div className="wordmark">
            <BrandMark />
            <p className="brand-sub">소리에서 단어까지</p>
          </div>
          {teacherRoute ? null : <LearnerNav place="head" live={live} />}
          <p className="avatar">{avatar}</p>
        </header>
        <main id="content">{children}</main>
        {teacherRoute ? null : <LearnerNav place="bottom" live={live} />}
        <footer className="app-footer">
          <span lang="en">At ease. As yourself.</span>
          <span lang="en">haeon · Your voice, in Korean.</span>
          <p className="origin-line">{originStatus(runtime)}</p>
        </footer>
      </div>
    </div>
  );
}
