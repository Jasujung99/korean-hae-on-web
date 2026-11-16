/**
 * 같은 origin `/api/*` 요청 검사.
 *
 * 개발 1단계에서는 상태를 바꾸는 API가 아직 없지만, 이후 단계(초대 claim, 이벤트 저장,
 * 로그아웃)가 같은 규칙을 그대로 쓰도록 먼저 고정한다.
 *  - GET/HEAD/OPTIONS 외의 요청은 Origin 헤더가 앱 origin 과 정확히 같아야 한다.
 *  - 본문이 있는 요청은 application/json 만 받는다(단순 폼 CSRF 차단).
 *  - CORS 허용 헤더를 내보내지 않는다(`*` 금지).
 */

export const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export type GuardResult = { ok: true } | { ok: false; status: number; code: string };

export function guardApiRequest(
  req: { method: string; headers: Headers },
  appOrigin: string,
): GuardResult {
  const method = req.method.toUpperCase();
  if (SAFE_METHODS.has(method)) return { ok: true };

  const origin = req.headers.get("origin");
  if (!origin || origin !== appOrigin) {
    return { ok: false, status: 403, code: "origin_mismatch" };
  }

  const contentType = (req.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  const hasBody = req.headers.get("content-length") !== "0" && contentType !== "";
  if (hasBody && contentType !== "application/json") {
    return { ok: false, status: 415, code: "json_required" };
  }
  return { ok: true };
}

/** 안정적인 오류 코드와 짧은 문구만 돌려준다. 내부 오류·비밀값은 넣지 않는다. */
export function apiError(status: number, code: string): Response {
  return new Response(JSON.stringify({ error: { code } }), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}
