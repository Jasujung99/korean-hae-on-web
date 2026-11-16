import type { ReactNode } from "react";

// 사전 연결 자리. 아직 어떤 사전도 연결하지 않았고, 방식을 고르기 위한 빈 상자다.
export const DICT_OPTIONS = {
  A: {
    title: "카드 안에서 펼치기",
    what: "쉬운 뜻 아래 '사전 풀이'를 펼치면 기초사전 뜻풀이와 내 언어 대역어, 표준국어대사전 풀이가 차례로 나와요.",
    where: "단어 카드 · 뜻 바로 아래",
  },
  B: {
    title: "옆 칸 · 아래에서 올라오는 쪽지",
    what: "PC는 오른쪽 칸에, 휴대폰은 화면 아래에서 올라오는 쪽지에 두 사전을 탭으로 보여 줘요.",
    where: "PC 오른쪽 칸 · 휴대폰 아래 쪽지",
  },
  C: {
    title: "예문 속 낱말 눌러 보기",
    what: "예문의 낱말을 누르면 바로 아래에 기본꼴·뜻·내 언어가 열려요. 어휘를 넓히는 데 가장 잘 맞아요.",
    where: "예문 상자 아래",
  },
  D: {
    title: "바깥 사전으로 나가기",
    what: "한국어기초사전·표준국어대사전·네이버 국어사전을 새 창으로 열어요. 연습 화면은 그대로 남아요.",
    where: "단어 카드 맨 아래",
  },
} as const;

export type DictOption = keyof typeof DICT_OPTIONS;

export function DictSlot({ option, className, children }: { option: DictOption; className?: string; children?: ReactNode }) {
  const info = DICT_OPTIONS[option];
  return (
    <section className={className ? `dict-slot ${className}` : "dict-slot"} aria-label={`사전 자리 ${option}. ${info.title}`}>
      <p className="dict-slot-tag">사전 자리 · 방식 {option}</p>
      <h4>{info.title}</h4>
      <p>{info.what}</p>
      <p className="dict-slot-where">{info.where} · 아직 연결하지 않음</p>
      {children}
    </section>
  );
}
