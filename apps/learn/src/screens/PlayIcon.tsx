// 목소리 버튼의 재생 표시. 글자 '▶'는 크고 진하게 보여서, 속이 빈 작은 선 삼각형으로 그린다(장식이라 읽지 않는다).
export function PlayIcon() {
  return (
    <svg className="play-icon" viewBox="0 0 12 12" width="11" height="11" aria-hidden="true" focusable="false">
      <path d="M3 1.8 10 6 3 10.2Z" />
    </svg>
  );
}
