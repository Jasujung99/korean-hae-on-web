import type { APIRoute } from "astro";

// 비공개 학습 앱은 검색에 노출하지 않는다.
export const GET: APIRoute = () =>
  new Response("User-agent: *\nDisallow: /\n", { headers: { "content-type": "text/plain; charset=utf-8" } });
