import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import type { WordView } from "../../../server/preview/contract.ts";
import { previewApi } from "../../preview/api";
import { usePractice } from "../../preview/PracticeContext";
import { track } from "../../preview/telemetry";
import { LearnerFrame, ScreenTitle } from "../../ui";
import { DictInline } from "./DictInline";
import { PlayIcon } from "../PlayIcon";

export function WordsLive() {
  const practice = usePractice();
  const [params, setParams] = useSearchParams();
  const [words, setWords] = useState<WordView[] | null>(null);
  const [failed, setFailed] = useState(false);
  // 목소리 칸 가운데 지금 재생 중인 칸("word:charon" 꼴)
  const [active, setActive] = useState<string | null>(null);

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
          <p className="notice">인터넷 연결을 확인하고 잠시 뒤 다시 열어 주세요.</p>
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
          <p className="small">뜻</p>
          <p>{word.gloss || "뜻을 준비하고 있어요."}</p>
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
        <VoiceRow title="단어 듣기" kind="word" text={word.word} word={word} active={active} setActive={setActive} />
        {word.example ? (
          <>
            <div className="example">
              <span className="small">예문 · {word.scene}</span>
              <p>{word.example}</p>
            </div>
            <VoiceRow title="예문 듣기" kind="example" text={word.example} word={word} active={active} setActive={setActive} />
          </>
        ) : (
          <p className="notice">예문이 아직 없는 단어예요.</p>
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
      </section>
    </LearnerFrame>
  );
}

/** 목소리 세 칸(남성 · 여성(1) · 여성(2)). 재생 중인 칸은 재생 표시 대신 점 세 개가 움직인다. */
function VoiceRow({
  title,
  kind,
  text,
  word,
  active,
  setActive,
}: {
  title: string;
  kind: "word" | "example";
  text: string;
  word: WordView;
  active: string | null;
  setActive: (key: string) => void;
}) {
  const practice = usePractice();
  const busy = practice.playing !== null;
  return (
    <div className="voice-row">
      <p className="voice-row-title">{title}</p>
      <div className={`voice-seg is-${kind}`} role="group" aria-label={title}>
        {word.voices.map((voice) => {
          const ref = kind === "word" ? voice.wordRef : voice.exampleRef;
          const key = `${kind}:${voice.key}`;
          const on = practice.playing === kind && active === key;
          return (
            <button
              key={voice.key}
              type="button"
              className={on ? "is-on" : undefined}
              aria-label={`${voice.label} ${title}${on ? " · 듣는 중" : ref ? "" : " · 준비 중"}`}
              disabled={busy || !ref}
              onClick={() => {
                setActive(key);
                void practice.playRole(ref, kind, text);
              }}
            >
              {on ? (
                <span className="voice-dots" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
              ) : ref ? (
                <PlayIcon />
              ) : (
                <span aria-hidden="true">–</span>
              )}
              <span>{voice.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
