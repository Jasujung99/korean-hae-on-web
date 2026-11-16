import { describe, expect, it } from "vitest";
import { ConfigError, DEFAULT_LEARN_APP_ORIGIN, isPreviewEnabled, parseOrigin, readConfig } from "../src/lib/config";

describe("LEARN_APP_ORIGIN", () => {
  it("비어 있으면 로컬 기본값을 쓰고, 제안 운영 주소를 기본값으로 쓰지 않는다", () => {
    expect(parseOrigin(undefined)).toBe(DEFAULT_LEARN_APP_ORIGIN);
    expect(parseOrigin("")).toBe("http://localhost:4400");
    expect(DEFAULT_LEARN_APP_ORIGIN).not.toContain("haeonkorean.com");
  });

  it("scheme://host[:port] 를 정규화한다", () => {
    expect(parseOrigin("https://learn.example.test")).toBe("https://learn.example.test");
    expect(parseOrigin("https://learn.example.test/")).toBe("https://learn.example.test");
    expect(parseOrigin("http://127.0.0.1:4400")).toBe("http://127.0.0.1:4400");
  });

  it("경로·쿼리·계정·다른 scheme 은 거부한다", () => {
    for (const bad of ["https://a.test/app", "https://a.test/?x=1", "https://u:p@a.test", "javascript:alert(1)", "ftp://a.test", "not a url"]) {
      expect(() => parseOrigin(bad)).toThrow(ConfigError);
    }
  });

  it("https origin 일 때만 Secure 쿠키 대상으로 본다", () => {
    expect(readConfig({ LEARN_APP_ORIGIN: "https://a.test" }, { dev: false }).secureCookies).toBe(true);
    expect(readConfig({}, { dev: false }).secureCookies).toBe(false);
  });
});

describe("검토용 미리보기", () => {
  it("빌드 서버에서는 기본으로 꺼져 있다", () => {
    expect(isPreviewEnabled({}, { dev: false })).toBe(false);
    expect(isPreviewEnabled({ LEARN_PREVIEW: "0" }, { dev: false })).toBe(false);
    expect(isPreviewEnabled({ LEARN_PREVIEW: "true" }, { dev: false })).toBe(false);
  });

  it("astro dev 이거나 LEARN_PREVIEW=1 일 때만 켜진다", () => {
    expect(isPreviewEnabled({}, { dev: true })).toBe(true);
    expect(isPreviewEnabled({ LEARN_PREVIEW: "1" }, { dev: false })).toBe(true);
  });
});
