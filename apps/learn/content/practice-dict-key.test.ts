import { describe, expect, it } from "vitest";
import { practiceWords } from "./practice.ts";
import { snapshotFromReferenceJson } from "./snapshot.ts";

describe("word cards keep the dictionary key after the DB move", () => {
  it("uses the table id (jcj-…) even when the DB gives words uuid ids", () => {
    const base = snapshotFromReferenceJson();
    const fromDb = { ...base, items: base.items.map((item, i) => ({ ...item, id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}` })) };
    const cards = practiceWords(fromDb);
    expect(cards.length).toBeGreaterThan(0);
    for (const card of cards) expect(card.tableId).toMatch(/^jcj-\d+$/);
  });
});
