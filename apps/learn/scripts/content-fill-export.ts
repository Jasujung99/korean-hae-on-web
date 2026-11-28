// 운영 DB phoneme_content_items에서 뜻·장면·예문이 모두 비어 있는 단어(숨김 제외)를 뽑아 targets.jsonl로 저장한다.
// 키는 환경 변수(LEARN_DB_URL, LEARN_DB_SECRET_KEY) 또는 I:/내 드라이브/_keys 에서 읽고 출력하지 않는다.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { COURSE_ORDER } from "../content/course-order.ts";
import type { ContentItemRow } from "../server/content/repo.ts";
import { createSupabaseContentRepo } from "../server/content/supabase-repo.ts";

const KEYS_DIR = "I:/내 드라이브/_keys";
const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const defaultOutPath = join(appRoot, "content", "fill", "targets.jsonl");

const INITIALS = ["ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"];
const CODAS = [
  "", "ㄱ", "ㄲ", "ㄳ", "ㄴ", "ㄵ", "ㄶ", "ㄷ", "ㄹ", "ㄺ", "ㄻ", "ㄼ", "ㄽ", "ㄾ", "ㄿ", "ㅀ", "ㅁ", "ㅂ", "ㅄ", "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ",
];

function splitHangul(ch: string): { initial: string; coda: string } {
  const code = ch.charCodeAt(0) - 0xac00;
  if (code < 0 || code > 11171) return { initial: "", coda: "" };
  return {
    initial: INITIALS[Math.floor(code / 588)] ?? "",
    coda: CODAS[code % 28] ?? "",
  };
}

export type TargetSyllableLocation = {
  index: number;
  syllable: string;
  role: "initial" | "coda" | "palatalized" | "unknown";
  positionLabel: string;
};

export function locateTargetSyllable(
  item: Pick<ContentItemRow, "word" | "consonant" | "stage" | "note">,
): TargetSyllableLocation {
  const chars = [...item.word];
  const noteMatch = item.note.match(/([1-9])음절/);
  if (noteMatch) {
    const idx = Number(noteMatch[1]);
    const syllable = chars[idx - 1] ?? chars[0] ?? "";
    const hasCodaNote = item.note.includes("받침") || item.note.includes("종성");
    return {
      index: idx,
      syllable,
      role: hasCodaNote ? "coda" : "initial",
      positionLabel: hasCodaNote ? `${idx}음절 받침(${syllable})` : `${idx}음절(${syllable})`,
    };
  }
  if (item.stage === "Stage 5") {
    if (item.note.includes("구개음화")) {
      const syllable = chars[1] ?? chars[0] ?? "";
      return {
        index: Math.min(2, chars.length),
        syllable,
        role: "palatalized",
        positionLabel: `${Math.min(2, chars.length)}음절(${syllable}, 구개음화)`,
      };
    }
    // Stage 5에서는 종성(받침) 출제를 우선으로 찾는다(예: 받다 → 1음절 받침 '받', 책 → 1음절 받침 '책').
    for (let i = 0; i < chars.length; i += 1) {
      const ch = chars[i] ?? "";
      if (splitHangul(ch).coda === item.consonant) {
        return {
          index: i + 1,
          syllable: ch,
          role: "coda",
          positionLabel: `${i + 1}음절 받침(${ch})`,
        };
      }
    }
  }
  for (let i = 0; i < chars.length; i += 1) {
    const ch = chars[i] ?? "";
    if (splitHangul(ch).initial === item.consonant) {
      return {
        index: i + 1,
        syllable: ch,
        role: "initial",
        positionLabel: `${i + 1}음절(${ch})`,
      };
    }
  }
  const fallback = chars[0] ?? "";
  return { index: 1, syllable: fallback, role: "unknown", positionLabel: `1음절(${fallback})` };
}

export type FillTargetRow = {
  id: string;
  legacy_id: string | null;
  group_id: string;
  stage: string;
  substage: string | null;
  consonant: string;
  word: string;
  entry_id: number | null;
  pos: string;
  note: string;
  target_syllable_index: number;
  target_syllable: string;
  target_position: string;
};

export function toFillTargets(items: readonly ContentItemRow[]): FillTargetRow[] {
  const sorted = [...items]
    .filter((item) => item.status !== "hidden")
    .filter((item) => !item.gloss.trim() && !item.scene.trim() && !item.example.trim())
    .sort(
      (a, b) =>
        COURSE_ORDER.indexOf(a.groupId) - COURSE_ORDER.indexOf(b.groupId) ||
        a.stage.localeCompare(b.stage) ||
        (a.substage ?? "").localeCompare(b.substage ?? "") ||
        a.sortOrder - b.sortOrder,
    );

  return sorted.map((item) => {
    const loc = locateTargetSyllable(item);
    return {
      id: item.id,
      legacy_id: item.legacyId,
      group_id: item.groupId,
      stage: item.stage,
      substage: item.substage,
      consonant: item.consonant,
      word: item.word,
      entry_id: item.entryId,
      pos: item.pos,
      note: item.note,
      target_syllable_index: loc.index,
      target_syllable: loc.syllable,
      target_position: loc.positionLabel,
    };
  });
}

function readKeyFile(filename: string): string {
  const path = join(KEYS_DIR, filename);
  if (!existsSync(path)) return "";
  return readFileSync(path, "utf8").replace(/^\uFEFF/, "").trim();
}

async function main() {
  const dbUrl = (process.env.LEARN_DB_URL ?? "").trim() || readKeyFile("supabase_url.txt");
  const secretKey = (process.env.LEARN_DB_SECRET_KEY ?? "").trim() || readKeyFile("supabase_secret_key.txt");
  if (!dbUrl || !secretKey) {
    console.error("LEARN_DB_URL and LEARN_DB_SECRET_KEY are required.");
    process.exit(1);
  }
  const repo = createSupabaseContentRepo({ url: dbUrl, secretKey });
  const items = await repo.listItems({ includeHidden: false });
  const targets = toFillTargets(items);

  mkdirSync(dirname(defaultOutPath), { recursive: true });
  writeFileSync(defaultOutPath, targets.map((row) => JSON.stringify(row)).join("\n") + (targets.length ? "\n" : ""), "utf8");

  const counts = new Map<string, number>();
  for (const t of targets) counts.set(t.group_id, (counts.get(t.group_id) ?? 0) + 1);
  console.log(
    `exported ${targets.length} targets (${COURSE_ORDER.map((g) => `${g}=${counts.get(g) ?? 0}`).join(", ")}) -> content/fill/targets.jsonl`,
  );
}

const isEntry = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isEntry) {
  void main();
}
