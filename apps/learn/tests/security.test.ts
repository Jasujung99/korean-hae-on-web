import { describe, expect, it } from "vitest";
import { apiError, guardApiRequest } from "../src/lib/security";

const ORIGIN = "http://localhost:4400";
const req = (method: string, headers: Record<string, string> = {}) => ({ method, headers: new Headers(headers) });

describe("same-origin /api 검사", () => {
  it("GET/HEAD/OPTIONS 는 통과한다", () => {
    for (const m of ["GET", "HEAD", "OPTIONS"]) expect(guardApiRequest(req(m), ORIGIN).ok).toBe(true);
  });

  it("Origin 이 없거나 다르면 상태 변경 요청을 막는다", () => {
    expect(guardApiRequest(req("POST", { "content-type": "application/json" }), ORIGIN)).toEqual({ ok: false, status: 403, code: "origin_mismatch" });
    expect(guardApiRequest(req("POST", { origin: "https://evil.test", "content-type": "application/json" }), ORIGIN)).toMatchObject({ status: 403 });
    expect(guardApiRequest(req("DELETE", { origin: "http://localhost:4401" }), ORIGIN)).toMatchObject({ status: 403 });
    expect(guardApiRequest(req("POST", { origin: "null" }), ORIGIN)).toMatchObject({ status: 403 });
  });

  it("같은 origin 이어도 폼·텍스트 본문은 JSON 이 아니므로 막는다", () => {
    for (const ct of ["application/x-www-form-urlencoded", "multipart/form-data; boundary=x", "text/plain"]) {
      expect(guardApiRequest(req("POST", { origin: ORIGIN, "content-type": ct }), ORIGIN)).toMatchObject({ status: 415, code: "json_required" });
    }
  });

  it("같은 origin JSON 요청은 통과한다", () => {
    expect(guardApiRequest(req("POST", { origin: ORIGIN, "content-type": "application/json; charset=utf-8" }), ORIGIN).ok).toBe(true);
  });

  it("오류 응답은 코드만 담고 캐시하지 않는다", async () => {
    const res = apiError(403, "origin_mismatch");
    expect(res.status).toBe(403);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
    expect(await res.json()).toEqual({ error: { code: "origin_mismatch" } });
  });
});
