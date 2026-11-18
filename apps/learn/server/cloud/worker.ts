// Cloudflare Pages(advanced mode) 진입점. 빌드: npm run build:cloud → dist/client/_worker.js
// - /api/*, /robots.txt, /_a/* 만 이 워커로 온다(_routes.json). 나머지 화면 파일은 Pages가 바로 준다.
// - Node 서버(server/index.ts)와 같은 Hono 앱을 쓴다. 다른 점은 음원(압축본, 정적 자산)과 설정을 읽는 곳뿐이다.
// - 기록 캐시와 로그인 시도 제한은 Node 서버에서는 프로세스 하나에 살지만, 여기서는 인스턴스가 여러 개일 수 있다.
//   오래된 캐시로 진행을 잘못 보여 주지 않게 앱을 요청마다 새로 만든다(기록 원본은 DB).
import manifest from "virtual:packed-audio-manifest";
import { supabaseTeacherAuth } from "../accounts/auth.ts";
import { createSupabaseRepo } from "../accounts/supabase-repo.ts";
import { createLearnApp } from "../app.ts";
import { readLearnConfig } from "../config.ts";
import { previewAudioIds } from "../preview/audio-ids.ts";
import { createPackedAudio, PACKED_AUDIO_PREFIX, type PackedAudioManifest } from "./packed-audio.ts";

type AssetFetcher = { fetch(input: Request | string): Promise<Response> };

export type CloudEnv = {
  ASSETS: AssetFetcher;
  LEARN_APP_ORIGIN?: string;
  LEARN_INVITE_ORIGIN?: string;
  /** pages.dev 주소처럼 같은 앱을 가리키는 다른 주소(쉼표로 여러 개). 쓰기 요청 Origin 확인에만 쓴다. */
  LEARN_EXTRA_ORIGINS?: string;
  LEARN_DB_URL?: string;
  LEARN_DB_SECRET_KEY?: string;
  LEARN_DB_PUBLISHABLE_KEY?: string;
  LEARN_SESSION_SECRET?: string;
};

const KNOWN_IDS = previewAudioIds();
let audioCache: { secret: string; audio: ReturnType<typeof createPackedAudio> } | null = null;

function documentHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("X-Robots-Tag", "noindex, nofollow");
  headers.set("X-Frame-Options", "DENY");
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function extraOrigins(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => new URL(item).origin);
}

function buildApp(env: CloudEnv, origin: string) {
  const { ASSETS: _assets, ...vars } = env;
  const config = readLearnConfig({ ...vars, NODE_ENV: "production", LEARN_SCREEN_PREVIEW: "0" });
  config.devOrigins = extraOrigins(env.LEARN_EXTRA_ORIGINS);
  const db = config.accounts;
  if (!db) return createLearnApp(config);

  if (!audioCache || audioCache.secret !== db.sessionSecret) {
    audioCache = {
      secret: db.sessionSecret,
      audio: createPackedAudio(manifest as PackedAudioManifest, KNOWN_IDS, db.sessionSecret, (path) =>
        env.ASSETS.fetch(new URL(path, origin).toString()),
      ),
    };
  }

  return createLearnApp(config, {}, {
    repo: createSupabaseRepo({ url: db.dbUrl, secretKey: db.secretKey }),
    auth: supabaseTeacherAuth({ url: db.dbUrl, publishableKey: db.publishableKey }),
    sessionSecret: db.sessionSecret,
    audio: audioCache.audio,
    inviteOrigin: config.inviteOrigin ?? config.origin ?? null,
    secureCookies: (config.origin ?? "").startsWith("https://"),
  });
}

export default {
  async fetch(request: Request, env: CloudEnv): Promise<Response> {
    const url = new URL(request.url);

    // 압축 음원은 로그인한 사람에게 /api/sound/:ref 로만 준다. 직접 주소로는 받지 못한다.
    if (url.pathname.startsWith(PACKED_AUDIO_PREFIX)) {
      return documentHeaders(new Response("not found", { status: 404 }));
    }

    if (url.pathname.startsWith("/api/") || url.pathname === "/robots.txt") {
      try {
        return await buildApp(env, url.origin).fetch(request);
      } catch {
        console.error("learn worker: configuration error");
        return documentHeaders(Response.json({ error: "internal" }, { status: 500 }));
      }
    }

    return documentHeaders(await env.ASSETS.fetch(request));
  },
};
