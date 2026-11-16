import type {
  AudioAsset,
  Catalog,
  ItemVersion,
  KnownSourceIssue,
  Lexeme,
  Occurrence,
  ReviewRow,
  ReviewStatus,
  Revision,
  SourceEntry,
} from "./types.ts";

const SOURCE = {
  inventoryId: "0fbb45e0fe63fe7ce7ff9b15",
  commit: "93f33097cdc1e397aeeb492ed460f1ae3e74ae43",
  path: "supabase/seed.sql",
  schemaVersion: 1,
} as const;

const CONTRAST_ID = "contrast-j-ch-jj";
const MISSING_AUDIO_ID = "audio-missing";

type Candidate = {
  slug: string;
  word: string;
  entryId: string;
  lexemeKey: string;
  pos: string;
  grade: string;
  consonant: string;
  syllable: number;
  charIndex: number;
  followingVowel: string;
  previousSegment: string;
  wordPosition: string;
  stageId: string;
  firstTwelve: boolean;
  meaningStatus: ReviewStatus;
  editReason: string;
  sourceGloss: string;
  flags: string[];
  rejected?: Lexeme["rejectedSenses"];
};

const candidates: Candidate[] = [
  {
    slug: "moja",
    word: "모자",
    entryId: "seed-r1871",
    lexemeKey: "3bbf2ae505cb52125acba07a",
    pos: "명",
    grade: "A",
    consonant: "ㅈ",
    syllable: 2,
    charIndex: 1,
    followingVowel: "ㅏ",
    previousSegment: "ㅗ",
    wordPosition: "medial",
    stageId: "stage-1",
    firstTwelve: true,
    meaningStatus: "needs_review",
    sourceGloss: "머리에 쓰는 물건.",
    editReason: "ERROR_FIX draft. 원본 seed는 바둑 의미로 잘못 연결됨. 승인하지 않음.",
    flags: ["sense_definition_mismatch"],
  },
  candidate("baji", "바지", "seed-r2067", "d3c234751c7b7107c99d73f5", "명", "A", "ㅈ", "ㅣ", "ㅏ"),
  {
    ...candidate("eoje", "어제", "seed-r3522", "b1ddc75d0fb548d645b36e21", "명", "A", "ㅈ", "ㅔ", "ㅓ"),
    editReason: "명사 행을 선택. 부사 행 seed-r3521 / 4abeb829f1957562dbc5f498 은 쓰지 않음.",
    rejected: [
      {
        entryId: "seed-r3521",
        lexemeKey: "4abeb829f1957562dbc5f498",
        pos: "부",
        reason: "같은 표기의 부사 행 대신 명사 행을 선택",
      },
    ],
  },
  candidate("uija", "의자", "seed-r4058", "653b62f2e9837d309305a0c3", "명", "A", "ㅈ", "ㅏ", "ㅢ"),
  candidate("gicha", "기차", "seed-r807", "c87b1376b44d2cd3e068114d", "명", "A", "ㅊ", "ㅏ", "ㅣ"),
  candidate("achim", "아침", "seed-r3356", "21d57942d1a2fdc69598644d", "명", "A", "ㅊ", "ㅣ", "ㅏ"),
  candidate("gochida", "고치다", "seed-r378", "b2e95e37e7b887cdaa1e6bf5", "동", "B", "ㅊ", "ㅣ", "ㅗ", 2, 1),
  candidate("gareuchida", "가르치다", "seed-r32", "2f669238c9ff60f0cd69277d", "동", "A", "ㅊ", "ㅣ", "ㅡ", 3, 2),
  candidate("gajja", "가짜", "seed-r71", "6c9f4130f795d9a60b952b0b", "명", "B", "ㅉ", "ㅏ", "ㅏ"),
  candidate("ijjok", "이쪽", "seed-r4157", "6f20acddf4c94a22a3e00a5b", "대", "A", "ㅉ", "ㅗ", "ㅣ"),
  candidate("geujjok", "그쪽", "seed-r691", "c88875bb0dfda103793529fc", "대", "A", "ㅉ", "ㅗ", "ㅡ"),
  candidate("yeojjuda", "여쭈다", "seed-r3617", "2d4ec6a53ef47887684e3d47", "동", "B", "ㅉ", "ㅜ", "ㅕ"),
  postNasal("gamja", "감자", "seed-r134", "396d02ff7f7b18eaa1724111", "ㅈ", "ㅏ", "ㅁ"),
  postNasal("pyeonji", "편지", "seed-r5522", "178e5731ed2913e0a948d875", "ㅈ", "ㅣ", "ㄴ"),
  postNasal("sanchaek", "산책", "seed-r2635", "0f70e9859a25c56eaa607149", "ㅊ", "ㅐ", "ㄴ"),
  postNasal("geuncheo", "근처", "seed-r714", "faa629ccf7a86b0ecd633ce1", "ㅊ", "ㅓ", "ㄴ"),
  {
    ...postNasal("jinjja", "진짜", "seed-r4966", "5781c582fd9204a6c3824a9f", "ㅉ", "ㅏ", "ㄴ"),
    pos: "명",
    editReason: "명사 행을 선택. 부사 행 seed-r4967 / 93f89378acb9b2e4e5577576 은 쓰지 않음.",
    rejected: [
      {
        entryId: "seed-r4967",
        lexemeKey: "93f89378acb9b2e4e5577576",
        pos: "부",
        reason: "같은 표기의 부사 행 대신 명사 행을 선택",
      },
    ],
  },
  postNasal("gongjja", "공짜", "seed-r434", "e39eb0dc8ed61524d12f7f81", "ㅉ", "ㅏ", "ㅇ"),
];

function candidate(
  slug: string,
  word: string,
  entryId: string,
  lexemeKey: string,
  pos: string,
  grade: string,
  consonant: string,
  followingVowel: string,
  previousSegment: string,
  syllable = 2,
  charIndex = 1,
): Candidate {
  return {
    slug,
    word,
    entryId,
    lexemeKey,
    pos,
    grade,
    consonant,
    syllable,
    charIndex,
    followingVowel,
    previousSegment,
    wordPosition: "medial",
    stageId: "stage-1",
    firstTwelve: true,
    meaningStatus: "draft",
    editReason: "",
    sourceGloss: "",
    flags: [],
  };
}

function postNasal(
  slug: string,
  word: string,
  entryId: string,
  lexemeKey: string,
  consonant: string,
  followingVowel: string,
  previousSegment: string,
): Candidate {
  return {
    slug,
    word,
    entryId,
    lexemeKey,
    pos: "명",
    grade: "",
    consonant,
    syllable: 2,
    charIndex: 1,
    followingVowel,
    previousSegment,
    wordPosition: "post_nasal",
    stageId: "stage-2",
    firstTwelve: false,
    meaningStatus: "draft",
    editReason: "첫 12개 검수 목록 밖. 비음 뒤 후보 초안.",
    sourceGloss: "",
    flags: [],
  };
}

const pseudowordSpecs = [
  ["aja", "아자", "ㅈ"],
  ["acha", "아차", "ㅊ"],
  ["ajja", "아짜", "ㅉ"],
  ["ija", "이자", "ㅈ"],
  ["icha", "이차", "ㅊ"],
  ["ijja", "이짜", "ㅉ"],
  ["oja", "오자", "ㅈ"],
  ["ocha", "오차", "ㅊ"],
  ["ojja", "오짜", "ㅉ"],
] as const;

const knownSourceIssues: KnownSourceIssue[] = [
  {
    entryIds: ["seed-r4876", "seed-r4877"],
    word: "지금",
    problem: "원본 연결 뜻이 황금으로 연결되어 있다.",
  },
  {
    entryIds: ["seed-r5029"],
    word: "차",
    problem: "차(茶) 행이 비녀 뜻에 연결되어 있다.",
  },
];

function buildCatalog(): Catalog {
  const sourceEntries: SourceEntry[] = [];
  const lexemes: Lexeme[] = [];
  const revisions: Revision[] = [];
  const occurrences: Occurrence[] = [];
  const items: ItemVersion[] = [];

  for (const row of candidates) {
    const sourceId = `src-${row.entryId}`;
    const lexemeId = `lex-${row.slug}`;
    const revisionId = `rev-${row.slug}-draft`;
    const occurrenceId = `occ-${row.slug}`;
    sourceEntries.push({
      id: sourceId,
      entryId: row.entryId,
      lexemeKey: row.lexemeKey,
      inventoryId: SOURCE.inventoryId,
      sourceCommit: SOURCE.commit,
      sourcePath: SOURCE.path,
      schemaVersion: SOURCE.schemaVersion,
    });
    lexemes.push({
      id: lexemeId,
      word: row.word,
      pos: row.pos,
      grade: row.grade,
      consonant: row.consonant,
      contrastId: CONTRAST_ID,
      sourceEntryId: sourceId,
      stageId: row.stageId,
      firstTwelve: row.firstTwelve,
      flags: row.flags,
      rejectedSenses: row.rejected ?? [],
    });
    revisions.push({
      id: revisionId,
      lexemeId,
      sourceGloss: row.sourceGloss,
      learnerDefinition: "",
      example: "",
      exampleSource: "",
      editReason: row.editReason,
      meaningStatus: row.meaningStatus,
      exampleStatus: "unreviewed",
    });
    occurrences.push({
      id: occurrenceId,
      lexemeId,
      writtenJamo: row.consonant,
      surfacePhoneme: row.consonant,
      syllable: row.syllable,
      charIndex: row.charIndex,
      wordPosition: row.wordPosition,
      previousSegment: row.previousSegment,
      followingVowel: row.followingVowel,
      process: "",
      pronunciationStatus: "unreviewed",
    });
    items.push({
      id: `item-meaning-${row.slug}`,
      task: "meaning_check",
      contrastId: CONTRAST_ID,
      revisionId,
      lexemeId,
      targetOccurrenceId: occurrenceId,
      pseudowordId: "",
      audioIds: [MISSING_AUDIO_ID],
    });
  }

  const pseudowords = pseudowordSpecs.map(([slug, text, consonant]) => ({
    id: `pw-${slug}`,
    text,
    consonant,
    contrastId: CONTRAST_ID,
    dictionaryEntry: false as const,
  }));

  for (const word of pseudowords) {
    items.push({
      id: `item-identify-${word.id}`,
      task: "consonant_identification",
      contrastId: CONTRAST_ID,
      revisionId: "",
      lexemeId: "",
      targetOccurrenceId: "",
      pseudowordId: word.id,
      audioIds: [MISSING_AUDIO_ID],
    });
  }

  items.push({
    id: "item-abx-draft",
    task: "abx",
    contrastId: CONTRAST_ID,
    revisionId: "",
    lexemeId: "",
    targetOccurrenceId: "",
    pseudowordId: "",
    audioIds: ["audio-missing", "audio-missing", "audio-missing"],
  });

  const audioAssets: AudioAsset[] = [
    {
      id: MISSING_AUDIO_ID,
      status: "missing",
      model: "",
      voice: "",
      mime: "",
      sha256: "",
      generatedAt: "",
    },
  ];

  const firstTwelve = lexemes.filter((lexeme) => lexeme.firstTwelve).map((lexeme) => lexeme.id);
  const stageTwo = lexemes.filter((lexeme) => lexeme.stageId === "stage-2").map((lexeme) => lexeme.id);
  const previewItems = items.filter((item) => item.task === "meaning_check" && firstTwelve.includes(item.lexemeId));

  return {
    schemaVersion: SOURCE.schemaVersion,
    source: { ...SOURCE },
    stages: [
      { id: "stage-0", name: "첫 듣기 점검", lexemeIds: [] },
      { id: "stage-1", name: "모음 사이", lexemeIds: firstTwelve },
      { id: "stage-2", name: "비음 뒤", lexemeIds: stageTwo },
      { id: "stage-3", name: "어두 ㅣ·ㅜ", lexemeIds: [] },
      { id: "stage-4", name: "어두 ㅏ·ㅓ·ㅗ", lexemeIds: [] },
      { id: "stage-5", name: "전이와 음운 변동", lexemeIds: [] },
    ],
    contrasts: [
      {
        id: CONTRAST_ID,
        label: "ㅈ·ㅊ·ㅉ",
        consonants: ["ㅈ", "ㅊ", "ㅉ"],
      },
    ],
    pseudowords,
    sourceEntries,
    lexemes,
    revisions,
    occurrences,
    audioAssets,
    items,
    releases: [
      { id: "release-public-none", visibility: "public", itemIds: [] },
      {
        id: "release-draft-preview",
        visibility: "preview",
        itemIds: previewItems.map((item) => item.id),
      },
    ],
    knownSourceIssues,
  };
}

export const catalog: Catalog = buildCatalog();

export function reviewRowForLexeme(input: Catalog, lexemeId: string): ReviewRow {
  const lexeme = input.lexemes.find((row) => row.id === lexemeId);
  const revision = input.revisions.find((row) => row.lexemeId === lexemeId);
  const occurrence = input.occurrences.find((row) => row.lexemeId === lexemeId);
  const source = input.sourceEntries.find((row) => row.id === lexeme?.sourceEntryId);
  const audio = input.audioAssets.find((row) => row.id === MISSING_AUDIO_ID);
  if (!lexeme || !revision || !occurrence || !source || !audio) {
    throw new Error(`review row is incomplete for ${lexemeId}`);
  }
  return {
    source_entry_id: source.entryId,
    lexeme_key: source.lexemeKey,
    sense_id: "",
    revision_id: revision.id,
    word: lexeme.word,
    pos: lexeme.pos,
    source_gloss: revision.sourceGloss,
    learner_definition: revision.learnerDefinition,
    example: revision.example,
    example_source: revision.exampleSource,
    edit_reason: revision.editReason,
    occurrence_id: occurrence.id,
    written_jamo: occurrence.writtenJamo,
    surface_phoneme: occurrence.surfacePhoneme,
    word_position: occurrence.wordPosition,
    previous_segment: occurrence.previousSegment,
    following_vowel: occurrence.followingVowel,
    process: occurrence.process,
    stage_links: lexeme.stageId,
    meaning_status: revision.meaningStatus,
    example_status: revision.exampleStatus,
    pronunciation_status: occurrence.pronunciationStatus,
    audio_status: audio.status,
    reviewer: "",
    reviewed_at: "",
  };
}

export function firstTwelveReviewRows(input: Catalog = catalog): ReviewRow[] {
  return input.lexemes.filter((lexeme) => lexeme.firstTwelve).map((lexeme) => reviewRowForLexeme(input, lexeme.id));
}

export function stageTwoReviewRows(input: Catalog = catalog): ReviewRow[] {
  return input.lexemes
    .filter((lexeme) => lexeme.stageId === "stage-2")
    .map((lexeme) => reviewRowForLexeme(input, lexeme.id));
}
