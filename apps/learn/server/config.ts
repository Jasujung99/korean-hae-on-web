export type LearnConfig = {
  origin: string | null;
  screenPreview: boolean;
  host: string;
  port: number;
};

export type PublicConfig = {
  origin: string | null;
  originSource: "LEARN_APP_ORIGIN" | "unset";
  activated: false;
  dnsChanged: false;
  screenPreview: boolean;
  session: "not-issued";
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

export function readLearnConfig(env: NodeJS.ProcessEnv): LearnConfig {
  const previewFlag = env.LEARN_SCREEN_PREVIEW;
  const screenPreview =
    previewFlag === "1" ? true : previewFlag === "0" ? false : env.NODE_ENV !== "production";

  return {
    origin: readOrigin(env.LEARN_APP_ORIGIN),
    screenPreview,
    host: readHost(env.HOST),
    port: readPort(env.PORT),
  };
}

export function toPublicConfig(config: LearnConfig): PublicConfig {
  return {
    origin: config.origin,
    originSource: config.origin ? "LEARN_APP_ORIGIN" : "unset",
    activated: false,
    dnsChanged: false,
    screenPreview: config.screenPreview,
    session: "not-issued",
  };
}
