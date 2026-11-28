// 대기 중인 AI 제안(phoneme_content_proposals)을 한꺼번에 적용한다. 화면 [적용]과 같은 함수(applyContentProposal)를 쓴다.
//   npm run content:proposals:apply                 (기본: 무엇이 바뀔지 보기만 함)
//   npm run content:proposals:apply -- --apply      (운영 DB에 적용)
// 규칙
// - fill 제안은 지금 비어 있는 칸만 채운다. 그 사이 누가 채운 칸은 그대로 둔다.
// - cleanup 제안(뜻에서 출제 위치 표시를 메모로 옮김)은 gloss·note만 바꾼다.
// - 판 기록 이유: `ai_draft · 모델 · 지시문 판[ · 추가 이유]`. 단어 상태(승인 여부)는 바꾸지 않는다.
// - TTS·업로드·내보내기는 하지 않는다. 적용한 예문은 다음 TTS 생성 계획에 자동으로 들어간다(DB 기준).
import { applyContentProposal } from "../server/content/routes.ts";
import type { ContentItemRow } from "../server/content/repo.ts";
import { readKeyFile, resolveContentRepo } from "./tts-usage-log.ts";

/** 교사가 확인하고 다듬은 값(2026-11-22): 뜻이 둘 붙은 것은 예문에 맞는 뜻 하나만 남긴다. */
const TEACHER_OVERRIDES: Record<string, { gloss: string; reason: string }> = {
  "j_ch_jj|어쩌다": { gloss: "미리 계획하지 않고 우연히.", reason: "뜻 하나만 남김(교사 확인)" },
  "d_t_tt|뜻": { gloss: "말이나 글이 나타내는 의미.", reason: "뜻 하나만 남김(교사 확인)" },
  "d_t_tt|똑똑하다": { gloss: "말소리나 생각이 흐리지 않고 분명하다.", reason: "뜻 하나만 남김(교사 확인)" },
};

const FILL_FIELDS = ["pos", "gloss", "scene", "example", "related"] as const;

const apply = process.argv.includes("--apply");
const repo = resolveContentRepo();
if (!repo) {
  console.error("DB 연결 정보가 없습니다(키 폴더 또는 LEARN_DB_URL·LEARN_DB_SECRET_KEY).");
  process.exit(1);
}

/** 판 기록에 남길 교사 id. 교사가 한 명이라 phoneme_teachers에서 읽는다(LEARN_TEACHER_ID로 바꿀 수 있음). */
async function firstTeacherId(): Promise<string | null> {
  const url = (process.env.LEARN_DB_URL ?? "").trim() || readKeyFile("supabase_url.txt");
  const key = (process.env.LEARN_DB_SECRET_KEY ?? "").trim() || readKeyFile("supabase_secret_key.txt");
  if (!url || !key) return null;
  const response = await fetch(`${url.replace(/\/$/, "")}/rest/v1/phoneme_teachers?select=user_id&limit=2`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!response.ok) return null;
  const rows = (await response.json()) as Array<{ user_id: string }>;
  return rows.length === 1 ? rows[0]!.user_id : null;
}
const decidedBy = process.env.LEARN_TEACHER_ID?.trim() || (await firstTeacherId());
if (!decidedBy) {
  console.error("적용한 교사 id를 찾지 못했습니다. LEARN_TEACHER_ID로 넘겨 주세요.");
  process.exit(1);
}

const pending = await repo.listProposals({ status: "pending" });
console.log(`pending proposals: ${pending.length} (${apply ? "APPLY" : "dry run"})`);

const tally = { applied: 0, unchanged: 0, failed: 0, keptExisting: 0, changedExamples: 0 };
for (const proposal of pending) {
  const item = (await repo.getItem(proposal.itemId)) as ContentItemRow | null;
  if (!item) {
    console.log(`skip ${proposal.id}: item not found`);
    tally.failed++;
    continue;
  }
  const overrides: Record<string, unknown> = {};
  if (proposal.kind === "fill") {
    for (const field of FILL_FIELDS) {
      if (field in proposal.fields && String(item[field] ?? "").trim()) {
        overrides[field] = item[field];
        tally.keptExisting++;
      }
    }
  }
  const teacher = TEACHER_OVERRIDES[`${item.groupId}|${item.word}`];
  if (teacher) {
    overrides.gloss = teacher.gloss;
    overrides.reason = teacher.reason;
  }
  const willChangeExample = proposal.kind === "fill" && !String(item.example ?? "").trim() && Boolean(proposal.fields.example);
  if (!apply) {
    if (willChangeExample) tally.changedExamples++;
    tally.applied++;
    continue;
  }
  const result = await applyContentProposal(repo, proposal.id, overrides, decidedBy);
  if (!result.ok) {
    console.log(`fail ${item.groupId} ${item.word}: ${result.error}`);
    tally.failed++;
    continue;
  }
  if (result.changedFields.length === 0) tally.unchanged++;
  else tally.applied++;
  if (result.changedFields.includes("example")) tally.changedExamples++;
}
console.log(JSON.stringify(tally));
if (!apply) console.log("dry run: nothing written. Run with --apply to write.");
