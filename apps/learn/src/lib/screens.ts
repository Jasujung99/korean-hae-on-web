/** 개발 1단계 화면 껍데기 목록. 미리보기 막대와 스크린샷 스크립트가 같이 쓴다. */
export interface ScreenLink {
  href: string;
  label: string;
  role: "learner" | "teacher";
}

export const screens: ScreenLink[] = [
  { href: "/", label: "공통 주소", role: "learner" },
  { href: "/join", label: "개인 초대", role: "learner" },
  { href: "/practice", label: "듣기 퀴즈", role: "learner" },
  { href: "/practice/compare", label: "비교 도움", role: "learner" },
  { href: "/practice/finish", label: "마무리", role: "learner" },
  { href: "/words", label: "사전·예문", role: "learner" },
  { href: "/teacher", label: "교사 목록", role: "teacher" },
  { href: "/teacher/learners/preview", label: "교사 상세", role: "teacher" },
];
