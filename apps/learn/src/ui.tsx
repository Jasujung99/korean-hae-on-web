import { useEffect, type ReactNode } from "react";
import { Link } from "react-router";

export function ScreenTitle({ title }: { title: string }) {
  useEffect(() => {
    document.title = `${title} · 해온`;
  }, [title]);
  return null;
}

export function Pill({ children, tone = "now" }: { children: ReactNode; tone?: "now" | "future" }) {
  return <span className={tone === "future" ? "pill future" : "pill"}>{children}</span>;
}

export function LearnerFrame({ children }: { children: ReactNode }) {
  return (
    <div className="workspace">
      <div className="stage">{children}</div>
      <aside className="rail">
        <div className="rail-block">
          <p className="eyebrow">작은 연습, 한 묶음씩</p>
          <h3>오늘은 ㅈ · ㅊ · ㅉ</h3>
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
          <p>글자보다 소리로 비교하고 싶다면 A · B · X를 들어 볼 자리입니다. 음원은 아직 없습니다.</p>
          <Link className="rail-link" to="/compare">
            두 소리 비교 열기
          </Link>
        </div>
        <div>
          <Pill tone="future">다음 확장</Pill>
          <h3>소리가 단어로 이어져요</h3>
          <p>뜻과 예문은 승인 전에 보여 주지 않습니다.</p>
          <Link className="rail-link" to="/dictionary">
            사전·예문 자리
          </Link>
        </div>
      </aside>
    </div>
  );
}
