import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import type { WordView } from "../../../server/preview/contract.ts";
import { previewApi } from "../../preview/api";
import { usePractice } from "../../preview/PracticeContext";
import { track } from "../../preview/telemetry";
import { ScreenTitle } from "../../ui";
import { DictInline } from "../live/DictInline";
import { Blade, StripLink } from "./parts";

// 03 새 단어. 사전은 방식 A(카드 안에서 펼치기)로 둔다.
export function CanvasWords() {
  const practice = usePractice();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [words, setWords] = useState<WordView[] | null>(null);
  const [failed, setFailed] = useState(false);

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
        <p className="c-body">미리보기 서버에 닿지 못했어요. 잠시 뒤 다시 열어 주세요.</p>
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

  const saved = practice.saved.includes(word.id);
  const busy = practice.playing !== null;

  return (
    <div className="c-page">
      <ScreenTitle title={`${word.word} · 새 단어`} />
      <div className="c-top">
        <p className="c-label">
          <span className="c-num sm">03</span> 새 단어
        </p>
        <p className="c-count">뜻·예문은 검수 전 초안</p>
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
              {word.pos ? ` · ${word.pos}` : ""}
            </p>
          </div>
          <button
            type="button"
            className="c-round sm"
            onClick={() => void practice.playRole(word.wordAudioRef, "word", word.word)}
            disabled={busy || !word.wordAudioRef}
          >
            {practice.playing === "word" ? "듣는 중" : word.wordAudioRef ? "듣기" : "준비 중"}
          </button>
        </div>
        <div className="c-line" />
        <div>
          <p className="c-label">뜻</p>
          <p className="c-body">{word.gloss || "아직 뜻 초안이 없어요."}</p>
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
        <DictInline word={word.word} wordId={word.id} pos={word.pos} />
      </article>

      {word.example ? (
        <div className="c-example">
          <p className="c-label">예문 · {word.scene}</p>
          <p className="c-key">{word.example}</p>
          <button
            type="button"
            className="c-link"
            onClick={() => void practice.playRole(word.exampleAudioRef, "example", word.example)}
            disabled={busy || !word.exampleAudioRef}
          >
            {practice.playing === "example" ? "예문 듣는 중" : word.exampleAudioRef ? "예문 듣기" : "예문 음원 준비 중"}
          </button>
        </div>
      ) : (
        <p className="c-body">예문이 아직 없는 단어예요.</p>
      )}
      {word.related ? (
        <p className="c-body">
          <span className="c-label">함께 쓰는 표현 </span>
          {word.related}
        </p>
      ) : null}

      <button type="button" className="c-keep" aria-pressed={saved} onClick={() => practice.toggleWord(word.id)}>
        {saved ? "내 말에 담았어요" : "내 말에 담기"}
      </button>
      <StripLink onClick={() => navigate("/finish")}>학습 리포트 보기</StripLink>
      <p className="c-foot">
        <Link to="/listen">소리 익히기로 돌아가기</Link> · 담은 단어는 이 미리보기 안에서만 남아요
      </p>
    </div>
  );
}
