import { useEffect, useState } from "react";
import type { VoicesView } from "../../../server/preview/contract.ts";
import { previewApi } from "../../preview/api";
import { usePractice } from "../../preview/PracticeContext";
import { LearnerFrame, Pill, ScreenTitle } from "../../ui";

export function VoicesScreen() {
  const practice = usePractice();
  const [view, setView] = useState<VoicesView | null>(null);
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);

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

  return (
    <LearnerFrame preview>
      <ScreenTitle title="목소리 고르기" />
      <section className="panel stack" aria-labelledby="voices-title">
        <div>
          <p className="eyebrow">대표 목소리 · 미리보기</p>
          <h2 id="voices-title">목소리 표본 듣기</h2>
          <p className="muted">같은 문장을 여섯 목소리로 만들었어요. 들어 보고 연습에 쓸 목소리를 골라 주세요.</p>
        </div>
        {view ? (
          <div className="definition">
            <p className="small">표본 문장</p>
            <p>{view.sampleText}</p>
          </div>
        ) : null}
        {failed ? <p className="notice">목소리 목록을 불러오지 못했어요.</p> : null}
        {view ? (
          <ul className="voice-list">
            {view.voices.map((voice) => {
              const chosen = view.chosen === voice.voice;
              return (
                <li key={voice.voice} className={chosen ? "is-chosen" : undefined}>
                  <div>
                    <strong lang="en">{voice.voice}</strong>
                    <small>
                      {voice.character}
                      {voice.note ? ` · ${voice.note}` : ""}
                      {view.practiceVoice === voice.voice ? " · 지금 연습 음원" : ""}
                    </small>
                  </div>
                  <div className="voice-actions">
                    <button
                      type="button"
                      onClick={() => void practice.playRole(voice.audioRef, "voice", voice.voice)}
                      disabled={!voice.audioRef || practice.playing !== null}
                    >
                      {voice.audioRef ? "듣기" : "표본 없음"}
                    </button>
                    <button
                      type="button"
                      className={chosen ? undefined : "primary"}
                      aria-pressed={chosen}
                      disabled={saving}
                      onClick={() => void choose(voice.voice)}
                    >
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
            고른 목소리는 미리보기 기록으로만 남아요. 운영용 목소리로 확정하지 않았고, 정하면 연습 음원을 그 목소리로 다시 만들어야
            해요. 지금 연습 음원은 {view.practiceVoice}이에요.
          </p>
        ) : null}
        <Pill tone="future">검수 전 초안 음원</Pill>
      </section>
    </LearnerFrame>
  );
}
