import { REVIEW_COLUMNS, type Catalog, type ItemVersion, type ReviewRow, type ReviewStatus } from "./types.ts";
import { TASK_KEYS, type TaskKey } from "./tasks.ts";

export type ValidationIssue = {
  code: "broken_reference" | "ambiguous_occurrence" | "unapproved_public_release" | "review_file";
  path: string;
  message: string;
};

const APPROVED: ReviewStatus = "approved";

export function validateCatalog(catalog: Catalog, reviewRows: ReviewRow[] = []): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const lexemes = new Map(catalog.lexemes.map((row) => [row.id, row]));
  const revisions = new Map(catalog.revisions.map((row) => [row.id, row]));
  const occurrences = new Map(catalog.occurrences.map((row) => [row.id, row]));
  const audio = new Map(catalog.audioAssets.map((row) => [row.id, row]));
  const pseudowords = new Map(catalog.pseudowords.map((row) => [row.id, row]));
  const items = new Map(catalog.items.map((row) => [row.id, row]));
  const contrasts = new Map(catalog.contrasts.map((row) => [row.id, row]));

  for (const word of catalog.pseudowords) {
    if (word.dictionaryEntry !== false || catalog.lexemes.some((lexeme) => lexeme.word === word.text && lexeme.id === word.id)) {
      issues.push({
        code: "broken_reference",
        path: `pseudowords.${word.id}`,
        message: "의사단어는 사전 표제어로 등록하지 않습니다.",
      });
    }
  }

  for (const item of catalog.items) {
    checkItem(catalog, item, { lexemes, revisions, occurrences, audio, pseudowords, contrasts }, issues);
  }

  for (const release of catalog.releases) {
    for (const itemId of release.itemIds) {
      const item = items.get(itemId);
      if (!item) {
        issues.push({
          code: "broken_reference",
          path: `releases.${release.id}.${itemId}`,
          message: "릴리스가 없는 문항을 가리킵니다.",
        });
        continue;
      }
      if (release.visibility === "public" && !isPublicReady(item, { revisions, occurrences, audio })) {
        issues.push({
          code: "unapproved_public_release",
          path: `releases.${release.id}.${itemId}`,
          message: "승인되지 않은 콘텐츠는 공개 릴리스에 넣을 수 없습니다.",
        });
      }
    }
  }

  if (reviewRows.length > 0) {
    checkReviewRows(catalog, reviewRows, issues);
  }

  return issues;
}

function checkItem(
  catalog: Catalog,
  item: ItemVersion,
  index: {
    lexemes: Map<string, Catalog["lexemes"][number]>;
    revisions: Map<string, Catalog["revisions"][number]>;
    occurrences: Map<string, Catalog["occurrences"][number]>;
    audio: Map<string, Catalog["audioAssets"][number]>;
    pseudowords: Map<string, Catalog["pseudowords"][number]>;
    contrasts: Map<string, Catalog["contrasts"][number]>;
  },
  issues: ValidationIssue[],
) {
  if (!TASK_KEYS.includes(item.task)) {
    issues.push({
      code: "broken_reference",
      path: `items.${item.id}.task`,
      message: "알 수 없는 과제 유형입니다.",
    });
  }
  if (!index.contrasts.has(item.contrastId)) {
    issues.push({
      code: "broken_reference",
      path: `items.${item.id}.contrastId`,
      message: "대립 묶음이 없습니다.",
    });
  }
  if (item.revisionId && !index.revisions.has(item.revisionId)) {
    issues.push({
      code: "broken_reference",
      path: `items.${item.id}.revisionId`,
      message: "학습용 판이 없습니다.",
    });
  }
  if (item.lexemeId && !index.lexemes.has(item.lexemeId)) {
    issues.push({
      code: "broken_reference",
      path: `items.${item.id}.lexemeId`,
      message: "표제어가 없습니다.",
    });
  }
  if (item.targetOccurrenceId && !index.occurrences.has(item.targetOccurrenceId)) {
    issues.push({
      code: "broken_reference",
      path: `items.${item.id}.targetOccurrenceId`,
      message: "목표 발음 출현이 없습니다.",
    });
  }
  if (item.pseudowordId && !index.pseudowords.has(item.pseudowordId)) {
    issues.push({
      code: "broken_reference",
      path: `items.${item.id}.pseudowordId`,
      message: "의사단어가 없습니다.",
    });
  }
  for (const audioId of item.audioIds) {
    if (!index.audio.has(audioId)) {
      issues.push({
        code: "broken_reference",
        path: `items.${item.id}.audioIds`,
        message: "음원 판이 없습니다.",
      });
    }
  }

  if (!item.lexemeId) return;
  const related = catalog.occurrences.filter((occurrence) => occurrence.lexemeId === item.lexemeId);
  if (related.length > 1 && !item.targetOccurrenceId) {
    issues.push({
      code: "ambiguous_occurrence",
      path: `items.${item.id}.targetOccurrenceId`,
      message: "목표 소리가 여러 번 나오는 단어는 출현을 지정해야 합니다.",
    });
  }
}

function isPublicReady(
  item: ItemVersion,
  index: {
    revisions: Map<string, Catalog["revisions"][number]>;
    occurrences: Map<string, Catalog["occurrences"][number]>;
    audio: Map<string, Catalog["audioAssets"][number]>;
  },
): boolean {
  const audioReady = item.audioIds.every((id) => index.audio.get(id)?.status === APPROVED);
  if (!audioReady) return false;
  if (item.task === "consonant_identification" || item.task === "abx") {
    if (!item.targetOccurrenceId) return item.pseudowordId !== "";
    return index.occurrences.get(item.targetOccurrenceId)?.pronunciationStatus === APPROVED;
  }
  const revision = item.revisionId ? index.revisions.get(item.revisionId) : undefined;
  const occurrence = item.targetOccurrenceId ? index.occurrences.get(item.targetOccurrenceId) : undefined;
  return (
    revision?.meaningStatus === APPROVED &&
    revision.exampleStatus === APPROVED &&
    occurrence?.pronunciationStatus === APPROVED
  );
}

function checkReviewRows(catalog: Catalog, reviewRows: ReviewRow[], issues: ValidationIssue[]) {
  const firstTwelve = catalog.lexemes.filter((lexeme) => lexeme.firstTwelve);
  if (reviewRows.length !== firstTwelve.length) {
    issues.push({
      code: "review_file",
      path: "review.first-12",
      message: "첫 12개 검수 행 수가 표제어 수와 다릅니다.",
    });
  }
  for (const row of reviewRows) {
    for (const column of REVIEW_COLUMNS) {
      if (!(column in row)) {
        issues.push({
          code: "review_file",
          path: `review.${row.word}.${column}`,
          message: "검수 열 이 빠졌습니다.",
        });
      }
    }
    if (row.meaning_status === APPROVED || row.audio_status === APPROVED || row.pronunciation_status === APPROVED) {
      issues.push({
        code: "unapproved_public_release",
        path: `review.${row.word}`,
        message: "사람 검수 없이 승인으로 적힌 행입니다.",
      });
    }
  }
}

export function taskKeyIsKnown(value: string): value is TaskKey {
  return TASK_KEYS.includes(value as TaskKey);
}
