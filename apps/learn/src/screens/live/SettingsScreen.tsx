// 학습자 설정: 화면 모양, 사전 언어, 연습 목소리, 예문 읽기, 이 기기에서 나가기, 사전 자료 출처.
// 값은 학습자 id에 저장된다. 기기를 바꿔도 같은 설정으로 이어진다.
import { useEffect, useState } from "react";
import { useLocation } from "react-router";
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
  const location = useLocation();

  // 사전 풀이의 'CC BY-SA 2.0 KR' 링크(/settings#dict-license)로 들어오면 출처 칸으로 내려간다. 앱 안 이동은 해시로 스크롤하지 않아서 직접 부른다.
  useEffect(() => {
    if (location.hash !== "#dict-license") return;
    document.getElementById("dict-license")?.scrollIntoView?.({ block: "start" });
  }, [location.hash]);

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

      <fieldset className="acct-choice">
        <legend>예문 읽기</legend>
        <div className="mode-nav">
          <button type="button" aria-pressed={learner.exampleReading !== "turns"} onClick={() => void learner.change({ exampleReading: "spoken" })}>
            말하듯이
          </button>
          <button type="button" aria-pressed={learner.exampleReading === "turns"} onClick={() => void learner.change({ exampleReading: "turns" })}>
            또박또박
          </button>
        </div>
        <p className="small">말하듯이는 실제 대화처럼 자연스럽게, 또박또박은 문장마다 끊어 또렷하게 읽어요. 단어와 소리 연습에는 영향이 없어요.</p>
      </fieldset>

      <div className="acct-leave">
        <h3>이 기기에서 나가기</h3>
        <p className="small">함께 쓰는 기기라면 연습을 마친 뒤 나가 주세요. 기록은 지워지지 않아요.</p>
        <button type="button" className="ghost-danger" disabled={leaving} onClick={() => void leave()}>
          {leaving ? "나가는 중…" : "이 기기에서 나가기"}
        </button>
      </div>

      <section id="dict-license" className="acct-license" aria-labelledby="dict-license-title">
        <h3 id="dict-license-title">사전 자료 출처</h3>
        <p className="small">사전 풀이는 국립국어원 한국어기초사전과 표준국어대사전에서 옮겼어요.</p>
        <p className="small">크리에이티브 커먼즈 저작자표시-동일조건변경허락 2.0 대한민국 라이선스(CC BY-SA 2.0 KR)를 따라요.</p>
        <div className="acct-license-links">
          <a className="tc-ul" href="https://creativecommons.org/licenses/by-sa/2.0/kr/" target="_blank" rel="noopener noreferrer">
            라이선스 전문 보기
          </a>
          <a className="tc-ul" href="https://krdict.korean.go.kr/" target="_blank" rel="noopener noreferrer">
            한국어기초사전
          </a>
          <a className="tc-ul" href="https://stdict.korean.go.kr/" target="_blank" rel="noopener noreferrer">
            표준국어대사전
          </a>
        </div>
      </section>
    </section>
  );
}
