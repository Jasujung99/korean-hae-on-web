import type { APIRoute } from "astro";

/**
 * 같은 origin `/api/*` 구조 확인용. 비밀값·환경 변수 값·외부 연결 상태를 돌려주지 않는다.
 * 개발 1단계에는 DB·TTS 연결이 없다는 사실만 고정 문자열로 알린다.
 */
export const GET: APIRoute = () =>
  new Response(
    JSON.stringify({
      ok: true,
      app: "haeon-learn",
      devStage: 1,
      database: "not_connected",
      audio: "not_connected",
    }),
    { headers: { "content-type": "application/json; charset=utf-8" } },
  );
