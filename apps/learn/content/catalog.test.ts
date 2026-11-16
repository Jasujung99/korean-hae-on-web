import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { catalog, firstTwelveReviewRows, stageTwoReviewRows } from "./catalog.ts";
import { draftPracticePreview } from "./preview.ts";
import { countSlots, selectPracticeSet, SELECTION_POLICY_VERSION } from "./selection.ts";
import { taskLabel, TASKS } from "./tasks.ts";
import { testOnlyContrast } from "./test-only/d-t-tt.ts";
import { REVIEW_COLUMNS, type Catalog, type ReviewRow } from "./types.ts";
import { validateCatalog } from "./validate.ts";

const firstTwelveFile = JSON.parse(
  readFileSync(fileURLToPath(new URL("./review/first-12.json", import.meta.url)), "utf8"),
) as ReviewRow[];

describe("adult phoneme content catalog", () => {
  it("keeps the shipped catalog internally consistent and unapproved", () => {
    expect(validateCatalog(catalog, firstTwelveReviewRows())).toEqual([]);
    expect(firstTwelveFile).toEqual(firstTwelveReviewRows());
    expect(JSON.stringify(catalog)).not.toContain('"approved"');
    expect(catalog.stages.find((stage) => stage.id === "stage-3")?.lexemeIds).toEqual([]);
    expect(catalog.stages.find((stage) => stage.id === "stage-4")?.lexemeIds).toEqual([]);
    expect(catalog.stages.find((stage) => stage.id === "stage-5")?.lexemeIds).toEqual([]);
    expect(catalog.knownSourceIssues.map((issue) => issue.entryIds.flat().join(","))).toEqual([
      "seed-r4876,seed-r4877",
      "seed-r5029",
    ]);
    expect(catalog.lexemes.some((lexeme) => lexeme.word === "지금" || lexeme.word === "차")).toBe(false);
    expect(catalog.pseudowords).toHaveLength(9);
    expect(catalog.pseudowords.every((word) => word.dictionaryEntry === false)).toBe(true);
  });

  it("uses one task label for the screen and the aggregation key", () => {
    const preview = draftPracticePreview();
    expect(preview.taskLabel).toBe(TASKS.consonant_identification.label);
    expect(preview.taskLabel).toBe(taskLabel(preview.taskKey));
    expect(taskLabel("abx")).toBe("두 소리 비교");
    expect(taskLabel("meaning_check")).toBe("뜻 확인");
  });

  it("fills a 12-item set with balanced items when there is no weak or review sample", () => {
    const preview = draftPracticePreview();
    const counts = countSlots(
      selectPracticeSet(
        preview.cards.map((card) => ({ id: card.itemId, consonant: card.consonant })),
      ).slots,
    );
    expect(preview.policyVersion).toBe(SELECTION_POLICY_VERSION);
    expect(counts).toEqual({ common: 6, weak_candidate: 3, spaced_review: 3 });
    expect(preview.cards).toHaveLength(12);
    expect(new Set(preview.cards.map((card) => card.word)).size).toBe(12);
    for (const consonant of ["ㅈ", "ㅊ", "ㅉ"]) {
      expect(preview.cards.filter((card) => card.consonant === consonant)).toHaveLength(4);
    }
    expect(preview.cards.some((card) => card.reason === "no_weak_sample_filled_with_balanced")).toBe(true);
    expect(preview.cards.find((card) => card.word === "모자")?.flag).toBe("sense_definition_mismatch");
    expect(preview.cards.map((card) => card.word)).not.toContain("감자");
  });

  it("blocks broken references, ambiguous targets, and unapproved public releases", () => {
    const broken = structuredClone(catalog) as Catalog;
    const item = broken.items.find((row) => row.task === "meaning_check");
    if (!item) throw new Error("missing item");
    item.targetOccurrenceId = "occ-missing";
    expect(validateCatalog(broken).some((issue) => issue.code === "broken_reference")).toBe(true);

    const ambiguous = structuredClone(catalog) as Catalog;
    const lexemeId = ambiguous.lexemes[0]?.id;
    if (!lexemeId) throw new Error("missing lexeme");
    ambiguous.occurrences.push({
      ...ambiguous.occurrences[0],
      id: "occ-extra",
      lexemeId,
      syllable: 1,
      charIndex: 0,
    });
    const ambiguousItem = ambiguous.items.find((row) => row.lexemeId === lexemeId);
    if (!ambiguousItem) throw new Error("missing ambiguous item");
    ambiguousItem.targetOccurrenceId = "";
    expect(validateCatalog(ambiguous).some((issue) => issue.code === "ambiguous_occurrence")).toBe(true);

    const published = structuredClone(catalog) as Catalog;
    const publicRelease = published.releases.find((row) => row.visibility === "public");
    const draftItem = published.items.find((row) => row.task === "meaning_check");
    if (!publicRelease || !draftItem) throw new Error("missing release");
    publicRelease.itemIds = [draftItem.id];
    expect(validateCatalog(published).some((issue) => issue.code === "unapproved_public_release")).toBe(true);
  });

  it("accepts another contrast set without adding it to the production list", () => {
    const extended = structuredClone(catalog) as Catalog;
    extended.contrasts.push(testOnlyContrast);
    expect(validateCatalog(extended, firstTwelveReviewRows())).toEqual([]);
    expect(catalog.contrasts.map((contrast) => contrast.id)).not.toContain(testOnlyContrast.id);
    expect(catalog.lexemes.some((lexeme) => testOnlyContrast.consonants.includes(lexeme.consonant))).toBe(false);
    expect(REVIEW_COLUMNS).toContain("meaning_status");
    expect(stageTwoReviewRows().map((row) => row.word)).toEqual(["감자", "편지", "산책", "근처", "진짜", "공짜"]);
    expect(stageTwoReviewRows().every((row) => row.meaning_status === "draft")).toBe(true);
  });
});
