// 1단계 읽기 전용 콘텐츠 운영 화면 데이터 구성.
// DB 전환 전에는 저장소 JSON과 현재 음원 출처(PreviewAudio)에서 그대로 읽는다.
import { coreStageKey, coreWords, sentenceAudioBase, stageZeroCells, syllableAudioBase, wordAudioBase, type CoreWord } from "../../content/core-table.ts";
import { COURSE_ORDER, GROUP_CHOICES, GROUP_LABELS, type GroupId } from "../../content/course-order.ts";
import { stageTitle } from "../../content/course.ts";
import { groupPseudowords, groupStageZero, groupWords, isOtherGroup, type GroupWord, type OtherGroupId } from "../../content/group-tables.ts";
import { CONTENT_VOICES, voicedAudioId } from "../../content/practice-voices.ts";
import { PRACTICE_ITEMS } from "../../content/practice.ts";
import { turnsAudioId } from "../../content/tts/batch-plan.ts";
import type { PreviewAudio } from "../preview/audio.ts";
import type {
  ContentAudioCell,
  ContentItemView,
  ContentStageSection,
  ContentStageZeroRow,
  ContentTurnsCell,
  TeacherContentView,
} from "../preview/contract.ts";

const JCJ_STAGE_KEYS = ["Stage 1-A", "Stage 1-B", "Stage 2", "Stage 3", "Stage 4", "Stage 5"] as const;
const OTHER_STAGE_KEYS = ["Stage 1", "Stage 2", "Stage 3", "Stage 4", "Stage 5"] as const;

export function isGroupId(value: unknown): value is GroupId {
  return typeof value === "string" && (COURSE_ORDER as readonly string[]).includes(value);
}

function readAudioCell(audio: PreviewAudio, baseId: string, voiceKey: (typeof CONTENT_VOICES)[number]["key"]): ContentAudioCell {
  const audioId = voicedAudioId(baseId, voiceKey);
  const info = audio.info(audioId);
  const ref = info ? audio.inventoryRef(audioId) : null;
  if (!info || !ref) {
    return { state: "missing", assetId: null, audioId, playUrl: null, durationMs: null, generatedAt: null, source: null };
  }
  const meta = audio.meta(audioId);
  return {
    state: "approved",
    assetId: null,
    audioId,
    playUrl: `/api/sound/${encodeURIComponent(ref)}`,
    durationMs: info.durationMs,
    generatedAt: meta?.generatedAt || null,
    source: "import",
  };
}

function readVoiceMap(audio: PreviewAudio, baseId: string): Record<string, ContentAudioCell> {
  const out: Record<string, ContentAudioCell> = {};
  for (const voice of CONTENT_VOICES) {
    out[voice.key] = readAudioCell(audio, baseId, voice.key);
  }
  return out;
}

function readTurnsMap(audio: PreviewAudio, baseId: string): Record<string, ContentTurnsCell> {
  const out: Record<string, ContentTurnsCell> = {};
  for (const voice of CONTENT_VOICES) {
    const turnsId = turnsAudioId(voicedAudioId(baseId, voice.key));
    const info = audio.info(turnsId);
    const ref = info ? audio.inventoryRef(turnsId) : null;
    out[voice.key] = info && ref
      ? { ready: true, playUrl: `/api/sound/${encodeURIComponent(ref)}`, assetId: null, durationMs: info.durationMs }
      : { ready: false, playUrl: null, assetId: null, durationMs: null };
  }
  return out;
}

function rawWordCount(groupId: GroupId): number {
  return groupId === "j_ch_jj" ? coreWords().length : groupWords(groupId as OtherGroupId).length;
}

function toItemView(groupId: GroupId, word: CoreWord | GroupWord, sortOrder: number, audio: PreviewAudio): ContentItemView {
  const wordBase = wordAudioBase(word);
  const sentenceBase = sentenceAudioBase(word);
  const hasExample = word.example.trim().length > 0;
  return {
    id: word.id,
    legacyId: word.id,
    groupId,
    stage: word.stage,
    substage: word.substage,
    consonant: word.consonant,
    word: word.word,
    entryId: word.entryId,
    pos: word.pos,
    gloss: word.gloss,
    scene: word.scene,
    example: word.example,
    related: word.related,
    note: word.note,
    sortOrder,
    source: "roadmap_seed",
    status: "approved",
    wordAudio: readVoiceMap(audio, wordBase),
    exampleAudio: hasExample ? readVoiceMap(audio, sentenceBase) : null,
    turnsAudio: hasExample ? readTurnsMap(audio, sentenceBase) : null,
  };
}

function buildStageZero(groupId: GroupId, audio: PreviewAudio): ContentStageZeroRow[] {
  if (groupId === "j_ch_jj") {
    const pseudos: ContentStageZeroRow[] = PRACTICE_ITEMS.map((item) => ({
      id: `pseudo-${item.stimulus}`,
      groupId,
      kind: "pseudoword",
      consonant: item.target,
      stimulus: item.stimulus,
      word: null,
      context: "medial_vcv",
      audio: readVoiceMap(audio, syllableAudioBase(item.stimulus)),
    }));
    const initials: ContentStageZeroRow[] = stageZeroCells()
      .filter((cell) => cell.context !== "medial_vcv")
      .map((cell) => ({
        id: `cell-${cell.stimulus}-${cell.context}`,
        groupId,
        kind: "cell",
        consonant: cell.consonant,
        stimulus: cell.stimulus,
        word: cell.word,
        context: cell.context,
        audio: readVoiceMap(audio, syllableAudioBase(cell.stimulus)),
      }));
    return [...pseudos, ...initials];
  }

  const otherId = groupId as OtherGroupId;
  const words = groupWords(otherId);
  const choices = GROUP_CHOICES[groupId];
  const pseudos: ContentStageZeroRow[] = groupPseudowords(otherId).map((stimulus) => {
    const consonant = choices.find((ch) => stimulus.includes(ch)) ?? choices[0] ?? "";
    return {
      id: `pseudo-${stimulus}`,
      groupId,
      kind: "pseudoword",
      consonant,
      stimulus,
      word: null,
      context: "medial_vcv",
      audio: readVoiceMap(audio, syllableAudioBase(stimulus)),
    };
  });
  const initials: ContentStageZeroRow[] = groupStageZero(otherId)
    .filter((cell) => cell.context !== "medial_vcv")
    .map((cell) => {
      const matched = cell.word ? words.find((word) => word.word === cell.word) : undefined;
      const base = matched ? wordAudioBase(matched) : cell.word ? `word-0-${cell.word}` : syllableAudioBase(cell.stimulus);
      return {
        id: `cell-${cell.stimulus}-${cell.context}`,
        groupId,
        kind: "cell",
        consonant: cell.consonant,
        stimulus: cell.stimulus,
        word: cell.word,
        context: cell.context,
        audio: readVoiceMap(audio, base),
      };
    });
  return [...pseudos, ...initials];
}

export function buildReadOnlyContentView(groupId: GroupId, audio: PreviewAudio, ttsReady: boolean): TeacherContentView {
  const words = groupId === "j_ch_jj" ? coreWords() : isOtherGroup(groupId) ? groupWords(groupId) : [];
  const stageKeys = groupId === "j_ch_jj" ? JCJ_STAGE_KEYS : OTHER_STAGE_KEYS;

  const stages: ContentStageSection[] = stageKeys.map((key) => {
    const stageItems = words
      .map((word, index) => ({ word, sortOrder: index + 1 }))
      .filter(({ word }) => (groupId === "j_ch_jj" ? coreStageKey(word as CoreWord) === key : word.stage === key))
      .map(({ word, sortOrder }) => toItemView(groupId, word, sortOrder, audio));
    return {
      key,
      title: stageTitle(key),
      totalCount: stageItems.length,
      approvedCount: stageItems.length,
      draftCount: 0,
      items: stageItems,
      draftAudios: [],
    };
  });

  return {
    groups: COURSE_ORDER.map((id) => ({
      id,
      label: GROUP_LABELS[id],
      choices: [...GROUP_CHOICES[id]],
      count: rawWordCount(id),
    })),
    group: {
      id: groupId,
      label: GROUP_LABELS[groupId],
      choices: [...GROUP_CHOICES[groupId]],
    },
    stage0: buildStageZero(groupId, audio),
    stages,
    release: {
      latestSeq: null,
      latestReleasedAt: null,
      latestNote: null,
      pendingReviewCount: 0,
      draftItemCount: 0,
      draftAudioCount: 0,
      staleAudioCount: 0,
      unpublishedApprovedCount: 0,
      nextItemCount: 325,
      nextAudioCount: 0,
    },
    ttsReady,
    writable: false,
  };
}
