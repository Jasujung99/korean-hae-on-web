import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import type { WordView } from "../../../server/preview/contract.ts";
import { previewApi } from "../../preview/api";
import { usePractice } from "../../preview/PracticeContext";
import { track } from "../../preview/telemetry";
import { LearnerFrame, Pill, ScreenTitle } from "../../ui";
import { DictSlot } from "./DictSlot";

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

  const railSlot = <DictSlot option="B" className="in-rail" />;

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
    <LearnerFrame preview railExtra={railSlot}>
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
        <DictSlot option="A" />
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
            <DictSlot option="C">
              <p className="dict-slot-demo" aria-hidden="true">
                {word.example.split(" ").map((token, position) => (
                  <span key={`${token}-${position}`}>{token}</span>
                ))}
              </p>
            </DictSlot>
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
        {word.related ? (
          <div>
            <h3>함께 쓰는 표현</h3>
            <p className="muted">{word.related}</p>
          </div>
        ) : null}
        <button type="button" className={saved ? undefined : "primary"} onClick={() => practice.toggleWord(word.id)}>
          {saved ? "✓ 내 단어에 담았어요" : "내 단어에 담기"}
        </button>
        <DictSlot option="B" className="in-flow" />
        <DictSlot option="D">
          <div className="dict-slot-links" aria-hidden="true">
            <span>한국어기초사전</span>
            <span>표준국어대사전</span>
            <span>네이버 국어사전</span>
          </div>
        </DictSlot>
        <p className="small">
          뜻·예문은 PR #5 로드맵의 설계용 초안이며, 공개 전 검수가 필요해요. 단어 담기는 이 미리보기 안에서만 유지돼요.
          사전 내용은 아직 넣지 않았고, 점선 상자는 넣을 수 있는 자리와 방식이에요.
        </p>
      </section>
    </LearnerFrame>
  );
}
