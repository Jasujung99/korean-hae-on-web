// 개발 서버와 npm start가 같은 방식으로 계정 저장소·음원을 준비한다.
// 계정 DB 환경 변수가 없으면 null을 돌려주고, 학습·초대 API를 열지 않는다.
import { join } from "node:path";
import { supabaseTeacherAuth } from "../accounts/auth.ts";
import type { AccountsDeps } from "../accounts/routes.ts";
import { createSupabaseRepo } from "../accounts/supabase-repo.ts";
import type { LearnConfig } from "../config.ts";
import { createLocalAudioStore } from "../content/local-audio-store.ts";
import { createSupabaseContentRepo } from "../content/supabase-repo.ts";
import { createRawAudio } from "./audio.ts";
import { previewAudioIds } from "./audio-ids.ts";

export function accountsDeps(appRoot: string, config: LearnConfig): AccountsDeps | null {
  const db = config.accounts;
  if (!db) return null;
  const secureCookies = (config.origin ?? "").startsWith("https://");
  const rawDir = process.env.LEARN_AUDIO_DIR?.trim() || join(appRoot, "audio", "raw");
  return {
    repo: createSupabaseRepo({ url: db.dbUrl, secretKey: db.secretKey }),
    auth: supabaseTeacherAuth({ url: db.dbUrl, publishableKey: db.publishableKey }),
    sessionSecret: db.sessionSecret,
    // 음원 초안 폴더. 다른 체크아웃의 음원을 쓸 때만 LEARN_AUDIO_DIR로 바꾼다.
    audio: createRawAudio(rawDir, previewAudioIds()),
    contentRepo: createSupabaseContentRepo({ url: db.dbUrl, secretKey: db.secretKey }),
    audioStore: createLocalAudioStore(rawDir),
    inviteOrigin: config.inviteOrigin ?? config.origin ?? null,
    secureCookies,
    dictReview: config.screenPreview,
    ttsApiKey: config.ttsApiKey ?? null,
  };
}
