import { readApiKey } from "../content/tts/pipeline.ts";

export type LearnConfig = {
  origin: string | null;
  screenPreview: boolean;
  host: string;
  port: number;
  /** 개발 서버만: 같은 서버를 가리키는 다른 로컬 이름(예: localhost, 같은 와이파이 주소). 환경 변수로는 받지 않는다. */
  devOrigins?: string[];
  /** 계정 DB 연결. 키는 환경 변수로만 받는다. 없으면 초대·학습 API를 열지 않는다. */
  accounts?: AccountsConfig | null;
  /** 초대 링크에 넣을 주소. 비우면 교사가 접속한 주소를 쓴다. */
  inviteOrigin?: string | null;
  /** 단건 TTS 생성 키. 서버 내부 전용이며 공개 설정 응답에는 넣지 않는다. */
  ttsApiKey?: string | null;
};

export type AccountsConfig = {
  dbUrl: string;
  secretKey: string;
  publishableKey: string;
  sessionSecret: string;
};

export type PublicConfig = {
  origin: string | null;
  originSource: "LEARN_APP_ORIGIN" | "unset";
  activated: false;
  dnsChanged: false;
  screenPreview: boolean;
  session: "not-issued" | "device-cookie";
  accounts: boolean;
};

function readHost(value: string | undefined): string {
  const host = value?.trim() ?? "";
  if (!host) return "127.0.0.1";
  if (host.includes("://") || host.includes("/") || /\s/.test(host)) {
    throw new Error("HOST must be a hostname or IP address");
  }
  return host;
}

function readPort(value: string | undefined): number {
  if (value === undefined || value.trim() === "") return 4174;
  if (!/^\d+$/.test(value.trim())) {
    throw new Error("PORT must be an integer from 1 to 65535");
  }
  const port = Number(value.trim());
  if (port < 1 || port > 65535) {
    throw new Error("PORT must be an integer from 1 to 65535");
  }
  return port;
}

function readOrigin(value: string | undefined): string | null {
  const raw = value?.trim() ?? "";
  if (!raw) return null;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("LEARN_APP_ORIGIN must be an absolute http(s) URL");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("LEARN_APP_ORIGIN must use http or https");
  }
  if (url.username || url.password) {
    throw new Error("LEARN_APP_ORIGIN must not include credentials");
  }

  return url.origin;
}

function readAccounts(env: NodeJS.ProcessEnv): AccountsConfig | null {
  const dbUrl = env.LEARN_DB_URL?.trim() ?? "";
  const secretKey = env.LEARN_DB_SECRET_KEY?.trim() ?? "";
  const publishableKey = env.LEARN_DB_PUBLISHABLE_KEY?.trim() ?? "";
  const sessionSecret = env.LEARN_SESSION_SECRET?.trim() ?? "";
  if (!dbUrl && !secretKey && !publishableKey && !sessionSecret) return null;
  if (!dbUrl || !secretKey || !publishableKey || !sessionSecret) {
    throw new Error("LEARN_DB_URL, LEARN_DB_SECRET_KEY, LEARN_DB_PUBLISHABLE_KEY, LEARN_SESSION_SECRET must be set together");
  }
  let url: URL;
  try {
    url = new URL(dbUrl);
  } catch {
    throw new Error("LEARN_DB_URL must be an absolute https URL");
  }
  if (url.protocol !== "https:") throw new Error("LEARN_DB_URL must use https");
  if (sessionSecret.length < 32) throw new Error("LEARN_SESSION_SECRET must be at least 32 characters");
  return { dbUrl: url.origin, secretKey, publishableKey, sessionSecret };
}

export function readLearnConfig(env: NodeJS.ProcessEnv): LearnConfig {
  const previewFlag = env.LEARN_SCREEN_PREVIEW;
  const screenPreview =
    previewFlag === "1" ? true : previewFlag === "0" ? false : env.NODE_ENV !== "production";

  return {
    origin: readOrigin(env.LEARN_APP_ORIGIN),
    screenPreview,
    host: readHost(env.HOST),
    port: readPort(env.PORT),
    accounts: readAccounts(env),
    inviteOrigin: readOrigin(env.LEARN_INVITE_ORIGIN),
    ttsApiKey: readApiKey(env),
  };
}

export function toPublicConfig(config: LearnConfig): PublicConfig {
  return {
    origin: config.origin,
    originSource: config.origin ? "LEARN_APP_ORIGIN" : "unset",
    activated: false,
    dnsChanged: false,
    screenPreview: config.screenPreview,
    session: config.accounts ? "device-cookie" : "not-issued",
    accounts: Boolean(config.accounts),
  };
}
