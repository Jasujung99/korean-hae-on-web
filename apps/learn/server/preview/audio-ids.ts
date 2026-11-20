// 학습 화면에서 재생할 수 있는 음원 id 목록. 이 목록 밖의 파일은 ref를 만들지 않는다.
import { syllableAudioBase } from "../../content/core-table.ts";
import { PRACTICE_ITEMS, practiceWords } from "../../content/practice.ts";
import { PRACTICE_VOICES, voicedAudioId } from "../../content/practice-voices.ts";
import {
  snapshotFromReferenceJson,
  snapshotSentenceAudioBase,
  snapshotStageZero,
  snapshotWordAudioBase,
  snapshotWords,
  type ContentSnapshot,
  type SnapshotStageZero,
  type SnapshotWord,
} from "../../content/snapshot.ts";
import { turnsAudioId } from "../../content/tts/batch-plan.ts";
import { AUDITION_VOICES, auditionAudioId, flatAuditionAudioId } from "../../content/voices.ts";

/** 학습 화면에서 재생할 수 있는 모든 음원 id */
export function previewAudioIds(snapshot: ContentSnapshot = snapshotFromReferenceJson()): string[] {
  const ids = new Set<string>();
  const bases = new Set<string>();
  for (const item of PRACTICE_ITEMS) bases.add(item.audioId);
  for (const word of snapshotWords(snapshot, "j_ch_jj")) bases.add(snapshotWordAudioBase(word));
  for (const cell of snapshotStageZero(snapshot, "j_ch_jj")) bases.add(syllableAudioBase(cell.stimulus));
  for (const word of practiceWords(snapshot)) {
    bases.add(word.wordAudioId);
    if (word.exampleAudioId) bases.add(word.exampleAudioId);
    if (word.legacyWordAudioId) ids.add(word.legacyWordAudioId);
    if (word.legacyExampleAudioId) ids.add(word.legacyExampleAudioId);
  }
  for (const word of snapshotWords(snapshot, "j_ch_jj")) {
    if (word.example) bases.add(snapshotSentenceAudioBase(word));
  }
  for (const base of bases) {
    ids.add(base);
    for (const voice of PRACTICE_VOICES) {
      ids.add(voicedAudioId(base, voice.key));
      // 예문 '또박또박' 버전
      if (base.startsWith("sentence-")) ids.add(turnsAudioId(voicedAudioId(base, voice.key)));
    }
  }
  for (const voice of AUDITION_VOICES) {
    ids.add(auditionAudioId(voice.voice));
    ids.add(flatAuditionAudioId(voice.voice));
  }
  return [...ids];
}

/** 다섯 묶음 전체(ㅈ·ㅊ·ㅉ + ㅅ·ㅆ + ㄱ·ㅋ·ㄲ + ㅂ·ㅍ·ㅃ + ㄷ·ㅌ·ㄸ)에서 만들거나 올릴 음원 id */
export function allContentAudioIds(
  words: readonly Pick<SnapshotWord, "id" | "entryId" | "word" | "example" | "groupId" | "stage">[],
  stage0: readonly Pick<SnapshotStageZero, "groupId" | "stimulus" | "word" | "kind">[],
): string[] {
  const ids = new Set<string>();
  const bases = new Set<string>();

  for (const item of PRACTICE_ITEMS) bases.add(item.audioId);
  for (const row of stage0) {
    if (row.kind === "pseudoword") {
      bases.add(syllableAudioBase(row.stimulus));
    } else if (!row.word || row.stimulus !== row.word) {
      bases.add(syllableAudioBase(row.stimulus));
    } else {
      const matched = words.find((w) => w.groupId === row.groupId && w.word === row.word);
      bases.add(matched ? snapshotWordAudioBase(matched) : `word-0-${row.word}`);
    }
  }
  for (const word of words) {
    bases.add(snapshotWordAudioBase(word));
    if (word.example) bases.add(snapshotSentenceAudioBase(word));
    if (word.groupId === "j_ch_jj" && word.stage === "Stage 1" && word.entryId !== null) {
      ids.add(`word-Stage1-${word.entryId}-${word.word}`);
      if (word.example) ids.add(`sentence-Stage1-${word.entryId}-${word.word}`);
    }
  }
  for (const base of bases) {
    ids.add(base);
    for (const voice of PRACTICE_VOICES) {
      ids.add(voicedAudioId(base, voice.key));
      if (base.startsWith("sentence-")) ids.add(turnsAudioId(voicedAudioId(base, voice.key)));
    }
  }
  for (const voice of AUDITION_VOICES) {
    ids.add(auditionAudioId(voice.voice));
    ids.add(flatAuditionAudioId(voice.voice));
  }
  return [...ids];
}
