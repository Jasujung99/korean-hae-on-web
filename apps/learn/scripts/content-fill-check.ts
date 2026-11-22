// 초안(content/fill/drafts-2026-11-20.jsonl) 규칙 검사 및 교사 검토표(content/fill/review.md) 생성.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { COURSE_ORDER, GROUP_LABELS } from "../content/course-order.ts";
import { snapshotFromReferenceJson } from "../content/snapshot.ts";
import type { ContentItemRow } from "../server/content/repo.ts";
import { createSupabaseContentRepo } from "../server/content/supabase-repo.ts";
import type { FillTargetRow } from "./content-fill-export.ts";

const KEYS_DIR = "I:/내 드라이브/_keys";
const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const targetsPath = join(appRoot, "content", "fill", "targets.jsonl");
const draftsPath = join(appRoot, "content", "fill", "drafts-2026-11-20.jsonl");
const reviewPath = join(appRoot, "content", "fill", "review.md");

const INITIALS = ["ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"];
const CODAS = [
  "", "ㄱ", "ㄲ", "ㄳ", "ㄴ", "ㄵ", "ㄶ", "ㄷ", "ㄹ", "ㄺ", "ㄻ", "ㄼ", "ㄽ", "ㄾ", "ㄿ", "ㅀ", "ㅁ", "ㅂ", "ㅄ", "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ",
];
const LENIS_ONSETS = new Set(["ㄱ", "ㄷ", "ㅂ", "ㅅ", "ㅈ"]);
const TENSIFY_CODAS = new Set(["ㄱ", "ㄲ", "ㅋ", "ㄷ", "ㅅ", "ㅆ", "ㅈ", "ㅊ", "ㅌ", "ㅂ", "ㅍ", "ㄹ"]);
const ALLOWED_POS = new Set(["명", "동", "형", "부", "대", "관", "감"]);

function splitHangul(ch: string): { initial: string; coda: string } | null {
  const code = ch.charCodeAt(0) - 0xac00;
  if (code < 0 || code > 11171) return null;
  return {
    initial: INITIALS[Math.floor(code / 588)] ?? "",
    coda: CODAS[code % 28] ?? "",
  };
}

function readJsonl<T>(path: string): T[] {
  return readFileSync(path, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
}

export type DraftFillRow = {
  id: string;
  legacy_id?: string | null;
  word: string;
  kind?: "fill";
  sense: string;
  gloss: string;
  scene: string;
  example: string;
  related: string[];
  pos: string;
  flags: string[];
  model: string;
  prompt_version: string;
  consonant?: string;
  stage?: string;
  substage?: string | null;
  entry_id?: number | null;
  note?: string;
};

export type DraftCleanupRow = {
  id: string;
  legacy_id?: string | null;
  word: string;
  kind: "cleanup";
  gloss: string;
  note: string;
  flags: string[];
  model: string;
  prompt_version: string;
};

export type DraftRow = DraftFillRow | DraftCleanupRow;

export type CheckViolation = {
  id: string;
  word: string;
  kind: "fill" | "cleanup" | "coverage";
  reason: string;
};

function mdCell(text: string): string {
  return text.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

function isCleanupRow(row: DraftRow): row is DraftCleanupRow {
  return row.kind === "cleanup";
}

function checkTargetInclusion(target: FillTargetRow, row: DraftFillRow): { ok: boolean; matchIndex: number; reason?: string } {
  const directIdx = row.example.indexOf(target.word);
  if (directIdx >= 0) return { ok: true, matchIndex: directIdx };

  if (row.pos === "동" || row.pos === "형") {
    const stemPrefix = [...target.word].slice(0, Math.max(1, target.target_syllable_index)).join("");
    const prefixIdx = row.example.indexOf(stemPrefix);
    if (prefixIdx >= 0) {
      return { ok: true, matchIndex: prefixIdx };
    }
    return {
      ok: false,
      matchIndex: -1,
      reason: `예문에 '${target.word}' 또는 목표 음절 '${target.target_syllable}'이 보존된 활용형('${stemPrefix}…')이 없습니다.`,
    };
  }
  return {
    ok: false,
    matchIndex: -1,
    reason: `예문에 목표 단어 '${target.word}'가 표기 그대로 들어 있지 않습니다.`,
  };
}

function checkBoundaryPhonology(target: FillTargetRow, row: DraftFillRow, matchIndex: number): string | null {
  if (target.target_syllable_index !== 1 || !LENIS_ONSETS.has(target.consonant)) return null;
  if (matchIndex < 2) return null;
  const charBefore = row.example[matchIndex - 1] ?? "";
  if (charBefore !== " ") return null;
  const prevWordEnd = row.example[matchIndex - 2] ?? "";
  const parts = splitHangul(prevWordEnd);
  if (!parts) return null;
  if (TENSIFY_CODAS.has(parts.coda)) {
    const snippet = row.example.slice(Math.max(0, matchIndex - 5), Math.min(row.example.length, matchIndex + target.word.length + 2));
    return `단어 앞 '${prevWordEnd}'(받침 ${parts.coda}) 뒤에서 '${target.consonant}' 된소리되기 위험 ('${snippet}')`;
  }
  return null;
}

export function validateDrafts(input: {
  targets: readonly FillTargetRow[];
  drafts: readonly DraftRow[];
  dbItems: readonly Pick<ContentItemRow, "id" | "legacyId" | "groupId" | "word" | "gloss" | "example" | "note" | "status">[];
}): {
  violations: CheckViolation[];
  fillRows: Array<{ target: FillTargetRow; draft: DraftFillRow }>;
  cleanupRows: Array<{ item: Pick<ContentItemRow, "id" | "legacyId" | "groupId" | "word" | "gloss" | "example" | "note">; draft: DraftCleanupRow }>;
  flagged: Array<{ word: string; groupId: string; flags: string[] }>;
} {
  const violations: CheckViolation[] = [];
  const targetById = new Map(input.targets.map((t) => [t.id, t]));
  const dbById = new Map(input.dbItems.map((i) => [i.id, i]));
  const existingExamples = new Set(
    input.dbItems.filter((i) => i.status !== "hidden" && i.example.trim()).map((i) => i.example.trim()),
  );
  const seenFillExamples = new Map<string, string>();

  const seenFillIds = new Set<string>();
  const seenCleanupIds = new Set<string>();
  const fillRows: Array<{ target: FillTargetRow; draft: DraftFillRow }> = [];
  const cleanupRows: Array<{ item: Pick<ContentItemRow, "id" | "legacyId" | "groupId" | "word" | "gloss" | "example" | "note">; draft: DraftCleanupRow }> = [];
  const flagged: Array<{ word: string; groupId: string; flags: string[] }> = [];

  for (const row of input.drafts) {
    if (isCleanupRow(row)) {
      if (seenCleanupIds.has(row.id)) {
        violations.push({ id: row.id, word: row.word, kind: "cleanup", reason: "중복된 cleanup id" });
        continue;
      }
      seenCleanupIds.add(row.id);
      const item = dbById.get(row.id);
      if (!item || !item.gloss.includes("출제 위치")) {
        violations.push({ id: row.id, word: row.word, kind: "cleanup", reason: "출제 위치 표시가 있는 기존 단어와 연결되지 않음" });
        continue;
      }
      const m = item.gloss.match(/^(.*?)\s*\((출제 위치:\s*[^)]+)\)\s*$/);
      if (!m) {
        violations.push({ id: row.id, word: row.word, kind: "cleanup", reason: "출제 위치 괄호 파싱 실패" });
        continue;
      }
      const expectedGloss = (m[1] ?? "").trim();
      const extracted = (m[2] ?? "").trim();
      const expectedNote = item.note.trim() ? `${item.note.trim()} · ${extracted}` : extracted;
      if (row.gloss !== expectedGloss) {
        violations.push({ id: row.id, word: row.word, kind: "cleanup", reason: `정리된 뜻이 원뜻과 다름: '${row.gloss}' vs '${expectedGloss}'` });
      }
      if (row.note !== expectedNote) {
        violations.push({ id: row.id, word: row.word, kind: "cleanup", reason: `note 형식이 다름: '${row.note}' vs '${expectedNote}'` });
      }
      cleanupRows.push({ item, draft: row });
      continue;
    }

    if (seenFillIds.has(row.id)) {
      violations.push({ id: row.id, word: row.word, kind: "fill", reason: "중복된 fill id" });
      continue;
    }
    seenFillIds.add(row.id);

    const target = targetById.get(row.id);
    if (!target) {
      violations.push({ id: row.id, word: row.word, kind: "fill", reason: "targets.jsonl에 없는 대상 id" });
      continue;
    }

    if (row.word !== target.word) {
      violations.push({ id: row.id, word: row.word, kind: "fill", reason: `단어 변경됨('${row.word}' vs '${target.word}')` });
    }
    if (
      ("consonant" in row && row.consonant !== target.consonant) ||
      ("stage" in row && row.stage !== target.stage) ||
      ("substage" in row && row.substage !== target.substage) ||
      ("entry_id" in row && row.entry_id !== target.entry_id) ||
      ("note" in row && row.note !== target.note)
    ) {
      violations.push({ id: row.id, word: row.word, kind: "fill", reason: "바꾸면 안 되는 칸(consonant/stage/substage/entry_id/note)이 다름" });
    }
    if (!ALLOWED_POS.has(row.pos)) {
      violations.push({ id: row.id, word: row.word, kind: "fill", reason: `품사 값 오류('${row.pos}')` });
    }
    if (target.pos && row.pos !== target.pos) {
      violations.push({ id: row.id, word: row.word, kind: "fill", reason: `이미 채워진 품사(${target.pos})를 변경함` });
    }
    if (!row.sense.trim() || (!row.sense.includes("기초사전") && !row.sense.includes("표준"))) {
      violations.push({ id: row.id, word: row.word, kind: "fill", reason: "sense에 사전 출처·번호가 없음" });
    }

    const glossLen = [...row.gloss].length;
    if (!row.gloss.trim() || !row.gloss.endsWith(".") || glossLen < 12 || glossLen > 60) {
      violations.push({ id: row.id, word: row.word, kind: "fill", reason: `gloss 길이/마침표 오류(${glossLen}자): '${row.gloss}'` });
    }
    if (row.gloss.includes(target.word)) {
      violations.push({ id: row.id, word: row.word, kind: "fill", reason: `gloss 안에 목표 단어 '${target.word}'가 반복됨` });
    }
    if (row.gloss.includes("출제 위치")) {
      violations.push({ id: row.id, word: row.word, kind: "fill", reason: "gloss에 '출제 위치'가 포함됨" });
    }

    const sceneLen = [...row.scene].length;
    if (!row.scene.trim() || !row.scene.endsWith("때") || sceneLen < 5 || sceneLen > 30) {
      violations.push({ id: row.id, word: row.word, kind: "fill", reason: `scene 형식/길이 오류(${sceneLen}자): '${row.scene}'` });
    }

    const exLen = [...row.example].length;
    if (exLen < 10 || exLen > 30) {
      violations.push({ id: row.id, word: row.word, kind: "fill", reason: `example 길이 범위(10~30자) 밖(${exLen}자): '${row.example}'` });
    }
    if (row.example.includes("!")) {
      violations.push({ id: row.id, word: row.word, kind: "fill", reason: "example에 느낌표(!) 사용 금지" });
    }
    if (!/요[.?]$/.test(row.example)) {
      violations.push({ id: row.id, word: row.word, kind: "fill", reason: `example 해요체 종결 오류: '${row.example}'` });
    }
    if (existingExamples.has(row.example.trim())) {
      violations.push({ id: row.id, word: row.word, kind: "fill", reason: `기존 DB 예문과 중복: '${row.example}'` });
    }
    const dupWord = seenFillExamples.get(row.example.trim());
    if (dupWord) {
      violations.push({ id: row.id, word: row.word, kind: "fill", reason: `초안 내 '${dupWord}' 예문과 중복` });
    } else {
      seenFillExamples.set(row.example.trim(), row.word);
    }

    const inclusion = checkTargetInclusion(target, row);
    if (!inclusion.ok) {
      violations.push({ id: row.id, word: row.word, kind: "fill", reason: inclusion.reason ?? "예문 포함 확인 실패" });
    } else {
      const phonErr = checkBoundaryPhonology(target, row, inclusion.matchIndex);
      if (phonErr) {
        violations.push({ id: row.id, word: row.word, kind: "fill", reason: phonErr });
      }
    }

    if (!Array.isArray(row.related) || row.related.length < 1 || row.related.length > 2 || row.related.some((r) => !r.trim())) {
      violations.push({ id: row.id, word: row.word, kind: "fill", reason: "related는 1~2개의 비어 있지 않은 문자열 배열이어야 함" });
    }
    if (!Array.isArray(row.flags)) {
      violations.push({ id: row.id, word: row.word, kind: "fill", reason: "flags 배열 누락" });
    } else if (row.flags.length > 0) {
      flagged.push({ word: row.word, groupId: target.group_id, flags: row.flags });
    }

    fillRows.push({ target, draft: row });
  }

  for (const target of input.targets) {
    if (!seenFillIds.has(target.id)) {
      violations.push({ id: target.id, word: target.word, kind: "coverage", reason: "초안 누락" });
    }
  }
  const dbCleanups = input.dbItems.filter((i) => i.status !== "hidden" && i.gloss.includes("출제 위치"));
  for (const item of dbCleanups) {
    if (!seenCleanupIds.has(item.id)) {
      violations.push({ id: item.id, word: item.word, kind: "coverage", reason: "출제 위치 cleanup 초안 누락" });
    }
  }

  return { violations, fillRows, cleanupRows, flagged };
}

export function renderReviewMarkdown(result: ReturnType<typeof validateDrafts>): string {
  const lines: string[] = [];
  const countsByGroup = new Map<string, number>();
  for (const { target } of result.fillRows) {
    countsByGroup.set(target.group_id, (countsByGroup.get(target.group_id) ?? 0) + 1);
  }

  lines.push("# 빈 단어 칸 초안 및 뜻 정리 검토표");
  lines.push("");
  lines.push(`- 작성 대상(빈 칸): **${result.fillRows.length}개** (${COURSE_ORDER.map((g) => `${GROUP_LABELS[g]} ${countsByGroup.get(g) ?? 0}`).join(" · ")})`);
  lines.push(`- 뜻 정리(출제 위치 분리): **${result.cleanupRows.length}개**`);
  lines.push(`- 규칙 검사 위반: **${result.violations.length}건**`);
  lines.push(`- 검토 메모(\`flags\`) 표시 단어: **${result.flagged.length}개**`);
  lines.push("");
  lines.push("> 교사가 검토한 뒤 다음 단계에서 DB `phoneme_content_proposals`에 '제안'으로만 등록하며, 화면에서 [적용] · 승인 · 내보내기 전까지 학습자에게 반영되지 않습니다.");
  lines.push("");

  for (const groupId of COURSE_ORDER) {
    const groupRows = result.fillRows.filter((r) => r.target.group_id === groupId);
    lines.push(`## ${GROUP_LABELS[groupId]} (${groupRows.length}개)`);
    lines.push("");
    lines.push("| 단어 | 위치 | 품사 | sense | 쉬운 뜻 | 장면 | 예문 | 함께 쓰는 말 | flags |");
    lines.push("| --- | --- | --- | --- | --- | --- | --- | --- | --- |");
    for (const { target, draft } of groupRows) {
      const posLabel = target.substage ? `${target.stage}(${target.substage})` : target.stage;
      const flagsText = draft.flags.length > 0 ? draft.flags.join("; ") : "-";
      lines.push(
        `| **${mdCell(draft.word)}** | ${mdCell(posLabel)} · ${mdCell(target.consonant)} · ${mdCell(target.target_position)} | ${mdCell(draft.pos)} | ${mdCell(draft.sense)} | ${mdCell(draft.gloss)} | ${mdCell(draft.scene)} | ${mdCell(draft.example)} | ${mdCell(draft.related.join(", "))} | ${mdCell(flagsText)} |`,
      );
    }
    lines.push("");
  }

  lines.push(`## 뜻 정리 제안: '(출제 위치: …)' 분리 (${result.cleanupRows.length}개)`);
  lines.push("");
  lines.push("| 묶음 | 단어 | 정리된 뜻 | 이동된 메모(note) |");
  lines.push("| --- | --- | --- | --- |");
  for (const { item, draft } of result.cleanupRows) {
    lines.push(
      `| ${mdCell(GROUP_LABELS[item.groupId])} | **${mdCell(draft.word)}** | ${mdCell(draft.gloss)} | ${mdCell(draft.note)} |`,
    );
  }
  lines.push("");

  if (result.flagged.length > 0) {
    lines.push(`## flags가 붙은 단어 모아보기 (${result.flagged.length}개)`);
    lines.push("");
    for (const row of result.flagged) {
      lines.push(`- **${row.word}** (${GROUP_LABELS[row.groupId as keyof typeof GROUP_LABELS] ?? row.groupId}): ${row.flags.join(" / ")}`);
    }
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}

function readKeyFile(filename: string): string {
  const path = join(KEYS_DIR, filename);
  if (!existsSync(path)) return "";
  return readFileSync(path, "utf8").replace(/^\uFEFF/, "").trim();
}

async function loadDbItems() {
  const dbUrl = (process.env.LEARN_DB_URL ?? "").trim() || readKeyFile("supabase_url.txt");
  const secretKey = (process.env.LEARN_DB_SECRET_KEY ?? "").trim() || readKeyFile("supabase_secret_key.txt");
  if (!dbUrl || !secretKey) {
    const snap = snapshotFromReferenceJson();
    return snap.items.map((item) => ({
      id: item.id,
      legacyId: item.legacyId,
      groupId: item.groupId,
      word: item.word,
      gloss: item.gloss,
      example: item.example,
      note: item.note,
      status: "approved" as const,
    }));
  }
  const repo = createSupabaseContentRepo({ url: dbUrl, secretKey });
  return repo.listItems({ includeHidden: false });
}

async function main() {
  const targets = readJsonl<FillTargetRow>(targetsPath);
  const drafts = readJsonl<DraftRow>(draftsPath);
  const dbItems = await loadDbItems();

  const result = validateDrafts({ targets, drafts, dbItems });
  mkdirSync(dirname(reviewPath), { recursive: true });
  writeFileSync(reviewPath, renderReviewMarkdown(result), "utf8");

  console.log(
    `checked: ${result.fillRows.length} fill + ${result.cleanupRows.length} cleanup, violations=${result.violations.length}, flagged=${result.flagged.length}`,
  );
  for (const v of result.violations) {
    console.error(`VIOLATION [${v.kind}] ${v.word} (${v.id}): ${v.reason}`);
  }
  console.log(`review written -> content/fill/review.md`);
  if (result.violations.length > 0) process.exit(1);
}

const isEntry = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isEntry) {
  void main();
}
