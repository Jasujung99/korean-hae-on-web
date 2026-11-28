import { catalog, reviewRowForLexeme } from "./catalog.ts";
import { selectPracticeSet } from "./selection.ts";
import { taskLabel } from "./tasks.ts";

const SLOT_LABEL = {
  common: "공통",
  weak_candidate: "취약 후보",
  spaced_review: "간격 복습",
} as const;

export type DraftPracticeCard = {
  itemId: string;
  word: string;
  consonant: string;
  pos: string;
  entryId: string;
  slotLabel: string;
  reason: string;
  meaningStatus: string;
  flag: string;
};

export function draftPracticePreview() {
  const release = catalog.releases.find((row) => row.id === "release-draft-preview");
  const cards = (release?.itemIds ?? []).flatMap((itemId) => {
    const item = catalog.items.find((row) => row.id === itemId);
    const lexeme = catalog.lexemes.find((row) => row.id === item?.lexemeId);
    if (!item || !lexeme || !lexeme.firstTwelve) return [];
    return [{ id: item.id, consonant: lexeme.consonant, lexemeId: lexeme.id }];
  });
  const selection = selectPracticeSet(cards);
  const view: DraftPracticeCard[] = selection.slots.flatMap((slot) => {
    const item = catalog.items.find((row) => row.id === slot.itemId);
    const lexeme = catalog.lexemes.find((row) => row.id === item?.lexemeId);
    const source = catalog.sourceEntries.find((row) => row.id === lexeme?.sourceEntryId);
    const revision = catalog.revisions.find((row) => row.id === item?.revisionId);
    if (!lexeme || !source || !revision) return [];
    return [
      {
        itemId: slot.itemId,
        word: lexeme.word,
        consonant: lexeme.consonant,
        pos: lexeme.pos,
        entryId: source.entryId,
        slotLabel: SLOT_LABEL[slot.kind],
        reason: slot.reason,
        meaningStatus: revision.meaningStatus,
        flag: lexeme.flags[0] ?? "",
      },
    ];
  });
  return {
    policyVersion: selection.policyVersion,
    taskKey: "consonant_identification" as const,
    taskLabel: taskLabel("consonant_identification"),
    cards: view,
    reviewNote: reviewRowForLexeme(catalog, "lex-moja").edit_reason,
  };
}
