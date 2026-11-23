import { useEffect, type ReactNode } from "react";
import { Link } from "react-router";
import { COURSE_ORDER, GROUP_LABELS, PRACTICE_READY_GROUPS } from "../content/course-order.ts";

export function ScreenTitle({ title }: { title: string }) {
  useEffect(() => {
    document.title = `${title} · 해온`;
  }, [title]);
  return null;
}

export function Pill({ children, tone = "now" }: { children: ReactNode; tone?: "now" | "future" }) {
  return <span className={tone === "future" ? "pill future" : "pill"}>{children}</span>;
}

function CourseMini() {
  return (
    <div className="rail-block">
      <h3>학습 순서</h3>
      <ol className="course-mini">
        {COURSE_ORDER.map((id, index) => (
          <li key={id} className={PRACTICE_READY_GROUPS.includes(id) ? "is-now" : undefined}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            {GROUP_LABELS[id]}
            <small>{PRACTICE_READY_GROUPS.includes(id) ? "지금" : "준비 중"}</small>
          </li>
        ))}
      </ol>
      <Link className="rail-link" to="/course">
        전체 순서 보기
      </Link>
    </div>
  );
}

export function LearnerFrame({
  children,
  preview = false,
  railExtra = null,
}: {
  children: ReactNode;
  preview?: boolean;
  railExtra?: ReactNode;
}) {
  return (
    <div className="workspace">
      <div className="stage">{children}</div>
      <aside className="rail">
        <div className="rail-block">
          <p className="eyebrow">작은 연습, 한 묶음씩</p>
          <h3>오늘은 {PRACTICE_READY_GROUPS[0] ? GROUP_LABELS[PRACTICE_READY_GROUPS[0]] : "소리 연습"}</h3>
          <ol>
            <li>
              <span>01</span> 듣고 하나 고르기
            </li>
            <li>
              <span>02</span> 답을 확인하고 비교하기
            </li>
            <li>
              <span>03</span> 헷갈린 소리 다시 만나기
            </li>
          </ol>
        </div>
        <div className="rail-block">
          <h3>필요할 때 비교해요</h3>
          <p>
            {preview
              ? "글자 없이 소리만으로 비교하고 싶을 때 들어 봐요."
              : "글자보다 소리로 비교하고 싶다면 A · B · X를 들어 볼 자리입니다. 음원은 아직 없습니다."}
          </p>
          <Link className="rail-link" to="/compare">
            두 소리 비교 열기
          </Link>
        </div>
        {preview ? <CourseMini /> : null}
        {railExtra}
        <div>
          <h3>소리가 단어로 이어져요</h3>
          <p>{preview ? "뜻을 찾고, 생활 속 예문으로 쓰임을 확인해요." : "뜻과 예문은 승인 전에 보여 주지 않습니다."}</p>
          <Link className="rail-link" to="/dictionary">
            {preview ? "사전·예문 보기" : "사전·예문 자리"}
          </Link>
        </div>
      </aside>
    </div>
  );
}
