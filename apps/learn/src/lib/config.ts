/**
 * 학습 앱 런타임 설정.
 *
 * - LEARN_APP_ORIGIN: 브라우저가 보는 앱 origin. 쿠키·Origin 검사·절대 주소의 기준.
 *   `learn.haeonkorean.com`은 제안 주소일 뿐이므로 기본값으로 쓰지 않는다.
 * - LEARN_PREVIEW: 빌드된 서버에서 검토용 미리보기를 켤 때만 "1".
 *
 * 이 모듈은 비밀값(DB 서버 키, TTS 키)을 읽지 않는다.
 */

export const DEFAULT_LEARN_APP_ORIGIN = "http://localhost:4400";
export const PROPOSED_PRODUCTION_HOST = "learn.haeonkorean.com";

type Env = Record<string, string | undefined>;

export class ConfigError extends Error {}

/** scheme://host[:port] 형태만 허용하고 경로·쿼리·조각은 거부한다. */
export function parseOrigin(raw: string | undefined): string {
  const value = (raw ?? "").trim();
  if (!value) return DEFAULT_LEARN_APP_ORIGIN;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ConfigError("LEARN_APP_ORIGIN 형식이 올바르지 않습니다 (예: http://localhost:4400).");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new ConfigError("LEARN_APP_ORIGIN 은 http 또는 https 여야 합니다.");
  }
  if ((url.pathname !== "/" && url.pathname !== "") || url.search || url.hash || url.username || url.password) {
    throw new ConfigError("LEARN_APP_ORIGIN 에는 경로·쿼리·계정 정보를 넣지 않습니다.");
  }
  return url.origin;
}

export interface LearnConfig {
  appOrigin: string;
  /** https origin 이면 쿠키에 Secure 를 붙일 수 있다(개발 4단계에서 사용). */
  secureCookies: boolean;
  preview: boolean;
}

export function readConfig(env: Env, opts: { dev: boolean }): LearnConfig {
  const appOrigin = parseOrigin(env.LEARN_APP_ORIGIN);
  return {
    appOrigin,
    secureCookies: appOrigin.startsWith("https://"),
    preview: isPreviewEnabled(env, opts),
  };
}

/**
 * 검토용 미리보기(역할 전환 막대)는 `astro dev` 이거나 LEARN_PREVIEW=1 일 때만 켠다.
 * 미리보기는 화면 검토용이며 교사 인증을 대신하지 않는다.
 */
export function isPreviewEnabled(env: Env, opts: { dev: boolean }): boolean {
  if (opts.dev) return true;
  return (env.LEARN_PREVIEW ?? "").trim() === "1";
}

let cached: LearnConfig | undefined;

/** 서버 코드에서 쓰는 현재 설정. */
export function getConfig(): LearnConfig {
  if (!cached) cached = readConfig(process.env, { dev: import.meta.env.DEV });
  return cached;
}
