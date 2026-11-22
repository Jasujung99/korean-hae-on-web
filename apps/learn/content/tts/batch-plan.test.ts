import { describe, expect, it } from "vitest";
import { createFixtureAudio } from "../../server/preview/audio.ts";
import { audioPicker } from "../../server/learn/practice.ts";
import { batchPlan, groupContents, groupPartCount, makeDoneCheck, turnsAudioId } from "./batch-plan.ts";
import { activeAssetTexts } from "../../scripts/tts-source.ts";
import { allContentAudioIds } from "../../server/preview/audio-ids.ts";
import type { AudioAssetRow } from "../../server/content/repo.ts";
import { voicedAudioId } from "../practice-voices.ts";
import {
  snapshotFromReferenceJson,
  snapshotSentenceAudioBase,
  snapshotWordAudioBase,
  workingSnapshot,
  type ReleaseCandidateItem,
  type SnapshotWord,
} from "../snapshot.ts";
import { FLAT_READING_STYLE, pcmToWav } from "./pipeline.ts";
import { splitChecked } from "./split.ts";

describe("batch plan", () => {
  const none = () => false;

  it("groups pseudowords with fillers, words per content without fillers, and two example versions", () => {
    const groups = batchPlan("sulafat", ["pseudo", "stage0", "words", "sentences", "turns"], none);
    const pseudo = groups.find((group) => group.kind === "pseudo");
    expect(pseudo?.items).toHaveLength(9);
    expect(pseudo && groupPartCount(pseudo)).toBe(11);
    const pseudoText = pseudo ? groupContents(pseudo) : [];
    expect(pseudoText).toHaveLength(1);
    expect(pseudoText[0]?.text.startsWith("네. <long pause> ")).toBe(true);
    expect(pseudoText[0]?.annotations).toEqual([{ type: "speech_metadata", style: FLAT_READING_STYLE }]);
    // ㅉ가 늘 끝에 오지 않게 섞는다.
    expect(pseudo?.items.map((item) => item.text)).not.toEqual(["아자", "아차", "아짜", "이자", "이차", "이짜", "오자", "오차", "오짜"]);

    const words = groups.filter((group) => group.kind === "words");
    expect(words.every((group) => group.method === "per_content_group" && !group.fillers && group.items.length <= 25)).toBe(true);
    const first = words[0];
    expect(first && groupContents(first)).toHaveLength(first?.items.length ?? 0);

    const spoken = groups.filter((group) => group.kind === "sentences");
    const turns = groups.filter((group) => group.kind === "turns");
    expect(spoken.every((group) => group.method === "pause_group" && group.style === null)).toBe(true);
    expect(turns.every((group) => group.method === "per_content_group")).toBe(true);
    expect(turns[0]?.items[0]?.id.endsWith("--sulafat--turns")).toBe(true);
    expect(spoken.reduce((sum, group) => sum + group.items.length, 0)).toBe(turns.reduce((sum, group) => sum + group.items.length, 0));
  });

  it("skips sounds already made in grouped form", () => {
    const all = batchPlan("erinome", ["words"], none);
    const firstId = all[0]?.items[0]?.id ?? "";
    const rest = batchPlan("erinome", ["words"], (id) => id === firstId);
    const count = (list: typeof all) => list.reduce((sum, group) => sum + group.items.length, 0);
    expect(count(rest)).toBe(count(all) - 1);
  });
});

describe("checked split", () => {
  const RATE = 24_000;
  const clip = (pieces: Array<{ tone?: number; silence?: number }>) => {
    const samples: number[] = [];
    for (const piece of pieces) {
      const count = Math.round(((piece.tone ?? piece.silence ?? 0) * RATE) / 1000);
      for (let index = 0; index < count; index += 1) samples.push(piece.tone ? Math.round(8000 * Math.sin(index / 6)) : 0);
    }
    return pcmToWav(new Uint8Array(new Int16Array(samples).buffer), RATE, 1);
  };

  it("cuts when the pauses between sounds are clearly longer", () => {
    const wav = clip([{ silence: 100 }, { tone: 400 }, { silence: 1000 }, { tone: 300 }, { silence: 150 }, { tone: 200 }, { silence: 1000 }, { tone: 400 }]);
    const result = splitChecked(wav, 3, 300);
    expect(result?.ok).toBe(true);
    expect(result?.parts).toHaveLength(3);
  });

  it("refuses to cut when pauses are not distinct", () => {
    const wav = clip([{ tone: 400 }, { silence: 400 }, { tone: 300 }, { silence: 350 }, { tone: 400 }]);
    const result = splitChecked(wav, 2, 300);
    expect(result?.ok).toBe(false);
    expect(result?.reason).toBe("pauses_not_distinct");
  });
});

describe("example reading", () => {
  it("plays the turns version when chosen and falls back to the spoken one", () => {
    const wav = new Uint8Array([0x52, 0x49, 0x46, 0x46]);
    const base = "sentence-1871-모자";
    const audio = createFixtureAudio({ [`${base}--erinome`]: wav, [turnsAudioId(`${base}--erinome`)]: wav, "sentence-807-기차--erinome": wav });
    const turns = audioPicker(audio, "erinome", "turns");
    expect(turns.exampleRefOf(base)).toBe(audio.refFor(turnsAudioId(`${base}--erinome`)));
    expect(turns.exampleRefOf("sentence-807-기차")).toBe(audio.refFor("sentence-807-기차--erinome"));
    expect(audioPicker(audio, "erinome", "spoken").exampleRefOf(base)).toBe(audio.refFor(`${base}--erinome`));
  });
});

describe("other consonant groups", () => {
  it("loads the four group tables from the PR #5 placement tables", async () => {
    const { groupWords, groupStageZero, groupPseudowords, OTHER_GROUP_IDS } = await import("../group-tables.ts");
    expect([...OTHER_GROUP_IDS].sort()).toEqual(["b_p_pp", "d_t_tt", "g_k_kk", "s_ss"]);
    expect(groupWords("s_ss")).toHaveLength(42);
    expect(groupWords("g_k_kk")).toHaveLength(61);
    expect(groupWords("b_p_pp")).toHaveLength(59);
    expect(groupWords("d_t_tt")).toHaveLength(60);
    expect(groupPseudowords("s_ss")).toEqual(["아사", "아싸", "이사", "이싸", "오사", "오싸"]);
    expect(groupStageZero("s_ss")).toHaveLength(6);
    // 묶음을 섞지 않는다: ㅅ·ㅆ 표에 ㅈ·ㅊ·ㅉ 낱말이 들어오지 않는다.
    expect(groupWords("s_ss").every((word) => word.consonant === "ㅅ" || word.consonant === "ㅆ")).toBe(true);
  });

  it("plans a group and makes a word shared by two groups only once", () => {
    const taken = new Set<string>();
    const first = batchPlan("charon", ["words"], () => false, "b_p_pp", taken);
    const second = batchPlan("charon", ["words"], () => false, "j_ch_jj", taken);
    const ids = [...first, ...second].flatMap((group) => group.items.map((item) => item.id));
    expect(new Set(ids).size).toBe(ids.length);
    expect(first[0]?.groupId.startsWith("words-charon-b_p_pp-")).toBe(true);
    const pseudo = batchPlan("charon", ["pseudo"], () => false, "s_ss");
    expect(pseudo[0]?.items).toHaveLength(6);
  });
});

describe("content DB as the TTS source", () => {
  const asItem = (word: SnapshotWord, status: "draft" | "approved" | "hidden" = "approved"): ReleaseCandidateItem => ({ ...word, status });
  const ids = (groups: ReturnType<typeof batchPlan>) => new Set(groups.flatMap((group) => group.items.map((item) => item.id)));

  it("plans examples newly filled in the DB in both example versions", () => {
    const ref = snapshotFromReferenceJson();
    const blank = ref.items.find((word) => !word.example);
    expect(blank).toBeDefined();
    if (!blank) return;
    const filled = { ...blank, example: "새로 채운 예문이에요." };
    const db = workingSnapshot(
      ref.items.map((word) => asItem(word.id === blank.id ? filled : word)),
      ref.stage0,
    );
    const voiced = voicedAudioId(snapshotSentenceAudioBase(blank), "erinome");
    const fromJson = ids(batchPlan("erinome", ["sentences", "turns"], () => false, blank.groupId, new Set(), {}, ref));
    const fromDb = batchPlan("erinome", ["sentences", "turns"], () => false, blank.groupId, new Set(), {}, db);
    expect(fromJson.has(voiced)).toBe(false);
    expect(ids(fromDb).has(voiced)).toBe(true);
    expect(ids(fromDb).has(turnsAudioId(voiced))).toBe(true);
    const item = fromDb.flatMap((group) => group.items).find((row) => row.id === voiced);
    expect(item?.text).toBe("새로 채운 예문이에요.");
  });

  it("keeps draft words, drops hidden ones, and names a teacher-added word like the app does", () => {
    const ref = snapshotFromReferenceJson();
    const base = ref.items.find((word) => word.groupId === "s_ss");
    if (!base) throw new Error("no s_ss word");
    const added: SnapshotWord = { ...base, id: "3f2a9c1e-7b6d-4c1a-9e2f-000000000000", legacyId: null, entryId: null, word: "새말", example: "새말 예문이에요.", sortOrder: 999 };
    const hidden: SnapshotWord = { ...base, id: "hidden-1", entryId: 999999, word: "숨김말", sortOrder: 1000 };
    const db = workingSnapshot([...ref.items.map((word) => asItem(word)), asItem(added, "draft"), asItem(hidden, "hidden")], ref.stage0);
    const planned = ids(batchPlan("charon", ["words", "sentences", "turns"], () => false, "s_ss", new Set(), {}, db));
    const wordId = voicedAudioId(snapshotWordAudioBase(added), "charon");
    expect(wordId).toBe("word-c3f2a9c1e-새말--charon");
    expect(planned.has(wordId)).toBe(true);
    expect(planned.has(turnsAudioId(voicedAudioId(snapshotSentenceAudioBase(added), "charon")))).toBe(true);
    expect([...planned].some((id) => id.includes("숨김말"))).toBe(false);
    // 앱이 찾는 음원 id 목록에도 같은 id가 있다.
    const appIds = new Set(allContentAudioIds(db.items, db.stage0));
    for (const id of planned) expect(appIds.has(id)).toBe(true);
  });

  it("makes a sound again when its text changed or its DB asset went stale", () => {
    const ref = snapshotFromReferenceJson();
    const word = ref.items.find((row) => row.example && row.groupId === "j_ch_jj");
    if (!word) throw new Error("no example");
    const id = voicedAudioId(snapshotSentenceAudioBase(word), "sulafat");
    const planIds = (done: ReturnType<typeof makeDoneCheck>) => ids(batchPlan("sulafat", ["sentences"], done, "j_ch_jj", new Set(), {}, ref));

    // 로컬 meta 글자가 지금 표와 같으면 건너뛰고, 다르면 다시 만든다.
    const localSame = makeDoneCheck({ doneLocal: (key, text) => key === id && text === word.example, dbActive: new Map(), replace: false });
    expect(planIds(localSame).has(id)).toBe(false);
    const localOld = makeDoneCheck({ doneLocal: (key, text) => key === id && text === "예전 예문.", dbActive: new Map(), replace: false });
    expect(planIds(localOld).has(id)).toBe(true);

    // DB 자산: 글자가 같고 stale이 아니면 건너뛴다. stale이거나 글자가 다르면 다시 만든다.
    const asset = (text: string, stale: boolean) => ({ audioId: id, text, stale, status: "approved" }) as AudioAssetRow;
    const dbCheck = (rows: AudioAssetRow[]) => makeDoneCheck({ doneLocal: () => false, dbActive: activeAssetTexts(rows), replace: false });
    expect(planIds(dbCheck([asset(word.example, false)])).has(id)).toBe(false);
    expect(planIds(dbCheck([asset(word.example, true)])).has(id)).toBe(true);
    expect(planIds(dbCheck([asset("예전 예문.", false)])).has(id)).toBe(true);
  });
});
