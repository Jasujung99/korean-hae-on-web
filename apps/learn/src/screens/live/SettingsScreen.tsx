// 학습자 설정: 화면 모양, 사전 언어, 연습 목소리, 이 기기에서 나가기.
// 값은 학습자 id에 저장된다. 기기를 바꿔도 같은 설정으로 이어진다.
import { useState } from "react";
import { accountApi } from "../../preview/api";
import { usePractice } from "../../preview/PracticeContext";
import { useLearner } from "../../preview/settings";
import { resetTelemetry, flushEvents } from "../../preview/telemetry";
import { ScreenTitle } from "../../ui";

export function SettingsScreen() {
  const learner = useLearner();
  const practice = usePractice();
  const [leaving, setLeaving] = useState(false);
  const voices = learner.me?.practiceVoices ?? [];

  const chooseVoice = async (key: string) => {
    await learner.change({ practiceVoice: key });
    await practice.refreshSession();
  };

  const leave = async () => {
    if (!window.confirm("이 기기에서 나갈까요? 학습 기록은 그대로 남고, 다시 들어오려면 선생님에게 새 링크를 받아야 해요.")) return;
    setLeaving(true);
    try {
      await flushEvents();
      await accountApi.leave();
    } finally {
      resetTelemetry();
      window.location.assign("/");
    }
  };

  return (
    <section className="panel stack acct-settings" aria-labelledby="settings-title">
      <ScreenTitle title="설정" />
      <p className="eyebrow">{learner.me?.learner.nickname} 님</p>
      <h2 id="settings-title">설정</h2>

      <fieldset className="acct-choice">
        <legend>화면 모양</legend>
        <div className="mode-nav">
          <button type="button" aria-pressed={learner.style === "canvas"} onClick={() => void learner.change({ style: "canvas" })}>
            캔버스
          </button>
          <button type="button" aria-pressed={learner.style === "proto"} onClick={() => void learner.change({ style: "proto" })}>
            시안
          </button>
        </div>
        <p className="small">캔버스는 공책처럼 넘기는 화면, 시안은 단계가 차례로 보이는 화면이에요.</p>
      </fieldset>

      <fieldset className="acct-choice">
        <legend>사전에서 볼 언어</legend>
        <div className="mode-nav">
          <button type="button" aria-pressed={learner.dictLanguage === "ru"} onClick={() => void learner.change({ dictLanguage: "ru" })}>
            Русский
          </button>
          <button type="button" aria-pressed={learner.dictLanguage === "en"} onClick={() => void learner.change({ dictLanguage: "en" })}>
            English
          </button>
        </div>
      </fieldset>

      <fieldset className="acct-choice">
        <legend>연습 목소리</legend>
        <div className="practice-voice-list" role="radiogroup" aria-label="연습 목소리">
          {voices.map((row) => {
            const on = learner.practiceVoice === row.key;
            return (
              <div key={row.key} className={on ? "practice-voice is-on" : "practice-voice"}>
                <button type="button" role="radio" aria-checked={on} onClick={() => void chooseVoice(row.key)}>
                  <span>{row.label}</span>
                  <small>{row.note}</small>
                </button>
                <button
                  type="button"
                  className="text-link"
                  disabled={!row.sampleRef || practice.playing !== null}
                  onClick={() => void practice.playRole(row.sampleRef, "voice", row.voice)}
                >
                  {row.sampleRef ? "들어 보기" : "음원 준비 중"}
                </button>
              </div>
            );
          })}
        </div>
      </fieldset>

      <div className="acct-leave">
        <h3>이 기기에서 나가기</h3>
        <p className="small">함께 쓰는 기기라면 연습을 마친 뒤 나가 주세요. 기록은 지워지지 않아요.</p>
        <button type="button" className="ghost-danger" disabled={leaving} onClick={() => void leave()}>
          {leaving ? "나가는 중…" : "이 기기에서 나가기"}
        </button>
      </div>
    </section>
  );
}
