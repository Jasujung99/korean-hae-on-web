/**
 * 해온 디자인 토큰 어댑터.
 * 값은 복사하지 않고 저장소 루트 src/design-system의 tokens.css, base.css를 그대로 불러온다.
 * 학습 화면의 상태 색은 그 토큰만 쓴다.
 * - 선택·현재: --wash-sage, --olive
 * - 확장·안내: --wash-lavender, --lavender, --lavender-ink
 * - 본문·보조: --ink, --ink-muted
 * - 선: --line
 * 별도 브랜드 색은 만들지 않는다.
 */
import "@design/tokens.css";
import "@design/base.css";
import "./shared.css";
import "./practice.css";
import "./teacher.css";
import "./responsive.css";
