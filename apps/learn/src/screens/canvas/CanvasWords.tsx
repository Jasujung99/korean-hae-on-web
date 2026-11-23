import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import type { WordView } from "../../../server/preview/contract.ts";
import { previewApi } from "../../preview/api";
import { usePractice } from "../../preview/PracticeContext";
import { track } from "../../preview/telemetry";
import { ScreenTitle } from "../../ui";
import { DictTabs } from "./DictTabs";
import { Blade, StripLink } from "./parts";

// 03 새 단어. 사전은 방식 A(카드 안에서 펼치기)로 둔다.
export function CanvasWords() {
  const practice = usePractice();
  const navigate = useNavigate();
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

  const word = words?.find((row) => row.id === params.get("word")) ?? words?.[0] ?? null;

  useEffect(() => {
    if (word) track("word_viewed", { wordId: word.id });
  }, [word]);

  if (failed || (words && words.length === 0)) {
    return (
      <div className="c-page">
        <ScreenTitle title="새 단어" />
        <h2 className="c-title">단어를 불러오지 못했어요.</h2>
        <p className="c-body">인터넷 연결을 확인하고 잠시 뒤 다시 열어 주세요.</p>
      </div>
    );
  }
  if (!words || !word) {
    return (
      <div className="c-page">
        <ScreenTitle title="새 단어" />
        <p className="c-label">단어를 불러오고 있어요…</p>
      </div>
    );
  }

  const busy = practice.playing !== null;

  return (
    <div className="c-page">
      <ScreenTitle title={`${word.word} · 새 단어`} />
      <div className="c-top">
        <p className="c-label">
          <span className="c-num sm">03</span> 새 단어
        </p>
      </div>

      <div className="c-words" role="group" aria-label="살펴볼 단어">
        {words.map((row) => (
          <button key={row.id} type="button" aria-pressed={row.id === word.id} onClick={() => setParams({ word: row.id }, { replace: true })}>
            {row.word}
            {row.id === word.id ? <Blade /> : <span className="blade-gap" />}
          </button>
        ))}
      </div>

      <article className="c-card">
        <div className="c-card-head">
          <div>
            <h2 className="c-word">{word.word}</h2>
            <p className="c-label">
              {word.positionLabel} {word.consonant}
            </p>
          </div>
          <button
            type="button"
            className="c-round sm"
            onClick={() => {
              setActive(null);
              void practice.playRole(word.wordAudioRef, "word", word.word);
            }}
            disabled={busy || !word.wordAudioRef}
          >
            {practice.playing === "word" && active === null ? "듣는 중" : word.wordAudioRef ? "듣기" : "준비 중"}
          </button>
        </div>
        <div className="c-line" />
        <div>
          <p className="c-label">뜻</p>
          <p className="c-body">{word.gloss || "뜻을 준비하고 있어요."}</p>
        </div>
        {word.partners.length > 0 ? (
          <div className="pair-row is-inline">
            <p className="pair-label">비교해 보세요.</p>
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
        <DictTabs word={word.word} wordId={word.id} pos={word.pos} dict={word.dict} />
      </article>

      {word.example ? (
        <div className="c-example">
          <p className="c-label">예문 · {word.scene}</p>
          <p className="c-key">{word.example}</p>
        </div>
      ) : (
        <p className="c-body">예문이 아직 없는 단어예요.</p>
      )}

      <section className="c-voices" aria-labelledby="c-voices-title">
        <h3 id="c-voices-title" className="c-voices-title">서로 다른 목소리로</h3>
        <div className="c-voices-grid">
          <span />
          {word.voices.map((voice) => (
            <span key={voice.key} className="c-voices-head">
              {voice.label}
            </span>
          ))}
          {(
            [
              { kind: "word", label: "단어", text: word.word },
              ...(word.example ? [{ kind: "example", label: "예문", text: word.example }] : []),
            ] as Array<{ kind: "word" | "example"; label: string; text: string }>
          ).map((row) => (
            <div key={row.kind} className="c-voices-row" role="group" aria-label={`${row.label} 듣기`}>
              <span className="c-voices-rowlabel">{row.label}</span>
              {word.voices.map((voice) => {
                const ref = row.kind === "word" ? voice.wordRef : voice.exampleRef;
                const key = `${row.kind}:${voice.key}`;
                const on = practice.playing === row.kind && active === key;
                return (
                  <button
                    key={voice.key}
                    type="button"
                    className={`c-voice-btn is-${row.kind}${on ? " is-on" : ""}`}
                    aria-label={`${voice.label} ${row.label} 듣기`}
                    disabled={busy || !ref}
                    onClick={() => {
                      setActive(key);
                      void practice.playRole(ref, row.kind, row.text);
                    }}
                  >
                    {on ? "듣는 중" : ref ? <span aria-hidden="true">▶</span> : "준비 중"}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </section>
      {word.extraExamples.length + word.moreExamples.length > 0 ? (
        <details className="c-more-examples">
          <summary className="c-link">예문 더 보기 ({word.extraExamples.length + word.moreExamples.length})</summary>
          {[
            ...word.extraExamples.map((extra) => ({ key: `e${extra.index}`, label: `예문 ${extra.index}`, text: extra.text, audioRef: extra.audioRef })),
            ...word.moreExamples.map((more, index) => ({ key: `m${index}`, label: `${more.groupLabel} 연습 예문`, text: more.text, audioRef: more.audioRef })),
          ].map((row) => (
            <div key={row.key} className="c-example">
              <p className="c-label">{row.label}</p>
              <p className="c-key">{row.text}</p>
              <button
                type="button"
                className="c-link"
                onClick={() => void practice.playRole(row.audioRef, "example_more", row.text)}
                disabled={busy || !row.audioRef}
              >
                {row.audioRef ? "이 예문 듣기" : "예문 음원 준비 중"}
              </button>
            </div>
          ))}
        </details>
      ) : null}
      {word.related ? (
        <p className="c-body">
          <span className="c-label">함께 쓰는 표현 </span>
          {word.related}
        </p>
      ) : null}

      {/* '내 말에 담기'는 아직 서버에 저장되지 않아 새로고침하면 사라진다. 저장을 만들 때까지 숨긴다. */}
      <StripLink onClick={() => navigate("/finish")}>학습 리포트 보기</StripLink>
      <p className="c-foot">
        <Link to="/listen">소리 익히기로 돌아가기</Link>
      </p>
    </div>
  );
}
