import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import type { WordView } from "../../../server/preview/contract.ts";
import { previewApi } from "../../preview/api";
import { usePractice } from "../../preview/PracticeContext";
import { track } from "../../preview/telemetry";
import { LearnerFrame, Pill, ScreenTitle } from "../../ui";
import { DictInline } from "./DictInline";

export function WordsLive() {
  const practice = usePractice();
  const [params, setParams] = useSearchParams();
  const [words, setWords] = useState<WordView[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    previewApi
      .words()
      .then(({ words: list }) => setWords(list))
      .catch(() => setFailed(true));
  }, []);

  const selectedId = params.get("word");
  const word = words?.find((row) => row.id === selectedId) ?? words?.[0] ?? null;

  useEffect(() => {
    if (word) track("word_viewed", { wordId: word.id });
  }, [word]);


  if (failed || (words && words.length === 0)) {
    return (
      <LearnerFrame preview>
        <ScreenTitle title="사전·예문" />
        <section className="panel stack">
          <h2>단어를 불러오지 못했어요.</h2>
          <p className="notice">미리보기 서버에 닿지 못했어요. 잠시 뒤 다시 열어 주세요.</p>
        </section>
      </LearnerFrame>
    );
  }

  if (!words || !word) {
    return (
      <LearnerFrame preview>
        <ScreenTitle title="사전·예문" />
        <section className="panel stack">
          <p className="muted">단어를 불러오고 있어요…</p>
        </section>
      </LearnerFrame>
    );
  }

  const saved = practice.saved.includes(word.id);
  const busy = practice.playing !== null;

  return (
    <LearnerFrame preview>
      <ScreenTitle title={`${word.word} · 사전·예문`} />
      <section className="panel stack" aria-labelledby="dictionary-title">
        <div className="row">
          <Link className="text-link" to="/practice">
            ← 듣기 퀴즈
          </Link>
          <Pill tone="future">사전·예문 확장 시안</Pill>
        </div>
        <div className="library-links" role="group" aria-label="살펴볼 단어">
          {words.map((row) => (
            <button
              key={row.id}
              type="button"
              aria-pressed={row.id === word.id}
              onClick={() => setParams({ word: row.id }, { replace: true })}
            >
              {row.word}
            </button>
          ))}
        </div>
        <div>
          <p className="small">
            생활 어휘 · {word.positionLabel} {word.consonant}
            {word.substage ? ` · ${word.substage}` : ""}
            {word.pos ? ` · ${word.pos}` : ""}
          </p>
          <h2 id="dictionary-title" className="dict-word">
            {word.word}
          </h2>
        </div>
        <div className="definition">
          <p className="small">뜻 · 학습용 초안, 검수 전</p>
          <p>{word.gloss || "아직 뜻 초안이 없어요."}</p>
        </div>
        {word.partners.length > 0 ? (
          <div className="pair-row">
            <p className="pair-label">
              비교해 들을 말 · {word.stepLabel}
              {word.pairGroupId ? ` · ${word.pairGroupId}` : ""}
            </p>
            <div className="pair-words" role="group" aria-label={`${word.word}와 비교해 들을 말`}>
              {word.partners.map((partner) => (
                <button
                  key={`${partner.consonant}-${partner.word}`}
                  type="button"
                  disabled={busy || !partner.audioRef}
                  onClick={() => void practice.playRole(partner.audioRef, "word", partner.word)}
                >
                  <b>{partner.consonant}</b> {partner.word}
                  {partner.audioRef ? "" : " · 음원 준비 중"}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        <DictInline word={word.word} wordId={word.id} pos={word.pos} dict={word.dict} />
        <button
          type="button"
          onClick={() => void practice.playRole(word.wordAudioRef, "word", word.word)}
          disabled={busy || !word.wordAudioRef}
        >
          {practice.playing === "word" ? "단어 듣는 중…" : word.wordAudioRef ? "단어 듣기" : "단어 듣기 · 음원 준비 중"}
        </button>
        {word.example ? (
          <>
            <div className="example">
              <span className="small">예문 · {word.scene}</span>
              <p>{word.example}</p>
            </div>
            {word.exampleVoice && word.wordVoice && word.exampleVoice !== word.wordVoice ? (
            <p className="small">예문 음원은 아직 {word.exampleVoice} 목소리(예전 초안)만 있어서 낱말과 목소리가 달라요.</p>
          ) : null}

            <button
              type="button"
              onClick={() => void practice.playRole(word.exampleAudioRef, "example", word.example)}
              disabled={busy || !word.exampleAudioRef}
            >
              {practice.playing === "example" ? "예문 듣는 중…" : word.exampleAudioRef ? "예문 듣기" : "예문 듣기 · 음원 준비 중"}
            </button>
          </>
        ) : (
          <p className="notice">주어진 예문이 아직 없는 단어예요. 예문은 검수된 자료가 들어오면 붙여요.</p>
        )}
        {word.extraExamples.length + word.moreExamples.length > 0 ? (
          <details className="more-examples">
            <summary>예문 더 보기 ({word.extraExamples.length + word.moreExamples.length})</summary>
            {[
              ...word.extraExamples.map((extra) => ({ key: `e${extra.index}`, label: `예문 ${extra.index}`, text: extra.text, audioRef: extra.audioRef })),
              ...word.moreExamples.map((more, index) => ({ key: `m${index}`, label: `${more.groupLabel} 연습 예문`, text: more.text, audioRef: more.audioRef })),
            ].map((row) => (
              <div key={row.key} className="stack">
                <div className="example">
                  <span className="small">{row.label}</span>
                  <p>{row.text}</p>
                </div>
                <button
                  type="button"
                  onClick={() => void practice.playRole(row.audioRef, "example_more", row.text)}
                  disabled={busy || !row.audioRef}
                >
                  {row.audioRef ? "이 예문 듣기" : "이 예문 듣기 · 음원 준비 중"}
                </button>
              </div>
            ))}
          </details>
        ) : null}
        {word.related ? (
          <div>
            <h3>함께 쓰는 표현</h3>
            <p className="muted">{word.related}</p>
          </div>
        ) : null}
        <button type="button" className={saved ? undefined : "primary"} onClick={() => practice.toggleWord(word.id)}>
          {saved ? "✓ 내 단어에 담았어요" : "내 단어에 담기"}
        </button>
        <p className="small">
          뜻·예문은 PR #5 로드맵의 설계용 초안이며, 공개 전 검수가 필요해요. 단어 담기는 이 미리보기 안에서만 유지돼요.
          '사전 풀이'는 국립국어원 사전에서 받아 사람이 검수한 항목만 학습자에게 보여요.
        </p>
      </section>
    </LearnerFrame>
  );
}
