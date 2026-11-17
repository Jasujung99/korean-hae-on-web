import { useEffect, useState } from "react";
import type { VoicesView } from "../../../server/preview/contract.ts";
import { previewApi } from "../../preview/api";
import { usePractice } from "../../preview/PracticeContext";
import { LearnerFrame, Pill, ScreenTitle } from "../../ui";

const LISTEN_FOR = [
  "아자·아차·아짜 세 소리의 길이와 높낮이가 비슷한가요? 다르면 소리 말고 길이로 답을 알 수 있어요.",
  "끝이 감탄하듯 올라가거나 힘이 실리지 않나요?",
  "ㅊ의 바람 소리와 ㅉ의 된소리가 또렷하게 갈리나요?",
  "문장에서 한국어 발음이 자연스러운가요?",
];

export function VoicesScreen() {
  const practice = usePractice();
  const [view, setView] = useState<VoicesView | null>(null);
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    previewApi
      .voices()
      .then(setView)
      .catch(() => setFailed(true));
  }, []);

  const choose = async (voice: string) => {
    setSaving(true);
    try {
      setView(await previewApi.chooseVoice(voice));
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  };

  const readingCount = view?.voices.filter((voice) => voice.reading).length ?? 0;
  const shown = view ? view.voices.filter((voice) => showAll || voice.reading || view.chosen === voice.voice) : [];

  return (
    <LearnerFrame preview>
      <ScreenTitle title="목소리 고르기" />
      <section className="panel stack" aria-labelledby="voices-title">
        <div>
          <p className="eyebrow">대표 목소리 · 미리보기</p>
          <h2 id="voices-title">목소리 표본 듣기</h2>
          <p className="muted">
            같은 문장을 {view ? <span lang="en">{view.model}</span> : "TTS"}의 기본 목소리로 만들었어요. 목소리마다 평평한 낭독
            표본과 지시 없는 표본을 나란히 들어 보세요.
          </p>
        </div>
        {view ? (
          <div className="definition">
            <p className="small">표본 문장</p>
            <p>{view.sampleText}</p>
          </div>
        ) : null}

        {view ? (
          <div className="voice-guide">
            <p className="eyebrow">평평한 낭독 가이드</p>
            <p>
              연습 음원은 감정을 싣지 않고 평평하게 읽도록 톤 지시를 붙여 만들어요. 지시는 글자와 따로 보내서 소리로 읽히지
              않아요.
            </p>
            <p className="voice-style">
              <code lang="en">{view.flatStyle}</code>
              <span>중립적으로, 높낮이 없이 평평하게, 천천히 또렷하게 소리 내어 읽기</span>
            </p>
            <p className="small">들을 때 살펴볼 것</p>
            <ul>
              {LISTEN_FOR.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {failed ? <p className="notice">목소리 목록을 불러오지 못했어요.</p> : null}
        {view ? (
          <div className="mode-nav voice-filter" role="group" aria-label="목소리 범위">
            <button type="button" aria-pressed={!showAll} onClick={() => setShowAll(false)}>
              낭독 후보 {readingCount}
            </button>
            <button type="button" aria-pressed={showAll} onClick={() => setShowAll(true)}>
              전체 {view.voices.length}
            </button>
          </div>
        ) : null}
        {view ? (
          <ul className="voice-list">
            {shown.map((voice) => {
              const chosen = view.chosen === voice.voice;
              const busy = practice.playing !== null;
              return (
                <li key={voice.voice} className={chosen ? "is-chosen" : undefined}>
                  <div>
                    <strong lang="en">{voice.voice}</strong>
                    <small>
                      {voice.character}
                      {voice.note ? ` · ${voice.note}` : ""}
                    </small>
                  </div>
                  <div className="voice-actions">
                    <button
                      type="button"
                      className="primary"
                      onClick={() => void practice.playRole(voice.flatAudioRef, "voice", `${voice.voice} 평평 낭독`)}
                      disabled={!voice.flatAudioRef || busy}
                    >
                      {voice.flatAudioRef ? "평평 낭독" : "표본 없음"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void practice.playRole(voice.audioRef, "voice", `${voice.voice} 지시 없음`)}
                      disabled={!voice.audioRef || busy}
                    >
                      {voice.audioRef ? "지시 없음" : "표본 없음"}
                    </button>
                    <button type="button" aria-pressed={chosen} disabled={saving} onClick={() => void choose(voice.voice)}>
                      {chosen ? "✓ 고름" : "이 목소리로"}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : null}
        {view ? (
          <p className="small">
            성격 표시는 Google 문서의 영어 한 단어를 옮긴 것이라 한국어로 들으면 다를 수 있어요. 고른 목소리는 미리보기 기록으로만
            남고 운영용으로 확정하지 않아요. 정하면 연습 음원을 그 목소리와 평평한 낭독 지시로 다시 만들어야 해요. 지금 연습 음원은{" "}
            {view.practiceVoice}(지시 없음)이에요.
          </p>
        ) : null}
        <Pill tone="future">검수 전 초안 음원</Pill>
      </section>
    </LearnerFrame>
  );
}
