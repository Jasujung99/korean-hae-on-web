// 만든 음원 목록. 연습에 필요한 음원(의사단어·첫 듣기 음절·낱말·예문)을 목소리별로 맞춰 보고,
// 실제 폴더의 파일과 메타데이터(목소리·모델·만든 때·톤 지시·길이)를 함께 보여 준다.
// 키를 쓰거나 생성을 부르지 않는다. 화면에는 목록 전용 ref만 준다.
import { contrastOf } from "../../content/contrast.ts";
import { coreWords, sentenceAudioBase, stageZeroCells, syllableAudioBase, wordAudioBase } from "../../content/core-table.ts";
import { PRACTICE_GROUP_ID, PRACTICE_ITEMS } from "../../content/practice.ts";
import { PRACTICE_VOICES, voicedAudioId, type PracticeVoiceKey } from "../../content/practice-voices.ts";
import { AUDITION_VOICES, auditionAudioId, flatAuditionAudioId } from "../../content/voices.ts";
import type { PreviewAudio } from "./audio.ts";
import type {
  AudioCellView,
  AudioColumnView,
  AudioGroupView,
  AudioInventoryView,
  AudioUnitKind,
  AudioUnitView,
  LengthCheckView,
} from "./contract.ts";

export const LEGACY_COLUMN = "legacy";

const COLUMNS: AudioColumnView[] = [
  ...PRACTICE_VOICES.map((row) => ({ key: row.key, label: `${row.voice} · ${row.label}`, voice: row.voice })),
  { key: LEGACY_COLUMN, label: "예전 초안 · Iapetus", voice: "Iapetus" },
];

type Unit = { base: string; legacy: string | null; groupId: string; kind: AudioUnitKind; text: string };

const STAGES = ["Stage 1", "Stage 2", "Stage 3", "Stage 4", "Stage 5"] as const;
const stageKey = (stage: string) => stage.replace("Stage ", "s");

/** tts 스크립트의 practice 명령이 만드는 것과 같은 범위 */
function expectedUnits(): { units: Unit[]; groups: Array<Omit<AudioGroupView, "total" | "ready">> } {
  const units: Unit[] = [];
  const seen = new Set<string>();
  const add = (unit: Unit) => {
    if (seen.has(unit.base)) return;
    seen.add(unit.base);
    units.push(unit);
  };
  for (const item of PRACTICE_ITEMS) {
    add({ base: item.audioId, legacy: item.audioId, groupId: "pseudo-s1", kind: "pseudoword", text: item.stimulus });
  }
  for (const cell of stageZeroCells()) {
    const base = syllableAudioBase(cell.stimulus);
    add({ base, legacy: base, groupId: "syllable-s0", kind: "syllable", text: cell.stimulus });
  }
  for (const word of coreWords()) {
    add({
      base: wordAudioBase(word),
      legacy: word.stage === "Stage 1" ? `word-Stage1-${word.entryId}-${word.word}` : null,
      groupId: `word-${stageKey(word.stage)}`,
      kind: "word",
      text: word.word,
    });
  }
  for (const word of coreWords()) {
    if (!word.example) continue;
    add({
      base: sentenceAudioBase(word),
      legacy: word.stage === "Stage 1" ? `sentence-Stage1-${word.entryId}-${word.word}` : null,
      groupId: `sentence-${stageKey(word.stage)}`,
      kind: "sentence",
      text: word.example,
    });
  }
  const groups: Array<Omit<AudioGroupView, "total" | "ready">> = [
    { id: "pseudo-s1", label: "의사단어 · Stage 1", kind: "pseudoword" },
    { id: "syllable-s0", label: "첫 듣기 음절 · Stage 0", kind: "syllable" },
    ...STAGES.map((stage) => ({ id: `word-${stageKey(stage)}`, label: `낱말 · ${stage}`, kind: "word" as const })),
    ...STAGES.map((stage) => ({ id: `sentence-${stageKey(stage)}`, label: `예문 · ${stage}`, kind: "sentence" as const })),
  ];
  return { units, groups: groups.filter((group) => units.some((unit) => unit.groupId === group.id)) };
}

function cellOf(audio: PreviewAudio, id: string): AudioCellView | null {
  const info = audio.info(id);
  if (!info) return null;
  const meta = audio.meta(id);
  return {
    id,
    ref: audio.inventoryRef(id),
    voice: meta?.voice ?? "",
    model: meta?.model ?? "",
    generatedAt: meta?.generatedAt ?? "",
    durationMs: info.durationMs,
    bytes: info.bytes,
    style: meta ? (meta.stylePrompt ? "flat" : "plain") : null,
  };
}

function spread(values: Array<number | null>): number | null {
  const known = values.filter((value): value is number => typeof value === "number" && value > 0);
  if (known.length < 2) return null;
  const min = Math.min(...known);
  return Math.round(((Math.max(...known) - min) / min) * 100);
}

function columnId(unit: Unit, key: string): string | null {
  return key === LEGACY_COLUMN ? unit.legacy : voicedAudioId(unit.base, key as PracticeVoiceKey);
}

export function buildInventory(audio: PreviewAudio, rawDir = "apps/learn/audio/raw"): AudioInventoryView {
  const { units, groups } = expectedUnits();
  const used = new Set<string>();
  const unitViews: AudioUnitView[] = units.map((unit) => {
    const cells: Record<string, AudioCellView | null> = {};
    for (const column of COLUMNS) {
      const id = columnId(unit, column.key);
      const cell = id ? cellOf(audio, id) : null;
      if (cell) used.add(cell.id);
      cells[column.key] = cell;
    }
    return { base: unit.base, groupId: unit.groupId, kind: unit.kind, text: unit.text, cells };
  });

  const groupViews: AudioGroupView[] = groups.map((group) => {
    const rows = unitViews.filter((unit) => unit.groupId === group.id);
    return {
      ...group,
      total: rows.length,
      ready: Object.fromEntries(COLUMNS.map((column) => [column.key, rows.filter((row) => row.cells[column.key]).length])),
    };
  });

  const auditions = AUDITION_VOICES.map((row) => {
    const plain = cellOf(audio, auditionAudioId(row.voice));
    const flat = cellOf(audio, flatAuditionAudioId(row.voice));
    if (plain) used.add(plain.id);
    if (flat) used.add(flat.id);
    return { voice: row.voice, plain, flat };
  }).filter((row) => row.plain || row.flat);

  const others = audio
    .listIds()
    .filter((id) => !used.has(id))
    .flatMap((id) => {
      const cell = cellOf(audio, id);
      return cell ? [{ ...cell, text: audio.meta(id)?.text ?? id }] : [];
    });

  // 같은 틀의 소리끼리 길이가 크게 다르면 소리 말고 길이로 답을 알 수 있다.
  const lengthChecks: LengthCheckView[] = [];
  const frames = [...new Set(PRACTICE_ITEMS.map((item) => item.stimulus.slice(0, 1)))];
  for (const column of COLUMNS) {
    for (const lead of frames) {
      const items = unitViews
        .filter((unit) => unit.kind === "pseudoword" && unit.text.startsWith(lead))
        .map((row) => ({ text: row.text, durationMs: row.cells[column.key]?.durationMs ?? null }));
      if (items.filter((item) => item.durationMs !== null).length >= 2) {
        lengthChecks.push({
          label: items.map((item) => item.text).join(" · "),
          column: column.key,
          items,
          spreadPct: spread(items.map((item) => item.durationMs)),
        });
      }
    }
    // Tier 1 낱말 짝(예: 기자 · 기차)
    const done = new Set<string>();
    for (const word of coreWords()) {
      const contrast = contrastOf(PRACTICE_GROUP_ID, word.word, word.consonant, word.stage);
      if (!contrast || contrast.tier !== 1 || done.has(contrast.pairGroupId)) continue;
      const members = [
        word,
        ...contrast.partners.flatMap((partner) =>
          coreWords().filter((row) => row.word === partner.word && row.consonant === partner.consonant),
        ),
      ];
      if (members.length < 2) continue;
      done.add(contrast.pairGroupId);
      const items = members.map((member) => {
        const unit = unitViews.find((row) => row.base === wordAudioBase(member));
        return { text: member.word, durationMs: unit?.cells[column.key]?.durationMs ?? null };
      });
      if (items.filter((item) => item.durationMs !== null).length >= 2) {
        lengthChecks.push({
          label: `${contrast.pairGroupId} · ${items.map((item) => item.text).join(" · ")}`,
          column: column.key,
          items,
          spreadPct: spread(items.map((item) => item.durationMs)),
        });
      }
    }
  }

  const all: AudioCellView[] = [
    ...unitViews.flatMap((unit) => Object.values(unit.cells).filter((cell): cell is AudioCellView => cell !== null)),
    ...auditions.flatMap((row) => [row.plain, row.flat].filter((cell): cell is AudioCellView => cell !== null)),
    ...others,
  ];
  const byVoice = new Map<string, number>();
  for (const cell of all) {
    const voice = cell.voice || "기록 없음";
    byVoice.set(voice, (byVoice.get(voice) ?? 0) + 1);
  }
  const times = all
    .map((cell) => cell.generatedAt)
    .filter(Boolean)
    .sort();

  return {
    rawDir,
    totals: {
      files: all.length,
      durationMs: all.reduce((sum, cell) => sum + (cell.durationMs ?? 0), 0),
      lastGeneratedAt: times.at(-1) ?? null,
      byVoice: [...byVoice.entries()].map(([voice, files]) => ({ voice, files })).sort((a, b) => b.files - a.files),
    },
    columns: COLUMNS,
    groups: groupViews,
    units: unitViews,
    auditions,
    others,
    lengthChecks,
    commands: [
      { label: "의사단어·첫 듣기 음절과 Stage 1 낱말·예문", command: "npm run tts:practice -- --stages 0,1 --voices charon,erinome,sulafat" },
      { label: "Stage 2~5 낱말·예문", command: "npm run tts:practice -- --stages 2,3,4,5 --voices charon,erinome,sulafat" },
      { label: "목소리 표본(평평한 낭독)", command: "npm run tts:auditions -- --flat" },
    ],
  };
}
