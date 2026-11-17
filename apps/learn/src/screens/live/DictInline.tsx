// 사전 방식 A: 단어 카드 안에서 '사전 풀이'를 펼친다(2026-11-17 결정).
// 사전 자료는 아직 연결하지 않았다. 펼쳤을 때의 자리와 순서만 실제로 동작한다.
import { useId, useState } from "react";
import { track } from "../../preview/telemetry";

const LANGUAGES = ["Русский", "English", "Tiếng Việt", "中文"];

export function DictInline({ word, wordId, pos }: { word: string; wordId: string; pos: string }) {
  const [open, setOpen] = useState(false);
  const [language, setLanguage] = useState(LANGUAGES[0] as string);
  const panelId = useId();

  const toggle = () => {
    setOpen((value) => {
      if (!value) track("dictionary_opened", { wordId, mode: "inline" });
      return !value;
    });
  };

  return (
    <section className={open ? "dict-inline is-open" : "dict-inline"}>
      <button type="button" className="dict-inline-toggle" aria-expanded={open} aria-controls={panelId} onClick={toggle}>
        <span>사전 풀이</span>
        <span className="dict-inline-state">{open ? "접기" : "펼치기"}</span>
      </button>
      {open ? (
        <div id={panelId} className="dict-inline-panel">
          <div className="dict-inline-row">
            <p className="dict-inline-source">
              기초사전 <small>{pos || "품사"} · 등급</small>
            </p>
            <p className="dict-inline-empty">[ {word} — 한국어기초사전 뜻풀이가 들어올 자리 ]</p>
          </div>
          <div className="dict-inline-row">
            <p className="dict-inline-source">내 언어</p>
            <div className="dict-inline-langs" role="group" aria-label="내 언어 고르기">
              {LANGUAGES.map((name) => (
                <button key={name} type="button" aria-pressed={language === name} onClick={() => setLanguage(name)}>
                  {name}
                </button>
              ))}
            </div>
            <p className="dict-inline-empty">[ {language} 대역어가 들어올 자리 ]</p>
          </div>
          <div className="dict-inline-row">
            <p className="dict-inline-source">
              표준국어대사전 <small>원어 · {pos || "품사"}</small>
            </p>
            <p className="dict-inline-empty">[ {word} — 표준국어대사전 뜻풀이가 들어올 자리 ]</p>
          </div>
          <p className="dict-inline-note">아직 사전을 연결하지 않았어요. 연결하면 출처(국립국어원 한국어기초사전 · 표준국어대사전)를 여기에 적어요.</p>
        </div>
      ) : null}
    </section>
  );
}
