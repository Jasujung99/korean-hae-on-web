// 개발 서버와 npm start가 같은 방식으로 계정 저장소·음원을 준비한다.
// 계정 DB 환경 변수가 없으면 null을 돌려주고, 학습·초대 API를 열지 않는다.
import { join } from "node:path";
import { supabaseTeacherAuth } from "../accounts/auth.ts";
import type { AccountsDeps } from "../accounts/routes.ts";
import { createSupabaseRepo } from "../accounts/supabase-repo.ts";
import type { LearnConfig } from "../config.ts";
import { createRawAudio } from "./audio.ts";
import { previewAudioIds } from "./audio-ids.ts";

export function accountsDeps(appRoot: string, config: LearnConfig): AccountsDeps | null {
  const db = config.accounts;
  if (!db) return null;
  const secureCookies = (config.origin ?? "").startsWith("https://");
  return {
    repo: createSupabaseRepo({ url: db.dbUrl, secretKey: db.secretKey }),
    auth: supabaseTeacherAuth({ url: db.dbUrl, publishableKey: db.publishableKey }),
    sessionSecret: db.sessionSecret,
    audio: createRawAudio(join(appRoot, "audio", "raw"), previewAudioIds()),
    inviteOrigin: config.inviteOrigin ?? config.origin ?? null,
    secureCookies,
  };
}
