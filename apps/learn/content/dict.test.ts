import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { wordDictView } from "../server/learn/dict-view.ts";
import { stageZeroCells } from "./core-table.ts";
import { DICT_FILE, dictTargets, validateDictFile, visibleDictEntry, type DictEntry, type DictFile } from "./dict.ts";
import { OTHER_GROUP_IDS, groupPseudowords } from "./group-tables.ts";

const raw = readFileSync(new URL("./dict/entries.json", import.meta.url), "utf8");

const entry = (status: DictEntry["status"]): DictEntry => ({
  word: "모자",
  status,
  reviewNote: status === "needs_review" ? "시험" : "",
  krdict: {
    target_code: 69297,
    sup_no: 2,
    pos: "명사",
    grade: "초급",
    origin: "帽子",
    pronunciation: "모자",
    sense_order: 1,
    definition: "예의를 차리거나 추위나 더위 등을 막기 위해 머리에 쓰는 물건.",
    translations: { ru: null, en: { word: "hat", definition: "An object worn on the head." } },
    examples: ["그는 자리에서 일어나 머리에 모자를 쓰더니 밖으로 나갔다."],
  },
  stdict: null,
});

const fileWith = (entries: Record<string, DictEntry>): DictFile => ({ ...DICT_FILE, entries });

describe("dictionary entries", () => {
  it("covers every word in the tables and keeps the expected shape", () => {
    const ids = dictTargets().map((row) => row.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(validateDictFile(DICT_FILE, ids, raw)).toEqual([]);
  });

  it("leaves out pseudowords and keeps only the two dictionary sources with their license", () => {
    const pseudo = new Set([
      ...OTHER_GROUP_IDS.flatMap((id) => groupPseudowords(id)),
      ...stageZeroCells().filter((cell) => cell.context === "medial_vcv").map((cell) => cell.stimulus),
    ]);
    expect(pseudo.size).toBeGreaterThan(0);
    expect(dictTargets().filter((row) => pseudo.has(row.word))).toEqual([]);
    expect(Object.keys(DICT_FILE.sources).sort()).toEqual(["krdict", "stdict"]);
    for (const source of Object.values(DICT_FILE.sources)) {
      expect(source.license).toBe("크리에이티브 커먼즈 저작자표시-동일조건변경허락 2.0 대한민국 라이선스");
      expect(source.licenseUrl).toBe("https://creativecommons.org/licenses/by-sa/2.0/kr/");
    }
  });

  it("never stores dictionary audio, sourced examples, or anything key-like", () => {
    expect(raw).not.toMatch(/\.mp3|krdicmedia|dicmedia/i);
    expect(raw).not.toMatch(/"source"/);
    expect(raw).not.toMatch(/\b[0-9a-fA-F]{32}\b/);
    expect(raw).not.toMatch(/key=/i);
  });

  it("explains every entry that still needs review", () => {
    for (const [id, row] of Object.entries(DICT_FILE.entries)) {
      if (row.status === "needs_review") expect(row.reviewNote, id).not.toBe("");
    }
  });

  it("flags broken entries", () => {
    const broken = fileWith({ "jcj-1871": { ...entry("draft"), status: "done" as DictEntry["status"] } });
    const issues = validateDictFile(broken, ["jcj-1871", "jcj-2067"]);
    expect(issues.map((issue) => issue.path)).toEqual(expect.arrayContaining(["entries.jcj-2067", "entries.jcj-1871.status"]));
  });

  it("shows only approved entries to learners and unreviewed ones only in review mode", () => {
    const file = fileWith({ a: entry("approved"), b: entry("draft"), c: entry("needs_review") });
    expect(visibleDictEntry("a", false, file)?.status).toBe("approved");
    expect(visibleDictEntry("b", false, file)).toBeNull();
    expect(visibleDictEntry("c", false, file)).toBeNull();
    expect(visibleDictEntry("b", true, file)?.status).toBe("draft");
    expect(visibleDictEntry("missing", true, file)).toBeNull();
  });

  it("turns an entry into the screen view with one supporting example", () => {
    const file = fileWith({ a: entry("approved") });
    expect(wordDictView("a", false, file)).toEqual({
      status: "approved",
      krdict: {
        targetCode: 69297,
        pos: "명사",
        grade: "초급",
        definition: "예의를 차리거나 추위나 더위 등을 막기 위해 머리에 쓰는 물건.",
        example: "그는 자리에서 일어나 머리에 모자를 쓰더니 밖으로 나갔다.",
        translations: { ru: null, en: { word: "hat", definition: "An object worn on the head." } },
      },
      stdict: null,
    });
    expect(wordDictView("a", false, fileWith({ a: { ...entry("approved"), krdict: null } }))).toBeNull();
  });
});
