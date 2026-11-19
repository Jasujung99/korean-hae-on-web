// Cloudflare Pages(advanced mode) 진입점. 빌드: npm run build:cloud → dist/client/_worker.js
// - /api/*, /robots.txt 만 이 워커로 온다(_routes.json). 나머지 화면 파일은 Pages가 바로 준다.
// - Node 서버(server/index.ts)와 같은 Hono 앱을 쓴다. 다른 점은 음원(R2의 압축본, npm run audio:upload)과 설정을 읽는 곳뿐이다.
// - 기록 캐시와 로그인 시도 제한은 Node 서버에서는 프로세스 하나에 살지만, 여기서는 인스턴스가 여러 개일 수 있다.
//   오래된 캐시로 진행을 잘못 보여 주지 않게 앱을 요청마다 새로 만든다(기록 원본은 DB).
import { supabaseTeacherAuth } from "../accounts/auth.ts";
import { createSupabaseRepo } from "../accounts/supabase-repo.ts";
import { createLearnApp } from "../app.ts";
import { readLearnConfig } from "../config.ts";
import { previewAudioIds } from "../preview/audio-ids.ts";
import { createR2AudioSource } from "./packed-audio.ts";

type AssetFetcher = { fetch(input: Request | string): Promise<Response> };
type R2Bucket = Parameters<ReturnType<typeof createR2AudioSource>>[0];

export type CloudEnv = {
  ASSETS: AssetFetcher;
  /** 음원 R2 버킷(haeon-sori-audio) */
  AUDIO: R2Bucket;
  LEARN_APP_ORIGIN?: string;
  LEARN_INVITE_ORIGIN?: string;
  /** pages.dev 주소처럼 같은 앱을 가리키는 다른 주소(쉼표로 여러 개). 쓰기 요청 Origin 확인에만 쓴다. */
  LEARN_EXTRA_ORIGINS?: string;
  LEARN_DB_URL?: string;
  LEARN_DB_SECRET_KEY?: string;
  LEARN_DB_PUBLISHABLE_KEY?: string;
  LEARN_SESSION_SECRET?: string;
  GEMINI_API_KEY?: string;
};

const audioSource = createR2AudioSource(previewAudioIds());

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

async function buildApp(env: CloudEnv) {
  const { ASSETS: _assets, AUDIO: _audio, ...vars } = env;
  const config = readLearnConfig({ ...vars, NODE_ENV: "production", LEARN_SCREEN_PREVIEW: "0" });
  config.devOrigins = extraOrigins(env.LEARN_EXTRA_ORIGINS);
  const db = config.accounts;
  if (!db) return createLearnApp(config);

  const audio = await audioSource(env.AUDIO, db.sessionSecret);

  return createLearnApp(config, {}, {
    repo: createSupabaseRepo({ url: db.dbUrl, secretKey: db.secretKey }),
    auth: supabaseTeacherAuth({ url: db.dbUrl, publishableKey: db.publishableKey }),
    sessionSecret: db.sessionSecret,
    audio,
    inviteOrigin: config.inviteOrigin ?? config.origin ?? null,
    secureCookies: (config.origin ?? "").startsWith("https://"),
    ttsApiKey: config.ttsApiKey ?? null,
  });
}

export default {
  async fetch(request: Request, env: CloudEnv): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/") || url.pathname === "/robots.txt") {
      try {
        return await (await buildApp(env)).fetch(request);
      } catch {
        console.error("learn worker: configuration error");
        return documentHeaders(Response.json({ error: "internal" }, { status: 500 }));
      }
    }

    return documentHeaders(await env.ASSETS.fetch(request));
  },
};
