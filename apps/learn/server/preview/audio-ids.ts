// 학습 화면에서 재생할 수 있는 음원 id 목록. 이 목록 밖의 파일은 ref를 만들지 않는다.
import { PRACTICE_ITEMS, practiceWords } from "../../content/practice.ts";
import { PRACTICE_VOICES, voicedAudioId } from "../../content/practice-voices.ts";
import { coreWords, stageZeroCells, syllableAudioBase, wordAudioBase } from "../../content/core-table.ts";
import { AUDITION_VOICES, auditionAudioId, flatAuditionAudioId } from "../../content/voices.ts";

/** 학습 화면에서 재생할 수 있는 모든 음원 id */
export function previewAudioIds(): string[] {
  const ids = new Set<string>();
  const bases = new Set<string>();
  for (const item of PRACTICE_ITEMS) bases.add(item.audioId);
  for (const word of coreWords()) bases.add(wordAudioBase(word));
  for (const cell of stageZeroCells()) bases.add(syllableAudioBase(cell.stimulus));
  for (const word of practiceWords()) {
    bases.add(word.wordAudioId);
    if (word.exampleAudioId) bases.add(word.exampleAudioId);
    ids.add(word.legacyWordAudioId);
    if (word.legacyExampleAudioId) ids.add(word.legacyExampleAudioId);
  }
  for (const base of bases) {
    ids.add(base);
    for (const voice of PRACTICE_VOICES) ids.add(voicedAudioId(base, voice.key));
  }
  for (const voice of AUDITION_VOICES) {
    ids.add(auditionAudioId(voice.voice));
    ids.add(flatAuditionAudioId(voice.voice));
  }
  return [...ids];
}
