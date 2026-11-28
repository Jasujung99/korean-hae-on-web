// 캔버스 스타일의 공통 조각. 자모는 벡터 조각 대신 서체로 그린다(다른 자음 묶음으로 넓히기 쉽게).
import type { ReactNode } from "react";

const LEAD_VOWEL: Record<string, string> = { 아: "ㅏ", 이: "ㅣ", 오: "ㅗ" };

/** 보기 글자(예: 이자)에서 앞 음절의 모음 낱자를 얻는다. */
export function leadVowel(text: string): string {
  return LEAD_VOWEL[text.slice(0, 1)] ?? "ㅏ";
}

export function Sticker({ children, delay = false }: { children: ReactNode; delay?: boolean }) {
  return (
    <span className={delay ? "sticker is-late" : "sticker"}>
      <span>{children}</span>
      <svg viewBox="0 0 72 8" aria-hidden="true">
        <path d="M0 7C20 2 44 0 72 0C46 4 22 8 0 7Z" />
      </svg>
    </span>
  );
}

export function Blade({ tone = "olive" }: { tone?: "olive" | "lavender" }) {
  return (
    <svg className={`blade blade-${tone}`} viewBox="0 0 40 10" aria-hidden="true">
      <path d="M0 10C12 3 28 0 40 0C30 6 14 11 0 10Z" />
    </svg>
  );
}

export function StripLink({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button type="button" className="strip" onClick={onClick}>
      {children}
    </button>
  );
}

export function Dots({ total, done, current }: { total: number; done: number; current: number }) {
  return (
    <span className="c-dots" role="img" aria-label={`${total}문항 가운데 ${current + 1}번째`}>
      {Array.from({ length: total }, (_, index) => (
        <i key={index} className={index < done ? "on" : index === current ? "now" : undefined} />
      ))}
    </span>
  );
}

function hasBatchim(text: string): boolean {
  const code = text.charCodeAt(text.length - 1) - 0xac00;
  return code >= 0 && code <= 11171 && code % 28 !== 0;
}

/** 기차였어요 / 아침이었어요 */
export function withPast(text: string): string {
  return `${text}${hasBatchim(text) ? "이었어요." : "였어요."}`;
}

/** 기자예요. / 아침이에요. */
export function withCopula(text: string): string {
  return `${text}${hasBatchim(text) ? "이에요." : "예요."}`;
}
