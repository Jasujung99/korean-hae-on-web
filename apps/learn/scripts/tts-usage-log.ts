// PC 일괄 음성 생성 스크립트가 DB 사용량 표(phoneme_tts_usage)에 건수를 남기는 도우미.
// 키는 환경 변수 또는 I:/내 드라이브/_keys 에서 읽고, 화면·로그에 절대 출력하지 않는다.
// DB 설정이 없거나 연결이 실패해도 로컬 음성 생성은 막지 않는다.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ttsQuotaDay } from "../content/tts/quota.ts";
import type { ContentRepo } from "../server/content/repo.ts";
import { createSupabaseContentRepo } from "../server/content/supabase-repo.ts";

const KEYS_DIR = "I:/내 드라이브/_keys";
let cachedRepo: ContentRepo | null | undefined;

function readKeyFile(filename: string): string {
  try {
    const path = join(KEYS_DIR, filename);
    if (!existsSync(path)) return "";
    return readFileSync(path, "utf8").replace(/^\uFEFF/, "").trim();
  } catch {
    return "";
  }
}

export function resolveContentRepo(): ContentRepo | null {
  if (cachedRepo !== undefined) return cachedRepo;
  const dbUrl = (process.env.LEARN_DB_URL ?? "").trim() || readKeyFile("supabase_url.txt");
  const secretKey = (process.env.LEARN_DB_SECRET_KEY ?? "").trim() || readKeyFile("supabase_secret_key.txt");
  cachedRepo = dbUrl && secretKey ? createSupabaseContentRepo({ url: dbUrl, secretKey }) : null;
  return cachedRepo;
}

export async function logPcTtsUsage(input: {
  voiceKey: string;
  kind: string;
  ok: boolean;
  errorCode: string | null;
  itemId?: string | null;
}): Promise<void> {
  try {
    const repo = resolveContentRepo();
    if (!repo) return;
    await repo.recordTtsUsage({
      quotaDay: ttsQuotaDay(new Date()),
      source: "pc_batch",
      voiceKey: input.voiceKey.toLowerCase(),
      kind: input.kind,
      itemId: input.itemId ?? null,
      ok: input.ok,
      errorCode: input.errorCode ?? null,
    });
  } catch {
    // DB 연결이 없거나 표가 아직 없을 때도 PC 일괄 생성은 이어서 진행한다.
  }
}
